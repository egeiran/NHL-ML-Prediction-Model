'use client';

/**
 * Skyggelogg (§C.7) — hele skjermen.
 *
 * To terskler avgjør hva som blir et spill: EV må over sin egen grense — én for
 * hjemme og borte, en strengere for uavgjort — og oddsen under et tak. Alle tre
 * leses fra `meta.json` (`value_min`, `draw_value_min`, `max_odds`), som er
 * pipelinens egne verdier; de skrives ikke inn her. Kampene som ryker på en av
 * dem havner i `shadow.json` med samme innsats og samme avregning som ekte
 * spill. Skjermen stiller de to loggene mot hverandre, slik at plasseringen av
 * tersklene kan måles i stedet for antas.
 *
 * Begge panelene viser **samme sesong**. Porteføljen leses fra
 * `portfolio-history.json` (alle sesonger), ikke `portfolio.json` (bare nyeste),
 * og skyggeloggen filtreres på samme sesong. Ellers ville skjermen i starten av
 * en sesong stilt årets få spill mot hele fjorårets skyggelogg.
 *
 * Tonen: dette er små utvalg med bred usikkerhet. Skjermen sier hva tallene er,
 * ikke hva de beviser.
 */

import { useMemo, type CSSProperties } from 'react';
import { ErrorState, Laster, PillGroup, SectionHeading } from '@/components/ui';
import { ALLE_SESONGER, filtrerSesong, sesongValg, sesongerI } from '@/lib/sesong';
import { kombiner, useMeta, usePortfolioHistory, useShadow } from '@/lib/use-data';
import { useSesong } from '@/lib/use-sesong';
import { krp, nf } from '@/lib/format';
import type { BetEntry, ShadowEntry, SiteMeta } from '@/types';
import { Panel } from './Panel';
import { stolpeBredde, stolpeNevner, velgUtvalg, type Kilde } from './beregn';
import styles from './Skygge.module.css';

/** Stabile referanser — ellers ser `useMemo` en ny tom liste hver render. */
const INGEN_SPILL: readonly BetEntry[] = [];
const INGEN_SKYGGE: readonly ShadowEntry[] = [];

const KICKER = 'Skyggelogg';
const TITTEL = 'Kampene vi lot ligge';
const INGRESS =
    'Kamper som røk på EV-terskelen eller oddstaket, ført videre med full innsats.';

/** Kildelinja (påkrevd av DECISIONS). Prefikset er ordrett fra spesifikasjonen. */
function kildetekst(kilde: Kilde): string {
    switch (kilde) {
        case 'shadow':
            return 'Kilde: shadow.json — kamper under EV-terskelen eller over oddstaket, ført med full innsats og avregnet som ekte spill.';
        case 'ingen':
            return 'Kilde: shadow.json — ingen avregnede rader ennå.';
    }
}

/**
 * Terskelsetningen. Verdiene er pipelinens, lest fra `meta.json` — står de
 * skrevet her, lyver setningen første gang en terskel endres i Python.
 * Mangler fila, sier setningen hva tersklene gjør uten å påstå hvilke de er.
 */
function terskelsetning(meta: SiteMeta | null): string {
    if (meta === null) {
        return 'Tersklene skiller de to panelene: oddsen må under et tak, og EV over sin egen grense — strengere for uavgjort, fordi OT/SO-oddsen ligger tilnærmet fast.';
    }
    const draw = meta.draw_value_min ?? meta.value_min;
    const uavgjort =
        draw === meta.value_min
            ? ''
            : ` — eller ${nf(draw, 2)} for uavgjort, som har en strengere grense fordi OT/SO-oddsen ligger tilnærmet fast`;
    return `Tersklene skiller de to panelene: oddsen må under ${nf(meta.max_odds, 2)}, og EV over ${nf(meta.value_min, 2)}${uavgjort}.`;
}

/* -------------------------------------------------------------------------- */

export function SkyggeSkjerm() {
    const portefølje = usePortfolioHistory();
    const skyggedata = useShadow();
    const meta = useMeta();
    const { loading, error, retry } = kombiner(portefølje, skyggedata);

    const rader = portefølje.data?.bets ?? INGEN_SPILL;
    const skyggerader = skyggedata.data ?? INGEN_SKYGGE;

    // Nyeste sesong i én av loggene er standard. Skyggeloggen kan få rader før
    // første ekte spill i en ny sesong, og da skal den nye sesongen vises.
    const sesonger = useMemo(() => sesongerI(rader, skyggerader), [rader, skyggerader]);
    const standardSesong = sesonger[sesonger.length - 1] ?? ALLE_SESONGER;
    const [sesong, setSesong] = useSesong(sesonger, standardSesong);
    const valg = useMemo(() => sesongValg(sesonger), [sesonger]);

    const utvalg = useMemo(
        () => velgUtvalg(filtrerSesong(rader, sesong), filtrerSesong(skyggerader, sesong)),
        [rader, skyggerader, sesong],
    );

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

            {sesonger.length > 1 ? (
                <section className={styles.sesongvalg}>
                    <PillGroup
                        label="Sesong"
                        size="md"
                        options={valg}
                        value={sesong}
                        onChange={setSesong}
                    />
                </section>
            ) : null}

            {/* --- de to panelene, 50/50 -------------------------------- */}
            <section
                className={`split ${styles.paneler}`}
                style={{ '--split-gutter': '40px' } as CSSProperties}
            >
                <Panel
                    tittel="Faktisk portefølje"
                    tittelfarge="teal"
                    undertekst={
                        faktisk.n > 0
                            ? 'Spillene som passerte begge tersklene og faktisk ble lagt inn'
                            : 'Ingen avregnede spill i porteføljen denne sesongen ennå.'
                    }
                    sammendrag={faktisk.n > 0 ? faktisk : null}
                    stolpe={stolpeBredde(faktisk.profit, nevner)}
                />
                <Panel
                    tittel="Skyggelogg"
                    tittelfarge="vermillion"
                    undertekst={
                        harSkygge
                            ? 'Kampene som røk på en terskel, ført med full innsats'
                            : 'Ingen avregnede kamper i skyggeloggen ennå.'
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

            {/* --- forklaring ------------------------------------------- */}
            <section className={styles.forklaring}>
                <h2 className={styles.forklaringTittel}>Hva skyggeloggen faktisk måler</h2>
                <p className={styles.forklaringTekst}>
                    {terskelsetning(meta.data)} Alt annet med komplette odds havner til venstre i
                    skyggeloggen — samme innsats, samme avregning, men pengene ble aldri satt.
                </p>
                <p className={styles.forklaringTekst}>
                    Går skyggeloggen bedre enn porteføljen over tid, står tersklene på feil sted.
                    Går den dårligere, gjør de jobben sin. Det er hele poenget: valget blir målt i
                    stedet for antatt. Så langt er utvalgene for små til at forskjellen betyr noe —
                    se forbeholdet over panelene.
                </p>
            </section>
        </main>
    );
}
