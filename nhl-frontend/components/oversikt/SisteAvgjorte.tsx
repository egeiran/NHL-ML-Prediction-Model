/**
 * «Siste avgjorte» (§C.1): de ni siste oppgjorte spillene, nyeste først.
 *
 * Griddet er `62px minmax(0,1fr) 56px 66px 76px` — dato, kamp, spillside, odds,
 * netto. Nettoen er den eneste fargede cellen; odds og side er muted, og
 * innsatsen står ikke her fordi alle spill er 100 kr (DECISIONS).
 */

import { Laster } from '@/components/ui';
import { ds, kr, odds as fmtOdds } from '@/lib/format';
import { lagNavn } from '@/lib/teams';
import type { BetEntry } from '@/types';
import styles from './Oversikt.module.css';

const ANTALL = 9;

/** `home` → `Hjem`, `away` → `Borte`, alt annet er OT/SO. */
function sideEtikett(seleksjon: string): string {
    if (seleksjon === 'home') return 'Hjem';
    if (seleksjon === 'away') return 'Borte';
    return 'OT/SO';
}

function kampTekst(b: BetEntry): string {
    const borte = b.away_abbr ? lagNavn(b.away_abbr) : '';
    const hjemme = b.home_abbr ? lagNavn(b.home_abbr) : '';
    if (!borte || !hjemme) return b.event_id;
    return `${borte} hos ${hjemme}`;
}

export interface SisteAvgjorteProps {
    bets: readonly BetEntry[];
    laster: boolean;
}

export function SisteAvgjorte({ bets, laster }: SisteAvgjorteProps) {
    // Seksjonen heter «Siste avgjorte», så åpne spill hører ikke hjemme her.
    const rader = bets
        .filter((b) => b.status !== 'pending')
        .slice(-ANTALL)
        .reverse();

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
