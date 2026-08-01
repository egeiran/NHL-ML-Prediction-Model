'use client';

/**
 * Skyggelogg (§C.7) — hele skjermen.
 *
 * Vi sluttet å legge inn OT/SO-spill. Skjermen stiller den faktiske porteføljen
 * mot skyggeloggen over spillene vi ikke lenger tar, slik at beslutningen kan
 * måles løpende i stedet for antas.
 *
 * To kilder, og skjermen sier hvilken den bruker:
 *   1. `shadow.json` — den ekte skyggeloggen. Tom i dag (`bet_shadow.csv` har 0
 *      rader), fordi ingen sesong har kjørt siden OT/SO-spillene ble tatt ut.
 *   2. `selection === 'draw'`-radene i `portfolio.json` — de gamle OT/SO-spillene
 *      som fortsatt ligger i historikken.
 * Byttet skjer av seg selv den dagen `shadow.json` får sin første avregnede rad;
 * se `velgUtvalg()` i `beregn.ts`.
 *
 * Tonen: −640 mot +675 over 26 og 176 spill er små tall med bred usikkerhet.
 * Skjermen sier hva tallene er, ikke hva de beviser.
 */

import { useMemo, type CSSProperties } from 'react';
import { ErrorState, Laster, SectionHeading } from '@/components/ui';
import { kombiner, usePortfolio, useShadow } from '@/lib/use-data';
import { krp, nf, pcRaw, sgn } from '@/lib/format';
import { utahVindu } from '@/lib/utah';
import type { BetEntry, ShadowEntry } from '@/types';
import { Panel } from './Panel';
import { UtahVindu } from './UtahVindu';
import { stolpeBredde, stolpeNevner, velgUtvalg, type Kilde } from './beregn';
import styles from './Skygge.module.css';

/** Stabile referanser — ellers ser `useMemo` en ny tom liste hver render. */
const INGEN_SPILL: readonly BetEntry[] = [];
const INGEN_SKYGGE: readonly ShadowEntry[] = [];

const KICKER = 'Skyggelogg';
const TITTEL = 'Spillene vi sluttet å ta';
const INGRESS = 'OT/SO-spill legges ikke inn lenger, men føres videre med full innsats.';

/**
 * Kildelinja (påkrevd av DECISIONS). Prefikset er ordrett fra spesifikasjonen;
 * resten er der fordi fallbacken ikke skal se ut som en ekte skyggelogg.
 */
function kildetekst(kilde: Kilde): string {
    switch (kilde) {
        case 'shadow':
            return 'Kilde: shadow.json — OT/SO-spill ført med full innsats etter at de ble tatt ut av porteføljen.';
        case 'portefølje':
            return 'Kilde: portfolio.json · OT/SO-rader — shadow.json er tom, så skyggetallene er avledet fra de gamle OT/SO-radene i historikken, ikke fra en ekte skyggelogg.';
        case 'ingen':
            return 'Kilde: shadow.json — tom. Ingen avregnede OT/SO-spill å føre skyggelogg over ennå.';
    }
}

function undertekstSkygge(kilde: Kilde): string {
    return kilde === 'shadow'
        ? 'OT/SO-spill som modellen ville tatt, ført med full innsats'
        : 'OT/SO-spill som modellen ville tatt, ført med full innsats — her: de historiske radene';
}

/* -------------------------------------------------------------------------- */

export function SkyggeSkjerm() {
    const portefølje = usePortfolio();
    const skyggedata = useShadow();
    const { loading, error, retry } = kombiner(portefølje, skyggedata);

    const rader = portefølje.data?.bets ?? INGEN_SPILL;

    const utvalg = useMemo(
        () => velgUtvalg(rader, skyggedata.data ?? INGEN_SKYGGE),
        [rader, skyggedata.data],
    );
    const utah = useMemo(() => utahVindu(rader), [rader]);

    const { kilde, faktisk, skygge } = utvalg;
    const nevner = stolpeNevner(faktisk.profit, skygge.profit);
    const harSkygge = kilde !== 'ingen' && skygge.n > 0;

    const hode = (
        <SectionHeading
            kicker={KICKER}
            title={TITTEL}
            ingress={
                <>
                    {INGRESS}
                    <span className={`t-axis-label ${styles.kilde}`}>{kildetekst(kilde)}</span>
                </>
            }
        />
    );

    if (loading) {
        return (
            <main>
                {hode}
                <div className={styles.statusLinje}>
                    <Laster />
                </div>
            </main>
        );
    }

    if (error !== null) {
        return (
            <main>
                {hode}
                <div className={styles.statusLinje}>
                    <ErrorState error={error} onRetry={retry} />
                </div>
            </main>
        );
    }

    return (
        <main>
            {hode}

            {/* --- de to panelene, 50/50 -------------------------------- */}
            <section
                className={`split ${styles.paneler}`}
                style={{ '--split-gutter': '40px' } as CSSProperties}
            >
                <Panel
                    tittel="Faktisk portefølje"
                    tittelfarge="teal"
                    undertekst="Hjemme- og borteseier — spillene som faktisk ble lagt inn"
                    sammendrag={faktisk.n > 0 ? faktisk : null}
                    stolpe={stolpeBredde(faktisk.profit, nevner)}
                />
                <Panel
                    tittel="Skyggelogg"
                    tittelfarge="vermillion"
                    undertekst={
                        harSkygge ? undertekstSkygge(kilde) : 'Ingen OT/SO-spill registrert.'
                    }
                    sammendrag={harSkygge ? skygge : null}
                    stolpe={stolpeBredde(skygge.profit, nevner)}
                    tint
                />
            </section>

            {harSkygge && faktisk.n > 0 ? (
                <p className={`t-body-small c-muted ${styles.forbehold}`}>
                    {nf(skygge.n)} og {nf(faktisk.n)} avregnede spill er små utvalg. Forskjellen
                    mellom panelene, {krp(Math.abs(faktisk.profit - skygge.profit))}, er hva som
                    skjedde i disse to utvalgene — ikke et mål på hva beslutningen er verdt
                    framover. Begge tallene bærer sin egen varians.
                </p>
            ) : null}

            {/* --- forklaring + Utah-vinduet ---------------------------- */}
            <section
                className={`split ${styles.forklaring}`}
                style={
                    {
                        '--split-cols': 'minmax(0,1.2fr) minmax(0,.8fr)',
                        '--split-gutter': '44px',
                    } as CSSProperties
                }
            >
                <div>
                    <h2 className={styles.forklaringTittel}>
                        Feilen lå i seleksjonen, ikke i modellen
                    </h2>
                    <p className={styles.forklaringTekst}>
                        Modellen anslo {pcRaw(33, 0)} sjanse for OT/SO på kampene den flagget.
                        Faktisk endte {pcRaw(22, 0)} slik. På backtest treffer den {pcRaw(22.6)} mot{' '}
                        {pcRaw(20.6)} predikert — skjevheten oppstår fordi vi bare spiller når
                        modellen sier et ekstremt tall.
                    </p>
                    <p className={styles.forklaringTekst}>
                        Ingen skalering av OT/SO-sannsynligheten redder det: ved den best kalibrerte
                        multiplikatoren passerer {nf(291)} av {nf(4436)} testkamper EV-terskelen med{' '}
                        {pcRaw(23)} treff og ROI {sgn(-0.1, 0)}. Å skru den opp gjør bare at vi
                        spiller mer av noe som taper.
                    </p>
                </div>
                <UtahVindu tall={utah} />
            </section>
        </main>
    );
}
