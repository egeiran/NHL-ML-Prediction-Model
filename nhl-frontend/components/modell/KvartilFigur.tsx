'use client';

/**
 * EV-bøtter og odds-bøtter — samme komponent, ulik grupperingsnøkkel.
 *
 * Grupperte søyler: forventet antall treff (sum `model_prob`) mot faktisk
 * antall treff, fire kvartiler. ROI står som tall over søylene, `n` under dem.
 *
 * Søylene er HTML, ikke SVG. Da er hvert tall ekte tekst, figuren er sin egen
 * tilgjengelige representasjon, og typografien arver fontstacken.
 */

import type { ReactNode } from 'react';
import type { ValueBucket } from '@/lib/analysis';
import { nf, sgn } from '@/lib/format';
import styles from './Modell.module.css';

export interface KvartilFigurProps {
    kicker: string;
    tittel: string;
    bøtter: readonly ValueBucket[];
    /** Formaterer bøttegrensene: prosent for EV, to desimaler for odds. */
    grense: (v: number) => string;
    bildetekst: ReactNode;
    className?: string;
}

/** U+2013. */
const TANKESTREK = '–';

/**
 * `K1`…`K4`. Bøttene er kvartiler, og `lo`/`hi` er bare observert min/maks i
 * bøtta — kvantilsplitten deler like verdier på posisjon, så `hi` i én bøtte og
 * `lo` i den neste kan være samme råverdi (2,70 i odds-kvartilene i dag). Da
 * kan ikke intervallet bære identiteten til bøtta uten å lese som en av-med-én.
 * K-merket bærer den; intervallet står under som observert spenn.
 */
function kvartil(i: number): string {
    return `K${i + 1}`;
}

export function KvartilFigur({
    kicker,
    tittel,
    bøtter,
    grense,
    bildetekst,
    className,
}: KvartilFigurProps) {
    const maks = bøtter.reduce((m, b) => Math.max(m, b.model_expected, b.hits), 0) || 1;

    return (
        <div className={className}>
            <span className="t-kicker">{kicker}</span>
            <h2 className={styles.panelTittel}>{tittel}</h2>

            <div className={styles.tegnforklaring}>
                <span className={styles.tegn}>
                    <span className={styles.tegnForventet} aria-hidden="true" />
                    Forventet av modellen
                </span>
                <span className={styles.tegn}>
                    <span className={styles.tegnFylt} aria-hidden="true" />
                    Faktiske treff
                </span>
            </div>

            {bøtter.length === 0 ? (
                <p className={styles.tomPlott}>Ingen avgjorte spill å bøtte ennå.</p>
            ) : (
                <div className={styles.soyleRad}>
                    {bøtter.map((b, i) => (
                        <div key={`${b.lo}-${b.hi}-${i}`} className={styles.soyleBotte}>
                            <span
                                className={`${styles.soyleRoi} ${b.roi >= 0 ? 'c-teal' : 'c-vermillion'}`}
                            >
                                {sgn(b.roi, 0)}
                            </span>
                            <div className={styles.soylePar}>
                                <span
                                    className={`${styles.soyle} ${styles.soyleForventet}`}
                                    style={{ height: `${(b.model_expected / maks) * 100}%` }}
                                >
                                    <span className={styles.soyleTall}>{nf(b.model_expected, 1)}</span>
                                </span>
                                <span
                                    className={`${styles.soyle} ${styles.soyleFaktisk}`}
                                    style={{ height: `${(b.hits / maks) * 100}%` }}
                                >
                                    <span className={styles.soyleTall}>{nf(b.hits)}</span>
                                </span>
                            </div>
                            <span className={styles.soyleFot}>
                                <span className={styles.soyleKvartil}>{kvartil(i)}</span>
                                <span className={styles.soyleOmrade}>
                                    {grense(b.lo)}
                                    {TANKESTREK}
                                    {grense(b.hi)}
                                </span>
                                <span className={styles.soyleN}>n = {nf(b.n)}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {bøtter.length === 0 ? null : (
                <p className={styles.note}>
                    {kvartil(0)}
                    {TANKESTREK}
                    {kvartil(bøtter.length - 1)} er kvartiler med like mange spill i hver. Tallene under er
                    lavest og høyest observerte verdi i bøtta, og to nabobøtter kan derfor møtes på samme
                    verdi.
                </p>
            )}

            <p className={styles.noteSterk}>{bildetekst}</p>
        </div>
    );
}
