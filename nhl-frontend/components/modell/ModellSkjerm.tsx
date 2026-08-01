'use client';

/**
 * Modell (§C.6) — hele skjermen.
 *
 * Argumentet: modellen er systematisk overkonfident, og EV er derfor ikke
 * informativ om faktisk avkastning. Alt på skjermen er der for å gjøre det
 * synlig, og for å ha et sted der vi løpende kan se om kalibreringen bedrer seg.
 *
 * To gjennomgående regler fra issue #7:
 *   1. Kun avregnede spill. `pending` har ikke noe utfall å måle.
 *   2. OT/SO-toggelen styrer HELE skjermen, ikke én figur.
 *
 * `analyze()` kjører 10 000 bootstrap-trekninger per regel og 10 000
 * permutasjoner per korrelasjon. Den ligger i én `useMemo` med
 * `[spill, utenDraw]` som nøkkel — den skal kjøre én gang per toggling, ikke
 * per render.
 */

import { useMemo, useState } from 'react';
import {
    analyze,
    profitPerKrone,
    settledBets,
    type AnalysisBet,
    type CorrelationResult,
} from '@/lib/analysis';
import { usePortfolio } from '@/lib/use-data';
import { ErrorState, Laster, PillGroup, SectionHeading } from '@/components/ui';
import { MANGLER, nf, odds as fmtOdds, pc } from '@/lib/format';
import type { BetEntry } from '@/types';
import { Kalibrering, type UtfallsRad } from './Kalibrering';
import { KvartilFigur } from './KvartilFigur';
import { Simulator } from './Simulator';
import { Funn } from './Funn';
import styles from './Modell.module.css';

/** Stabil referanse — ellers ville `useMemo` sett en ny tom liste hver render. */
const INGEN_SPILL: readonly BetEntry[] = [];

type Utvalg = 'alle' | 'utenDraw';

const UTFALLSREKKEFØLGE: readonly { nokkel: string; navn: string }[] = [
    { nokkel: 'home', navn: 'Hjemmeseier' },
    { nokkel: 'away', navn: 'Borteseier' },
    { nokkel: 'draw', navn: 'OT/SO' },
];

function utfallsRader(spill: readonly AnalysisBet[]): UtfallsRad[] {
    return UTFALLSREKKEFØLGE.map(({ nokkel, navn }) => {
        const rader = spill.filter((b) => b.selection === nokkel);
        return {
            nokkel,
            navn,
            n: rader.length,
            modell: rader.reduce((s, b) => s + b.model_prob, 0),
            marked: rader.reduce((s, b) => s + b.implied_prob, 0),
            treff: rader.filter((b) => b.status === 'won').length,
            netto: rader.reduce((s, b) => s + b.stake * profitPerKrone(b), 0),
        };
    }).filter((r) => r.n > 0);
}

/** `r = −0,083 (p = 0,24)`. Tallene kommer fra `correlationTest`, aldri hardkodet. */
function korrelasjon(c: CorrelationResult): string {
    return `r = ${nf(c.r, 3)} (p = ${nf(c.p_value, 2)})`;
}

/**
 * `BetEntry.home_abbr` er `string | null | undefined`, `AnalysisBet.home_abbr`
 * er `string | undefined`. Feltene brukes bare til stabil sortering, og
 * `compareBets` leser dem med `?? ''`, så konverteringen er atferdsnøytral.
 * Den hører egentlig hjemme i `types/index.ts` eller `lib/analysis.ts`, men de
 * ligger utenfor denne skjermens filsone.
 */
function tilAnalyse(spill: readonly BetEntry[]): AnalysisBet[] {
    return spill.map((b) => ({
        ...b,
        home_abbr: b.home_abbr ?? undefined,
        away_abbr: b.away_abbr ?? undefined,
    }));
}

/* -------------------------------------------------------------------------- */

export function ModellSkjerm() {
    const portefølje = usePortfolio();
    const [utvalg, setUtvalg] = useState<Utvalg>('alle');
    const utenDraw = utvalg === 'utenDraw';

    const alleSpill = useMemo(
        () => tilAnalyse(portefølje.data?.bets ?? INGEN_SPILL),
        [portefølje.data],
    );

    const datoer = useMemo(
        () => (portefølje.data?.timeseries ?? []).map((t) => t.date),
        [portefølje.data],
    );

    // Tellingene i toggelen skal stå fast uansett hva som er valgt.
    const antall = useMemo(
        () => ({
            alle: settledBets(alleSpill).length,
            utenDraw: settledBets(alleSpill, { excludeDraw: true }).length,
        }),
        [alleSpill],
    );

    const spill = useMemo(
        () => settledBets(alleSpill, { excludeDraw: utenDraw }),
        [alleSpill, utenDraw],
    );

    // Den tunge: 7 regler × 10 000 bootstrap-trekninger + 2 × 10 000 permutasjoner.
    const resultat = useMemo(
        () => analyze(alleSpill, { excludeDraw: utenDraw }),
        [alleSpill, utenDraw],
    );

    const utfall = useMemo(() => utfallsRader(spill), [spill]);

    const { summary, calibration, ev_buckets, odds_buckets, ev_correlation, odds_correlation, rules } =
        resultat;

    const harData = summary.n > 0;

    const toggel = (
        <PillGroup
            label="Utvalg"
            size="md"
            value={utvalg}
            onChange={setUtvalg}
            options={[
                { value: 'alle', label: `Alle spill (${nf(antall.alle)})` },
                { value: 'utenDraw', label: `Uten OT/SO (${nf(antall.utenDraw)})` },
            ]}
        />
    );

    if (portefølje.loading) {
        return (
            <main>
                <SectionHeading kicker="Modellkvalitet" title="Er modellen god?" />
                <div className={styles.statusLinje}>
                    <Laster />
                </div>
            </main>
        );
    }

    if (portefølje.error !== null) {
        return (
            <main>
                <SectionHeading kicker="Modellkvalitet" title="Er modellen god?" />
                <div className={styles.statusLinje}>
                    <ErrorState error={portefølje.error} onRetry={portefølje.retry} />
                </div>
            </main>
        );
    }

    return (
        <main>
            <SectionHeading
                kicker={`Modellkvalitet · ${nf(summary.n)} avregnede spill`}
                title="Er modellen god?"
                right={toggel}
            />

            {/* --- de tre tallene --------------------------------------- */}
            <section className={styles.toppTall}>
                <div className={styles.tallCelle}>
                    <span className="t-stat-label">Modellen forventet</span>
                    <span className={`t-calib-figure c-vermillion ${styles.tallFigur}`}>
                        {harData ? nf(summary.expected_hits_model, 1) : MANGLER}
                    </span>
                    <span className={styles.tallEnhet}>treff</span>
                </div>
                <div className={styles.tallCelle}>
                    <span className="t-stat-label">Markedet forventet</span>
                    <span className={`t-calib-figure c-muted ${styles.tallFigur}`}>
                        {harData ? nf(summary.expected_hits_market, 1) : MANGLER}
                    </span>
                    <span className={styles.tallEnhet}>treff</span>
                </div>
                <div className={styles.tallCelle}>
                    <span className="t-stat-label">Faktisk</span>
                    <span className={`t-calib-figure c-teal ${styles.tallFigur}`}>
                        {harData ? nf(summary.hits) : MANGLER}
                    </span>
                    <span className={styles.tallEnhet}>
                        treff · {harData ? pc(summary.hit_rate) : MANGLER} treffrate
                    </span>
                </div>
            </section>

            {/* --- 1. kalibrering --------------------------------------- */}
            <Kalibrering
                bøtter={calibration}
                sammendrag={summary}
                utfall={utfall}
                utenDraw={utenDraw}
            />

            {/* --- 2 og 3. EV-bøtter og odds-bøtter --------------------- */}
            <section className={`${styles.seksjon} ${styles.kvartiler}`}>
                <KvartilFigur
                    className={styles.kvartilVenstre}
                    kicker="Per EV-kvartil"
                    tittel="Betaler høy EV seg?"
                    bøtter={ev_buckets}
                    grense={(v) => pc(v, 1)}
                    bildetekst={
                        <>
                            Korrelasjon EV ↔ avkastning per krone: {korrelasjon(ev_correlation)}. Ingen
                            stigende trend — hele resultatet sitter i tredje kvartil, ikke i den høyeste. Å
                            satse mer der modellen ser størst kant gjør bare variansen dyrere.
                        </>
                    }
                />
                <KvartilFigur
                    className={styles.kvartilHoyre}
                    kicker="Per odds-kvartil"
                    tittel="Er det oddsnivået som avgjør?"
                    bøtter={odds_buckets}
                    grense={(v) => fmtOdds(v)}
                    bildetekst={
                        <>
                            Korrelasjon odds ↔ avkastning per krone: {korrelasjon(odds_correlation)}
                            {odds_correlation.p_value >= 0.05 ? ', altså ikke signifikant' : ''}. Mønsteret over
                            oddskvartilene er mer systematisk enn over EV-kvartilene, og det er lett å lese som
                            et etablert funn. Det er det ikke — det er en hypotese å teste videre, vår egen
                            versjon av favourite-longshot bias.
                        </>
                    }
                />
            </section>

            <p className={`${styles.note} ${styles.statusLinje}`}>
                p-verdiene er permutasjonstester med 10 000 trekninger og vakler i andre desimal mellom
                kjøringer. Begge korrelasjonene er langt fra enhver rimelig signifikansgrense uansett.
            </p>

            {/* --- 4. simulator ----------------------------------------- */}
            <Simulator spill={spill} regler={rules} datoer={datoer} />

            {/* --- åpne funn -------------------------------------------- */}
            <Funn />
        </main>
    );
}
