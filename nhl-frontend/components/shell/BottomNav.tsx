'use client';

/**
 * Mobilens bunnbar. Nøyaktig fire: Oversikt · Verdi · Kamp · Logg.
 * Elo, Modell og Skyggelogg nås fra `<AnalyseLenker />` på Oversikt.
 *
 * Baren er `position: fixed`; plassen den tar er lagt som `padding-bottom` på
 * `.app-ground` i `globals.css`, slik at heller ikke footeren havner under den.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BUNNNAV_RUTER, erAktiv } from './nav';
import styles from './BottomNav.module.css';

export function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className={styles.bunnnav} aria-label="Hovednavigasjon (mobil)">
            {BUNNNAV_RUTER.map((rute) => {
                const aktiv = erAktiv(pathname, rute.href);
                return (
                    <Link
                        key={rute.href}
                        href={rute.href}
                        className={`${styles.lenke}${aktiv ? ` ${styles.aktiv}` : ''}`}
                        aria-current={aktiv ? 'page' : undefined}
                    >
                        {rute.kort}
                    </Link>
                );
            })}
        </nav>
    );
}
