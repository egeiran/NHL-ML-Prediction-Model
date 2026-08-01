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
 * permutasjoner per korrelasjon — målt til ~295 ms for `alle` og ~245 ms for
 * `utenDraw` på desktop, og et par sekunder på mellomklassemobil. Kostnaden
 * håndteres slik:
 *
 *   1. **Bare det aktive utvalget regnes.** En tidligere variant regnet begge i
 *      én `useMemo` for å gjøre vekslinger gratis, men da betalte hver eneste
 *      besøkende ~540 ms synkront i første render — også de som aldri rører
 *      toggelen — og kostnaden lå der ingenting dekket den. Nå koster første
 *      render én kjøring, og en veksling én kjøring inne i transitionen.
 *   2. `useTransition` rundt selve utvalgsbyttet. Pilla får sin egen
 *      hurtigtilstand (`valgt`) som settes synkront, mens `aktivt` — det som
 *      drar den tunge rerenderingen — kommer etter. React 19 holder forrige UI
 *      interaktivt imens, og `venter` demper seksjonen så det er synlig at noe
 *      er i ferd med å byttes ut. Det er nøyaktig i punkt 1s vekslingskostnad
 *      dempingen har noe å vise.
 *
 * Antall bootstrap-trekninger røres ikke: presisjonen er poenget med skjermen.
 */

import { useMemo, useState, useTransition } from 'react';
import {
    analyze,
    profitPerKrone,
    settledBets,
    type AnalysisBet,
    type AnalysisResult,
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

export function ModellSkjerm() {
    const portefølje = usePortfolio();
    /** Pilla — settes synkront, så trykket registrerer med én gang. */
    const [valgt, setValgt] = useState<Utvalg>('alle');
    /** Dataene — henger etter i en transition mens `analyze()` går. */
    const [aktivt, setAktivt] = useState<Utvalg>('alle');
    const [venter, start] = useTransition();
    const utenDraw = aktivt === 'utenDraw';

    const alleSpill: readonly AnalysisBet[] =
        portefølje.data?.bets ?? INGEN_SPILL;

    const datoer = useMemo(
        () => (portefølje.data?.timeseries ?? []).map((t) => t.date),
        [portefølje.data],
    );

    /**
     * Én sortering av historikken, ikke tre. `settledBets` sorterer, og
     * `excludeDraw` er bare et filter oppå nøyaktig det samme resultatet — så
     * begge utvalgene kan leses ut av ett kall. Tellingene i toggelen skal
     * dessuten stå fast uansett hva som er valgt, og hører hjemme her.
     */
    const grunnlag = useMemo(() => {
        const avregnet = settledBets(alleSpill);
        return {
            alle: avregnet,
            utenDraw: avregnet.filter((b) => b.selection !== 'draw'),
            // Draw-raden fra HELE utvalget: noten under «Per utfallstype» skal
            // kunne si hva OT/SO kostet også når OT/SO er skrudd av.
            otSo: utfallsRader(avregnet).find((r) => r.nokkel === 'draw') ?? null,
        };
    }, [alleSpill]);

    const spill = utenDraw ? grunnlag.utenDraw : grunnlag.alle;

    /**
     * Den tunge: 7 regler × 10 000 bootstrap-trekninger + 2 × 10 000
     * permutasjoner. Kun det aktive utvalget regnes. Å regne begge på forhånd
     * ville gjort vekslingen gratis, men flyttet ~245 ms ekstra inn i første
     * render for alle — også de som aldri veksler. Vekslingen skjer inne i
     * `start()`, der `venter` demper og React holder forrige UI interaktivt;
     * første render har ingen tilsvarende dekning. Antall trekninger røres ikke.
     */
    const resultat: AnalysisResult = useMemo(
        () => analyze(alleSpill, { excludeDraw: utenDraw }),
        [alleSpill, utenDraw],
    );

    /** Billig sammenlignet med `analyze`, men følger samme utvalg. */
    const utfall: UtfallsRad[] = useMemo(() => utfallsRader(spill), [spill]);

    const { summary, calibration, ev_buckets, odds_buckets, ev_correlation, odds_correlation, rules } =
        resultat;

    const harData = summary.n > 0;

    function velgUtvalg(u: Utvalg) {
        setValgt(u);
        start(() => setAktivt(u));
    }

    const toggel = (
        <PillGroup
            label="Utvalg"
            size="md"
            value={valgt}
            onChange={velgUtvalg}
            options={[
                { value: 'alle', label: `Alle spill (${nf(grunnlag.alle.length)})` },
                { value: 'utenDraw', label: `Uten OT/SO (${nf(grunnlag.utenDraw.length)})` },
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

            {/*
             * Alt under overskriften avhenger av `analyze()`. Under en
             * transition står forrige utvalg igjen og er fullt interaktivt —
             * dempingen sier at det som står er i ferd med å byttes ut.
             */}
            <div
                className={venter ? `${styles.innhold} ${styles.venter}` : styles.innhold}
                aria-busy={venter}
            >
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
                    otSo={grunnlag.otSo}
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
            </div>

            {/* --- åpne funn — redaksjonelt, uavhengig av utvalget -------- */}
            <Funn />
        </main>
    );
}
