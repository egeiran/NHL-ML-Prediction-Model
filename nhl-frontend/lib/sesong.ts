/**
 * Sesongvalg for Historikk og Skyggelogg. Rene funksjoner, ingen React.
 *
 * `portfolio.json` viser bare nyeste sesong med spill, så fra første spill i en
 * ny sesong er fjoråret borte derfra. `portfolio-history.json` har alle
 * sesongene; skjermene filtrerer på `season` i radene og lar brukeren velge.
 *
 * Sesongnøkkelen er pipelinens, `"2025-26"`. Den vises som `2025/26`.
 */

import type { PillOption } from '@/components/ui';

/** Verdien for «alle sesonger» i velgeren og i `?sesong=`. */
export const ALLE_SESONGER = 'alle';

/**
 * Sesongen en dato hører til. Speiler `season_of()` i `NHL/bet_tracker.py`:
 * delt på 1. juli. Brukes bare når en rad mangler `season`.
 */
export function sesongAv(dato: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})/.exec(dato ?? '');
    if (!m) return '';
    const år = Number(m[1]);
    const start = Number(m[2]) >= 7 ? år : år - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Radens sesong: `season` når pipelinen har satt den, ellers fra datoen. */
export function radSesong(rad: { season?: string | null; date?: string | null }): string {
    return rad.season || sesongAv(rad.date);
}

/** Alle sesonger som finnes i radene, eldste først. */
export function sesongerI(...lister: readonly (readonly { season?: string | null; date?: string | null }[])[]): string[] {
    const alle = new Set<string>();
    for (const liste of lister) {
        for (const rad of liste) {
            const s = radSesong(rad);
            if (s) alle.add(s);
        }
    }
    return [...alle].sort();
}

/**
 * Leser `?sesong=`. En kjent sesong eller «alle» står; alt annet — også en
 * sesong som ikke finnes i dataen — faller tilbake til `standard` i stedet for
 * å tømme skjermen.
 */
export function lesSesong(v: string | null | undefined, sesonger: readonly string[], standard: string): string {
    if (v === ALLE_SESONGER) return v;
    return typeof v === 'string' && sesonger.includes(v) ? v : standard;
}

/** Radene i valgt sesong. «alle» gir alle. Returnerer alltid en ny array. */
export function filtrerSesong<T extends { season?: string | null; date?: string | null }>(
    rader: readonly T[],
    sesong: string,
): T[] {
    if (sesong === ALLE_SESONGER) return rader.slice();
    return rader.filter((r) => radSesong(r) === sesong);
}

/** `2025-26` → `2025/26`. Samme form som sesongen i mastheaden. */
export function sesongEtikett(sesong: string): string {
    return sesong === ALLE_SESONGER ? 'Alle sesonger' : sesong.replace('-', '/');
}

/** Pillene: nyeste sesong først, «Alle» sist. */
export function sesongValg(sesonger: readonly string[]): PillOption<string>[] {
    return [
        ...sesonger
            .slice()
            .sort()
            .reverse()
            .map((s) => ({ value: s, label: sesongEtikett(s) })),
        { value: ALLE_SESONGER, label: 'Alle' },
    ];
}
