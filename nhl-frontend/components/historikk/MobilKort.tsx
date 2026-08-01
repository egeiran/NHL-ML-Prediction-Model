/**
 * Under 768px er raden ikke en smalere rad — den er et kort (§F): «Away hos
 * Home» på én linje, `dato · side · odds` under, netto høyrejustert.
 *
 * Ni kolonner får ikke plass på 375px uten å bli uleselige, og en tabell som
 * må scrolles sidelengs er ikke en tabell noen leser. Lista er en `<ul>`, ikke
 * en tabell med skjulte kolonner: det den viser, er faktisk en liste.
 */

import { krTabell, odds as fmtOdds, ds } from '@/lib/format';
import type { BetEntry } from '@/types';
import { fortegn, resultatEtikett, spillEtikett } from './filter';
import { kampTekst, radNøkkel } from './rad';
import styles from './Historikk.module.css';

export interface MobilKortProps {
    rader: readonly BetEntry[];
}

const FARGE = {
    positiv: 'c-teal',
    negativ: 'c-vermillion',
    null: 'c-muted',
} as const;

function Kort({ b }: { b: BetEntry }) {
    const åpen = b.status === 'pending';
    return (
        <li className={styles.kort}>
            <div className={styles.kortVenstre}>
                <span className={styles.kortTittel}>{kampTekst(b)}</span>
                <span className={styles.kortMeta}>
                    {ds(b.date)}
                    <span aria-hidden="true"> · </span>
                    {spillEtikett(b.selection)}
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">odds </span>
                    {fmtOdds(b.odds)}
                </span>
            </div>
            <span className={`${styles.kortNetto} ${åpen ? 'c-faint' : FARGE[fortegn(b.profit)]}`}>
                {åpen ? (
                    resultatEtikett(b.status)
                ) : (
                    <>
                        <span className="sr-only">{`${resultatEtikett(b.status)}, netto `}</span>
                        {krTabell(b.profit)}
                    </>
                )}
            </span>
        </li>
    );
}

export function MobilKort({ rader }: MobilKortProps) {
    return (
        <ul className={styles.kortliste}>
            {rader.map((b, i) => (
                <Kort key={radNøkkel(b, i)} b={b} />
            ))}
        </ul>
    );
}
