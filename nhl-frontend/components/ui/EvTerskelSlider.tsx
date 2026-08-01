'use client';

/**
 * Kontrollen for EV-terskelen. Slider 5–45 %, steg 1, persistert i
 * `localStorage`. Leser og skriver den DELTE verdien via `useEvTerskel()` —
 * ingen lokal state, ingen prop-drilling. Kan stå på flere skjermer samtidig;
 * de vil alltid vise samme tall.
 *
 *   <EvTerskelSlider />
 *   <EvTerskelSlider visAvvik={false} />   // uten advarselslinja
 *
 * Kontrollen står stille. Fotavtrykket til blokka er det samme enten
 * avviksnotisen vises eller ikke: notisen har sin egen grid-kolonne med fast
 * bredde, og når terskelen følger pipelinen rendres den samme setningen med
 * `visibility: hidden`. Da er høyden reservert av den faktiske teksten i stedet
 * for et magisk px-tall, og slideren flytter seg ikke ett eneste piksel når
 * brukeren drar den forbi pipelinens terskel.
 */

import { EV_TERSKEL_MAKS, EV_TERSKEL_MIN, useEvTerskel } from '@/lib/config';
import { pc } from '@/lib/format';
import styles from './EvTerskelSlider.module.css';

export interface EvTerskelSliderProps {
    /** Etikett over slideren. Default «EV-terskel». */
    label?: string;
    /** Vis linja om at brukerens terskel avviker fra pipelinens. Default `true`. */
    visAvvik?: boolean;
    className?: string;
}

export function EvTerskelSlider({
    label = 'EV-terskel',
    visAvvik = true,
    className,
}: EvTerskelSliderProps) {
    const { evTerskel, setEvTerskel, pipelineTerskel, avviker, tilbakestill } = useEvTerskel();

    // Setningen bygges likt i begge tilstander. Den skjulte varianten viser
    // pipelinens terskel på begge plasser — like mange tegn som den synlige, så
    // linjefallet, og dermed høyden, er identisk.
    const notis = `Du viser EV ≥ ${pc(avviker ? evTerskel : pipelineTerskel, 0)}. Pipelinen spiller på ${pc(pipelineTerskel, 0)}, så tallene her følger ikke bet_history.csv. `;

    return (
        <div className={`${styles.blokk}${className ? ` ${className}` : ''}`}>
            <label className={styles.etikett}>
                <span className="t-stat-label">{label}</span>
                <span className={styles.rad}>
                    <input
                        type="range"
                        className={styles.spor}
                        min={Math.round(EV_TERSKEL_MIN * 100)}
                        max={Math.round(EV_TERSKEL_MAKS * 100)}
                        step={1}
                        value={Math.round(evTerskel * 100)}
                        onChange={(e) => setEvTerskel(Number(e.target.value) / 100)}
                        aria-valuetext={pc(evTerskel, 0)}
                    />
                    <span className={styles.verdi}>{pc(evTerskel, 0)}</span>
                </span>
            </label>

            {visAvvik ? (
                <span
                    className={`${styles.note}${avviker ? '' : ` ${styles.noteReservert}`}`}
                    aria-hidden={avviker ? undefined : true}
                >
                    {notis}
                    <button
                        type="button"
                        className={styles.tilbakestill}
                        onClick={tilbakestill}
                        tabIndex={avviker ? undefined : -1}
                    >
                        Tilbakestill
                    </button>
                </span>
            ) : null}
        </div>
    );
}
