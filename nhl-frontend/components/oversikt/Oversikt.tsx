'use client';

/**
 * Oversikt (§C.1) — skjermen skal svare på ett spørsmål uten at brukeren
 * scroller: er jeg opp eller ned, og er det noe å spille på i dag?
 *
 * Heroen fyller viewporten: overskriften sier tilstanden, venstre kolonne sier
 * hva som er å spille på, høyre kolonne sier hvordan det har gått. Alt annet —
 * kurvelabben, de siste avgjorte, analyselenkene — ligger under folden.
 *
 * Dagens ekte tilstand er tom: `value-report.json` er `[]`. Tomtilstanden er
 * derfor hovedtilstanden, ikke et unntak.
 */

import { useMemo, type CSSProperties } from 'react';
import { ErrorState, EvTerskelSlider, Laster } from '@/components/ui';
import { useEvTerskel } from '@/lib/config';
import { dl, nf, pc } from '@/lib/format';
import { kombiner, useMeta, usePortfolio, useValueReport } from '@/lib/use-data';
import { finnSpill } from './beregninger';
import { DagensSpill } from './DagensSpill';
import { HeroKurve } from './HeroKurve';
import { Kurvelab } from './Kurvelab';
import { SisteAvgjorte } from './SisteAvgjorte';
import styles from './Oversikt.module.css';

/* `.split`-kolonnene for hero-kroppen (§B.5/§B.6). */
const SPLIT_STIL = {
    '--split-cols': 'minmax(300px,.62fr) minmax(0,1fr)',
    '--split-gutter': '44px',
} as CSSProperties;

/** Overskriften følger tilstanden — den er skjermens eneste konklusjon. */
function overskrift(antallKamper: number, antallSpill: number): string {
    if (antallSpill === 1) return 'Ett spill over terskel';
    if (antallSpill > 1) return `${nf(antallSpill)} spill over terskel`;
    return antallKamper > 0 ? 'Ingen spill over terskel' : 'Ingen kamper i dag';
}

export function Oversikt() {
    const portefølje = usePortfolio();
    const verdirapport = useValueReport();
    // `meta` er med i lastetilstanden fordi EV-terskelen defaulter til
    // `meta.value_min`. Uten den ville spillisten rendret én gang på fallbacken
    // og så byttet innhold når meta landet.
    const meta = useMeta();
    const { evTerskel } = useEvTerskel();

    const { loading, error, retry } = kombiner(portefølje, verdirapport, meta);

    // Referansestabile fallbacks: en fersk `[]` per render ville invalidert
    // hver `useMemo` nedover i treet.
    const kamper = useMemo(() => verdirapport.data ?? [], [verdirapport.data]);
    // `max_odds` er en del av spill-utvelgelsen, ikke bare EV-terskelen:
    // pipelinen krever `odds < max_odds`. Uten den kunne heroen tagge SPILL på
    // et utfall `bet_history.csv` aldri får.
    const maxOdds = meta.data?.max_odds;
    // OT/SO har egen, høyere terskel og kan være skrudd av – begge er
    // pipeline-regler, ikke brukervalg, så de kommer fra meta.
    const drawEvTerskel = meta.data?.draw_value_min;
    const allowDrawBets = meta.data?.allow_draw_bets;
    const spill = useMemo(
        () => finnSpill(kamper, evTerskel, maxOdds, drawEvTerskel, allowDrawBets),
        [kamper, evTerskel, maxOdds, drawEvTerskel, allowDrawBets],
    );

    const timeseries = useMemo(() => portefølje.data?.timeseries ?? [], [portefølje.data]);
    const bets = useMemo(() => portefølje.data?.bets ?? [], [portefølje.data]);

    const harKamper = kamper.length > 0;
    // Dagetiketten er kicker: «Sesongpause», ellers datoen kampene gjelder.
    // Terskelen står i samme linje fordi overskriften teller «spill over
    // terskel» uten å si hvilken — en bruker som har dratt slideren til 40 %
    // på /verdi får ellers en permanent, uforklart «Ingen spill over terskel».
    const kicker = `${harKamper ? dl(kamper[0].date) : 'Sesongpause'} · terskel EV ≥ ${pc(evTerskel, 0)}`;
    const tittel = overskrift(kamper.length, spill.length);

    // Tomlinja skiller sesongpause fra «det spilles, men ingenting kvalifiserer».
    const tomLinje = harKamper
        ? 'Markedet priser dagens kamper som modellen.'
        : 'Neste sesongstart 29. september. Elo oppdateres gjennom pausen.';

    return (
        <>
            <section className={styles.hero} aria-labelledby="oversikt-tittel">
                <div className={styles.heroTopp}>
                    <div className={styles.heroTekst}>
                        <span className="t-kicker">{loading ? <Laster /> : kicker}</span>
                        <h1
                            id="oversikt-tittel"
                            className={`t-hero-headline ${styles.heroOverskrift}`}
                        >
                            {loading ? <Laster /> : tittel}
                        </h1>
                    </div>
                    {/* Terskelen styrer overskriften her, ikke bare /verdi.
                        Slideren står derfor der spørsmålet «hvorfor er lista
                        tom?» faktisk stilles, og bærer avviksnotisen fra
                        DECISIONS punkt 6. */}
                    <EvTerskelSlider className={styles.heroTerskel} />
                </div>

                {error !== null ? (
                    <ErrorState error={error} onRetry={retry} className={styles.heroFeil} />
                ) : (
                    <div className={`split ${styles.heroKropp}`} style={SPLIT_STIL}>
                        <DagensSpill spill={spill} tomLinje={tomLinje} laster={loading} />
                        <HeroKurve
                            timeseries={timeseries}
                            summary={portefølje.data?.summary ?? null}
                            laster={loading}
                        />
                    </div>
                )}
            </section>

            {error === null ? (
                <>
                    <Kurvelab timeseries={timeseries} laster={loading} />
                    <SisteAvgjorte bets={bets} laster={loading} />
                </>
            ) : null}
        </>
    );
}
