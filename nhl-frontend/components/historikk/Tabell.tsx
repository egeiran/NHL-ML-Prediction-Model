/**
 * Beslutningsloggen på desktop (§C.4).
 *
 * En ekte `<table>` med `<th scope="col">`, ikke et div-rutenett: 202 rader ×
 * 9 kolonner uten tabellsemantikk er uleselig med skjermleser. Kolonnebreddene
 * fra spesifikasjonen ligger i `<colgroup>` med `table-layout: fixed`, og
 * kolonnegapet på 12px er cellenes høyrepadding. Kamp-kolonnen er den eneste
 * uten fast bredde og tar resten — det er `minmax(0,1.5fr)` i tabellform, og
 * det er også det som gjør ellipsen mulig.
 *
 * Ingen virtualisering: 202 rader er ~1800 DOM-noder, godt innenfor det
 * nettleseren tar uten å blunke.
 */

import { MANGLER, krTabell, odds as fmtOdds, ds, pc, sgn } from '@/lib/format';
import type { BetEntry } from '@/types';
import { fortegn, resultatEtikett, spillEtikett } from './filter';
import { kampTekst, radNøkkel } from './rad';
import styles from './Historikk.module.css';

export interface TabellProps {
    rader: readonly BetEntry[];
}

const FARGE = {
    positiv: 'c-teal',
    negativ: 'c-vermillion',
    null: 'c-muted',
} as const;

function resultatFarge(status: BetEntry['status']): string {
    if (status === 'won') return 'c-teal';
    if (status === 'lost') return 'c-vermillion';
    return 'c-muted';
}

function Rad({ b }: { b: BetEntry }) {
    const åpen = b.status === 'pending';
    const kamp = kampTekst(b);
    return (
        <tr className={styles.rad}>
            <td className={styles.dato}>{ds(b.date)}</td>
            <td className={styles.kamp} title={kamp}>
                {kamp}
            </td>
            <td className={styles.spill}>{spillEtikett(b.selection)}</td>
            <td className={`t-table-figure ${styles.hoyre}`}>{fmtOdds(b.odds)}</td>
            <td className={`t-table-figure ${styles.hoyre}`}>{pc(b.model_prob)}</td>
            <td className={`t-table-figure ${styles.hoyre} c-faint`}>{pc(b.implied_prob)}</td>
            <td className={`t-table-figure ${styles.hoyre}`}>{sgn(b.value)}</td>
            <td className={`${styles.resultat} ${resultatFarge(b.status)}`}>
                {resultatEtikett(b.status)}
            </td>
            <td className={`${styles.netto} ${åpen ? 'c-faint' : FARGE[fortegn(b.profit)]}`}>
                {åpen ? MANGLER : krTabell(b.profit)}
            </td>
        </tr>
    );
}

export function Tabell({ rader }: TabellProps) {
    return (
        <div className={styles.tabellRam}>
            <table className={styles.tabell}>
                <caption className="sr-only">
                    Beslutningslogg — alle spill, sortert etter valgt rekkefølge. Innsats er 100 kr
                    på hvert spill.
                </caption>
                <colgroup>
                    <col className={styles.kDato} />
                    <col />
                    <col className={styles.kSpill} />
                    <col className={styles.kOdds} />
                    <col className={styles.kModell} />
                    <col className={styles.kMarked} />
                    <col className={styles.kEv} />
                    <col className={styles.kResultat} />
                    <col className={styles.kNetto} />
                </colgroup>
                <thead>
                    <tr className={styles.hoderad}>
                        <th scope="col" className="t-table-header">
                            Dato
                        </th>
                        <th scope="col" className="t-table-header">
                            Kamp
                        </th>
                        <th scope="col" className="t-table-header">
                            Spill
                        </th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>
                            Odds
                        </th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>
                            Modell
                        </th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>
                            Marked
                        </th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>
                            EV
                        </th>
                        <th scope="col" className="t-table-header">
                            Resultat
                        </th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>
                            Netto
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rader.map((b, i) => (
                        <Rad key={radNøkkel(b, i)} b={b} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
