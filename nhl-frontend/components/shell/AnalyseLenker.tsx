/**
 * Lenkeliste til analysevisningene, ment å stå nederst på Oversikt.
 *
 * Bunnbaren på mobil har bare fire elementer; Elo, Modell og Skyggelogg nås
 * herfra. Komponenten er skjult over 768px, der toppnaven dekker det samme, så
 * Oversikt-skjermen kan plassere den ubetinget:
 *
 *     <AnalyseLenker />
 */

import Link from 'next/link';
import { ANALYSE_RUTER } from './nav';
import styles from './AnalyseLenker.module.css';

export function AnalyseLenker({ className }: { className?: string }) {
    return (
        <section className={`${styles.blokk}${className ? ` ${className}` : ''}`}>
            <span className="t-kicker">Analyse</span>
            <div className={styles.liste}>
                {ANALYSE_RUTER.map((rute) => (
                    <Link key={rute.href} href={rute.href} className={styles.rad}>
                        <span>
                            <span className={styles.tittel}>{rute.skjermtittel}</span>
                            <span className={styles.beskrivelse}>{rute.beskrivelse}</span>
                        </span>
                        <span className={styles.pil} aria-hidden="true">
                            →
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}
