'use client';

/**
 * Masthead + toppnav. Sticky, `z-index: 30`, med `border-bottom: 1px solid ink`.
 * Samlet høyde er `--header-h`; hero-en på Oversikt regner
 * `calc(100vh - var(--header-h))` av det samme tokenet, så de kan ikke drifte.
 *
 * Meta-klyngen leser `meta.json` (sist oppdatert), `elo.json` (sesong) og
 * `value-report.json` (status). Alle tre er små og memoiserte i `lib/data.ts`.
 */

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dISO } from '@/lib/format';
import { useElo, useMeta, useValueReport } from '@/lib/use-data';
import { NAV_RUTER, NAV_SKILLE_ETTER, erAktiv } from './nav';
import styles from './Header.module.css';

/** `2026-04-16` → `2025/26`. Sesongen brekker i august. */
function sesongEtikett(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    if (!m) return null;
    const år = Number(m[1]);
    const måned = Number(m[2]);
    const start = måned >= 8 ? år : år - 1;
    return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

export function Header() {
    const pathname = usePathname();
    const meta = useMeta();
    const elo = useElo();
    const value = useValueReport();

    const sesong = sesongEtikett(elo.data?.meta.through) ?? '—';
    const oppdatert = meta.data ? dISO(meta.data.generated_at) : '—';
    const status = value.loading || value.data === null
        ? '—'
        : value.data.length > 0
          ? 'Sesong i gang'
          : 'Sesongpause';

    return (
        <header className={styles.header}>
            <div className={styles.masthead}>
                <Link href="/" className={styles.merke} aria-label="Blålinja — til oversikten">
                    <span className={`t-wordmark ${styles.ordmerke}`}>Blålinja</span>
                    <span className={styles.undertittel}>
                        NHL-modell
                        <br />
                        Porteføljerapport
                    </span>
                </Link>

                <div className={styles.meta}>
                    <div className={`${styles.metablokk} ${styles.metaskjultPåMobil}`}>
                        <span className={styles.metaetikett}>Sesong</span>
                        <span className={styles.metaverdi}>{sesong}</span>
                    </div>
                    <div className={styles.metablokk}>
                        <span className={styles.metaetikett}>Sist oppdatert</span>
                        <span className={styles.metaverdi}>{oppdatert}</span>
                    </div>
                    <div className={`${styles.metablokk} ${styles.metaskjultPåMobil}`}>
                        <span className={styles.metaetikett}>Status</span>
                        <span className={styles.metaverdi}>{status}</span>
                    </div>
                </div>
            </div>

            <nav className={styles.nav} aria-label="Hovednavigasjon">
                {NAV_RUTER.map((rute, i) => {
                    const aktiv = erAktiv(pathname, rute.href);
                    return (
                        <Fragment key={rute.href}>
                            <Link
                                href={rute.href}
                                className={`t-nav-item ${styles.navlenke}${aktiv ? ` ${styles.aktiv}` : ''}`}
                                aria-current={aktiv ? 'page' : undefined}
                            >
                                {rute.tittel}
                            </Link>
                            {i === NAV_SKILLE_ETTER ? <span className={styles.skille} aria-hidden="true" /> : null}
                        </Fragment>
                    );
                })}
            </nav>
        </header>
    );
}
