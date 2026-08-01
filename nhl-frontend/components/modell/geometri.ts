/**
 * Geometri som bare Modell-skjermen bruker.
 *
 * Kalibreringsplottet er den ene grafen i appen der BEGGE akser er verdier
 * (sannsynlighet mot sannsynlighet), ikke indeks mot verdi. `lagSkala()` i
 * `components/chart/` er indeksbasert på x, så skalaen bygges her — men den
 * bygges som en vanlig `Skala`, slik at `venstreProsent()` / `toppProsent()`
 * og resten av grafprimitivene brukes uendret.
 */

import type { Skala } from '@/components/chart';

/* -------------------------------------------------------------------------- */
/* Kalibreringsplottet (§D.3)                                                  */
/* -------------------------------------------------------------------------- */

export const KAL_BREDDE = 520;
export const KAL_HOYDE = 400;
const PL = 46;
const PR = 14;
const PT = 14;
const PB = 40;

/** X-aksen dekker 0,15–0,72 — der modell- og markedssannsynlighetene ligger. */
export const KAL_X_LO = 0.15;
export const KAL_X_HI = 0.72;

/**
 * Y-aksen starter på 0, ikke på `KAL_X_LO` (avgjort): treffrater nær null må
 * kunne tegnes, og Wilson-intervallets nedre grense går ned mot 0,06.
 */
export const KAL_Y_LO = 0;
export const KAL_Y_HI = 0.72;

/** Verdiene som får rutenettlinje og akseetikett. */
export const KAL_X_TICKS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7] as const;
export const KAL_Y_TICKS = [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7] as const;

/**
 * Skalaen for kalibreringsplottet. `X` tar en sannsynlighet (ikke en indeks),
 * `Y` tar en treffrate. `n` er antall bøtter, kun til informasjon.
 */
export function kalibreringsSkala(n: number): Skala {
    const pw = KAL_BREDDE - PL - PR;
    const ph = KAL_HOYDE - PT - PB;
    const X = (p: number) => PL + ((p - KAL_X_LO) / (KAL_X_HI - KAL_X_LO)) * pw;
    const Y = (p: number) => PT + ph - ((p - KAL_Y_LO) / (KAL_Y_HI - KAL_Y_LO)) * ph;
    return {
        n,
        mn: KAL_Y_LO,
        mx: KAL_Y_HI,
        bredde: KAL_BREDDE,
        høyde: KAL_HOYDE,
        PL,
        PR,
        PT,
        PB,
        pw,
        ph,
        X,
        Y,
        zeroY: Y(0),
    };
}

export interface Punkt {
    x: number;
    y: number;
}

/**
 * `M x y L x y …` for en fri polylinje. `linjePath()` i `components/chart/`
 * tar en verdiliste og regner x av indeksen; her er x en verdi.
 */
export function polylinjePath(punkter: readonly Punkt[]): string {
    if (punkter.length === 0) return '';
    return punkter
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join('');
}

/** Prikkstørrelse i px: 7 ved n = 0, 16 ved n ≥ 72 (§D.5). */
export function prikkStorrelse(n: number): number {
    return 7 + Math.min(n / 8, 9);
}

/* -------------------------------------------------------------------------- */
/* Usikkerhetsstripa i simulatoren                                             */
/* -------------------------------------------------------------------------- */

/** Klemmer en verdi til [0, 1] og gir den som prosentstreng. */
export function andelProsent(andel: number): string {
    return `${(Math.max(0, Math.min(1, andel)) * 100).toFixed(2)}%`;
}
