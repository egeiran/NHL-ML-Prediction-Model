'use client';

/**
 * Footer (§B.3). Tallene er data, ikke tekst: antall kamper og Elo-datoen leses
 * fra `elo.json:meta`, slik at linja ikke blir usann ved neste pipeline-kjøring.
 */

import { nf } from '@/lib/format';
import { useElo } from '@/lib/use-data';
import styles from './Footer.module.css';

export function Footer() {
    const elo = useElo();
    const nGames = elo.data ? nf(elo.data.meta.n_games) : '—';
    const through = elo.data?.meta.through ?? '—';

    return (
        <footer className={styles.footer}>
            <div className={styles.rad}>
                <span className={styles.venstre}>
                    {`Random Forest + Elo · ${nGames} kamper · Elo t.o.m. ${through}`}
                </span>
                <span className={styles.høyre}>Blålinja · arbeidsnavn</span>
            </div>
        </footer>
    );
}
