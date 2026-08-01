/**
 * Den rangerte Elo-tabellen (§C.5).
 *
 * Griddet er `32px 42px minmax(0,1fr) 54px minmax(120px,1.1fr) 64px`:
 * rang · logo · navn · konferanse · avviksbjelke · rating.
 *
 * Markupen er en ekte `<table>` med `<th scope>`, men radene er CSS-grid slik
 * at kolonnene holder linja på tvers av rader. `display: block/grid` fjerner
 * tabellens implisitte ARIA-roller i flere nettlesere, så rollene står
 * eksplisitt. Det er samme tre som en vanlig tabell — bare skrevet ut.
 *
 * Rangen er ligaposisjonen, ikke posisjonen i filteret: filtrerer du til Øst
 * skal Carolina fortsatt være nummer 2 i ligaen, ikke nummer 1.
 */

import { TeamLogo } from '@/components/ui';
import { MANGLER, nf } from '@/lib/format';
import { lagNavn, type Konferanse } from '@/lib/teams';
import { AvviksBjelke } from './AvviksBjelke';
import styles from './Elo.module.css';

export interface EloRad {
    abbr: string;
    rating: number;
    /** Ligaposisjon, 1-basert. Endres ikke av konferansefilteret. */
    rang: number;
    /** `null` for en forkortelse som ikke finnes i `lib/teams.ts`. */
    konferanse: Konferanse | null;
}

export interface EloTabellProps {
    rader: readonly EloRad[];
    /** `config.base_rating` — nullpunktet bjelken divergerer rundt. */
    midtpunkt: number;
}

export function EloTabell({ rader, midtpunkt }: EloTabellProps) {
    return (
        <table className={styles.tabell} role="table">
            <thead className={styles.gruppe} role="rowgroup">
                <tr className={styles.hodeRad} role="row">
                    <th scope="col" role="columnheader" className={`t-table-header ${styles.hodeCelle}`}>
                        #
                    </th>
                    <th scope="col" role="columnheader" className={`t-table-header ${styles.hodeCelle}`}>
                        <span className="sr-only">Lagmerke</span>
                    </th>
                    <th scope="col" role="columnheader" className={`t-table-header ${styles.hodeCelle}`}>
                        Lag
                    </th>
                    <th scope="col" role="columnheader" className={`t-table-header ${styles.hodeCelle}`}>
                        Konf.
                    </th>
                    <th
                        scope="col"
                        role="columnheader"
                        className={`t-table-header ${styles.hodeCelle} ${styles.hodeBjelke}`}
                    >
                        Avvik fra {nf(midtpunkt)}
                    </th>
                    <th
                        scope="col"
                        role="columnheader"
                        className={`t-table-header ${styles.hodeCelle} ${styles.hodeHoyre}`}
                    >
                        Rating
                    </th>
                </tr>
            </thead>
            <tbody className={styles.gruppe} role="rowgroup">
                {rader.map((r) => (
                    <tr key={r.abbr} className={styles.rad} role="row">
                        <td role="cell" className={styles.rang}>
                            {nf(r.rang)}
                        </td>
                        <td role="cell" className={styles.logo}>
                            <TeamLogo abbr={r.abbr} size={30} />
                        </td>
                        <th
                            scope="row"
                            role="rowheader"
                            className={`t-team-name-table ${styles.navn}`}
                        >
                            {lagNavn(r.abbr)}
                        </th>
                        <td role="cell" className={styles.konf}>
                            {r.konferanse ?? MANGLER}
                        </td>
                        <td role="cell" className={styles.bjelkeCelle}>
                            <AvviksBjelke rating={r.rating} midtpunkt={midtpunkt} />
                        </td>
                        <td role="cell" className={styles.rating}>
                            {nf(r.rating)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
