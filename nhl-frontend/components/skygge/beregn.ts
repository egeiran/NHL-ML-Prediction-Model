/**
 * Skyggelogg (§C.7) — kildevalg og talloppsett. Rene funksjoner, ingen React.
 *
 * All filtrering og sammendrag går gjennom `settledBets()` og `summarize()` i
 * `lib/analysis.ts`. Skjermen regner ikke ut noe selv; den velger utvalg.
 *
 * Skyggeloggen er kampene vi *ikke* spilte fordi de røk på en av de to
 * tersklene — for lav EV (0,15, eller 0,30 for uavgjort) eller odds 4,00 og over
 * — ført med samme innsats og avregnet med samme logikk som ekte spill.
 * Skjermen stiller dem mot porteføljen, så «ligger tersklene riktig?» blir et
 * spørsmål med tall bak.
 *
 * Kildevalget (DECISIONS, «Datatilstand du må håndtere»): `shadow.json` er
 * fasit når den har avregnede rader. Har den ingen, sier skjermen det i stedet
 * for å vise et tomt panel som om det var et svar.
 */

import {
    settledBets,
    summarize,
    type AnalysisBet,
    type AnalysisSummary,
} from '@/lib/analysis';
import type { BetEntry, ShadowEntry } from '@/types';

/* -------------------------------------------------------------------------- */
/* Kilde                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `shadow` = skyggeloggen har avregnede rader · `ingen` = den har det ikke.
 *
 * Fallbacken til OT/SO-radene i `portfolio.json` er borte: OT/SO spilles nå på
 * lik linje med hjemme og borte, så de radene er ekte spill, ikke en skygge.
 */
export type Kilde = 'shadow' | 'ingen';

export interface Utvalg {
    kilde: Kilde;
    /** Alle avregnede spill i porteføljen — inkludert OT/SO. */
    faktisk: AnalysisSummary;
    /** Kampene vi lot ligge, fra `shadow.json`. */
    skygge: AnalysisSummary;
}

/** Sammendraget for begge panelene. */
export function velgUtvalg(
    porteføljeRader: readonly BetEntry[],
    skyggeRader: readonly ShadowEntry[],
): Utvalg {
    const alle: readonly AnalysisBet[] = porteføljeRader;
    const faktisk = settledBets(alle);
    const skygge = settledBets(skyggeRader);
    const kilde: Kilde = skygge.length > 0 ? 'shadow' : 'ingen';

    return { kilde, faktisk: summarize(faktisk), skygge: summarize(skygge) };
}

/* -------------------------------------------------------------------------- */
/* Sammenligningsbjelken                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Felles nevner for begge bjelkene: `m = max(|a|, |b|, 1)`. Samme nevner er hele
 * poenget — to bjelker med hver sin skala sammenligner ingenting.
 */
export function stolpeNevner(a: number, b: number): number {
    return Math.max(Math.abs(a), Math.abs(b), 1);
}

/** `stolpeBredde(-640, 675)` → `'94.8%'`. Ren CSS-bredde, ikke en visningsstreng. */
export function stolpeBredde(netto: number, nevner: number): string {
    if (!Number.isFinite(netto) || nevner <= 0) return '0%';
    return `${((Math.abs(netto) / nevner) * 100).toFixed(1)}%`;
}

