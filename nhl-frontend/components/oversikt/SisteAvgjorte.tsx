/**
 * «Siste avgjorte» (§C.1): de ni siste oppgjorte spillene, nyeste først.
 *
 * Griddet er `62px minmax(0,1fr) 56px 66px 76px` — dato, kamp, spillside, odds,
 * netto. Nettoen er den eneste fargede cellen; odds og side er muted, og
 * innsatsen står ikke her fordi alle spill er 100 kr (DECISIONS).
 */

import { Laster } from '@/components/ui';
import { ds, kr, odds as fmtOdds } from '@/lib/format';
import { kampTekst } from '@/lib/spill';
import type { BetEntry } from '@/types';
import styles from './Oversikt.module.css';

const ANTALL = 9;

/** `home` → `Hjem`, `away` → `Borte`, alt annet er OT/SO. */
function sideEtikett(seleksjon: string): string {
    if (seleksjon === 'home') return 'Hjem';
    if (seleksjon === 'away') return 'Borte';
    return 'OT/SO';
}

/** Millisekunder for radens kamptidspunkt. Datoen alene er nok når `start_time` mangler. */
function tid(b: BetEntry): number {
    if (b.start_time) {
        const t = Date.parse(b.start_time);
        if (!Number.isNaN(t)) return t;
    }
    const d = Date.parse(`${b.date}T00:00:00Z`);
    return Number.isNaN(d) ? 0 : d;
}

/** Nyeste først, med `event_id` som siste, deterministiske skille. */
function nyesteFørst(a: BetEntry, b: BetEntry): number {
    return tid(b) - tid(a) || (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0);
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
