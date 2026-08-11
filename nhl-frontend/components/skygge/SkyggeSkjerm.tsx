'use client';

/**
 * Skyggelogg (§C.7) — hele skjermen.
 *
 * To terskler avgjør hva som blir et spill: EV må over sin egen grense – 0,15
 * for hjemme og borte, 0,30 for uavgjort – og oddsen under 4,00. Kampene som
 * ryker på en av dem havner i `shadow.json` med samme innsats og samme
 * avregning som ekte spill. Skjermen stiller de to loggene mot hverandre, slik
 * at plasseringen av tersklene kan måles i stedet for antas.
 *
 * Tonen: dette er små utvalg med bred usikkerhet. Skjermen sier hva tallene er,
 * ikke hva de beviser.
 */

import { useMemo, type CSSProperties } from 'react';
import { ErrorState, Laster, SectionHeading } from '@/components/ui';
import { kombiner, usePortfolio, useShadow } from '@/lib/use-data';
import { krp, nf } from '@/lib/format';
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
                    undertekst="Spillene som passerte begge tersklene og faktisk ble lagt inn"
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
                        Hva skyggeloggen faktisk måler
                    </h2>
                    <p className={styles.forklaringTekst}>
                        Tersklene skiller de to panelene: oddsen må under {nf(4, 2)}, og EV
                        over {nf(0.15, 2)} — eller {nf(0.3, 2)} for uavgjort, som har en
                        strengere grense fordi OT/SO-oddsen ligger fast rundt {nf(3.9, 2)}.
                        Alt annet med komplette odds havner til venstre i skyggeloggen — samme
                        innsats, samme avregning, men pengene ble aldri satt.
                    </p>
                    <p className={styles.forklaringTekst}>
                        Går skyggeloggen bedre enn porteføljen over tid, står tersklene på feil
                        sted. Går den dårligere, gjør de jobben sin. Det er hele poenget: valget
                        blir målt i stedet for antatt. Så langt er utvalgene for små til at
                        forskjellen betyr noe — se forbeholdet over panelene.
                    </p>
                </div>
                <UtahVindu tall={utah} />
            </section>
        </main>
    );
}
