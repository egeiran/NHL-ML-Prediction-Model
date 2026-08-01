/**
 * Divergerende avviksbjelke rundt grunnratingen (§C.5).
 *
 * Sporet er 4px `--rule-light` med en 1px `--dash`-midtlinje på 50 %. Fyllet
 * starter i midten og strekker seg høyre (teal) når laget ligger over 1500,
 * venstre (vermillion) når det ligger under:
 *
 *     dv = rating − 1500
 *     w  = min(|dv| / 100, 1) * 46          // prosent av sporet
 *     left = dv >= 0 ? 50 : 50 − w
 *
 * 100 Elo-poeng metter altså bjelken, og de resterende 4 prosentpoengene på
 * hver side er luft — fyllet renner aldri ut i kanten av kolonnen.
 *
 * Bjelken er ren dekorasjon: ratingtallet står i sin egen kolonne rett ved
 * siden av. Derfor `aria-hidden` — den ville bare doblet tallet i opplesningen.
 */

import type { CSSProperties } from 'react';
import styles from './Elo.module.css';

/** Nullpunktet bjelken divergerer rundt. */
export const MIDTPUNKT = 1500;

/** Elo-poeng som metter bjelken. */
const METNING = 100;

/** Halv sporbredde i prosent ved metning. */
const MAKS_BREDDE = 46;

export interface AvviksBjelkeProps {
    rating: number;
    /** Nullpunkt. Default 1500 — `config.base_rating` sendes inn av tabellen. */
    midtpunkt?: number;
}

export function AvviksBjelke({ rating, midtpunkt = MIDTPUNKT }: AvviksBjelkeProps) {
    const dv = rating - midtpunkt;
    const bredde = Math.min(Math.abs(dv) / METNING, 1) * MAKS_BREDDE;
    const over = dv >= 0;

    const fyll: CSSProperties = {
        left: `${over ? 50 : 50 - bredde}%`,
        width: `${bredde}%`,
    };

    return (
        <span className={styles.spor} aria-hidden="true">
            <span className={styles.midtlinje} />
            <span
                className={`${styles.fyll} ${over ? styles.fyllOver : styles.fyllUnder}`}
                style={fyll}
            />
        </span>
    );
}
