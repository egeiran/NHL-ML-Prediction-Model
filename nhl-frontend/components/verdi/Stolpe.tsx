/**
 * Tolags sannsynlighetsstolpe (§C.2): markedet i `--dash` bak, modellen i teal
 * (SPILL) eller ink foran. Modellaget stikker 1px over og under sporet, slik at
 * de to lagene er til å skille fra hverandre uten farge alene.
 *
 * Rent dekorativ — de samme tallene står som tekst i samme rad, så stolpen er
 * `aria-hidden`.
 */

import { stolpeBredde } from './beregn';
import styles from './Verdi.module.css';

export interface StolpeProps {
    /** Markedets implisitte sannsynlighet som brøk. */
    marked: number | null;
    /** Modellens sannsynlighet som brøk. */
    modell: number | null;
    /** Fargelegger modellaget teal. */
    spill: boolean;
    className?: string;
}

export function Stolpe({ marked, modell, spill, className }: StolpeProps) {
    return (
        <div className={`${styles.stolpe}${className ? ` ${className}` : ''}`} aria-hidden="true">
            <span className={styles.stolpeMarked} style={{ width: stolpeBredde(marked) }} />
            <span
                className={`${styles.stolpeModell}${spill ? ` ${styles.stolpeSpill}` : ''}`}
                style={{ width: stolpeBredde(modell) }}
            />
        </div>
    );
}
