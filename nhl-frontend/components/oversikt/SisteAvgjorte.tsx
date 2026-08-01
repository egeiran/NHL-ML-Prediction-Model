/**
 * «Siste avgjorte» (§C.1): de ni siste oppgjorte spillene, nyeste først.
 *
 * Griddet er `62px minmax(0,1fr) 56px 66px 76px` — dato, kamp, spillside, odds,
 * netto. Nettoen er den eneste fargede cellen; odds og side er muted, og
 * innsatsen står ikke her fordi alle spill er 100 kr (DECISIONS).
 */

import { Laster } from '@/components/ui';
import { ds, kr, odds as fmtOdds } from '@/lib/format';
import { kampTekst, nyesteFørst } from '@/lib/spill';
import type { BetEntry } from '@/types';
import styles from './Oversikt.module.css';

const ANTALL = 9;

/** `home` → `Hjem`, `away` → `Borte`, alt annet er OT/SO. */
function sideEtikett(seleksjon: string): string {
    if (seleksjon === 'home') return 'Hjem';
    if (seleksjon === 'away') return 'Borte';
    return 'OT/SO';
}

export interface SisteAvgjorteProps {
    bets: readonly BetEntry[];
    laster: boolean;
}

export function SisteAvgjorte({ bets, laster }: SisteAvgjorteProps) {
    // Seksjonen heter «Siste avgjorte», så åpne spill hører ikke hjemme her.
    //
    // Sorteringen er eksplisitt. `bets[]` er kronologisk stigende i dagens fil,
    // men «nyeste ni» skal ikke være en egenskap ved filrekkefølgen — Historikk
    // sorterer selv, og denne lista viser de samme radene.
    const rader = bets
        .filter((b) => b.status !== 'pending')
        .slice()
        .sort(nyesteFørst)
        .slice(0, ANTALL);

    return (
        <section className={styles.siste} aria-labelledby="siste-avgjorte">
            <h2 id="siste-avgjorte" className={`t-kicker ${styles.seksjonsKicker}`}>
                Siste avgjorte
            </h2>
            <div className={styles.sisteListe}>
                {laster ? (
                    <Laster />
                ) : rader.length === 0 ? (
                    <p className="t-body-small">Ingen avgjorte spill ennå.</p>
                ) : (
                    rader.map((b) => (
                        <div key={`${b.event_id}-${b.selection}`} className={styles.sisteRad}>
                            <span className={styles.sisteDato}>{ds(b.date)}</span>
                            <span className={styles.sisteKamp}>{kampTekst(b)}</span>
                            <span className={styles.sisteSide}>{sideEtikett(b.selection)}</span>
                            <span className={styles.sisteOdds}>{fmtOdds(b.odds)}</span>
                            <span
                                className={`${styles.sisteNetto} ${b.profit >= 0 ? 'c-teal' : 'c-vermillion'}`}
                            >
                                {kr(b.profit)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}
