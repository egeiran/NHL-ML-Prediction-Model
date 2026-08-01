/**
 * Skyggelogg (§C.7) — kildevalg og talloppsett. Rene funksjoner, ingen React.
 *
 * All filtrering og sammendrag går gjennom `settledBets()` og `summarize()` i
 * `lib/analysis.ts`. Skjermen regner ikke ut noe selv; den velger utvalg.
 *
 * Kildevalget er skjermens hele poeng (DECISIONS, «Datatilstand du må håndtere»):
 * `shadow.json` er fasit når den har rader, men den er tom i dag fordi ingen
 * sesong har kjørt siden OT/SO-spillene ble tatt ut av `bet_history.csv`. Da
 * faller skjermen tilbake på `selection === 'draw'`-radene som fortsatt ligger i
 * `portfolio.json`, og sier i UI hvilken kilde tallene kommer fra.
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
 * `shadow` = den ekte skyggeloggen · `portefølje` = OT/SO-radene i historikken ·
 * `ingen` = ingen av delene har avregnede rader.
 */
export type Kilde = 'shadow' | 'portefølje' | 'ingen';

export interface Utvalg {
    kilde: Kilde;
    /** `selection !== 'draw'` — spillene som faktisk ble lagt inn. */
    faktisk: AnalysisSummary;
    /** Skyggeloggen, fra `shadow.json` eller fra OT/SO-radene. */
    skygge: AnalysisSummary;
}

/**
 * Velger skyggekilde og lager sammendraget for begge panelene.
 *
 * Rekkefølgen er fast: `shadow.json` vinner så snart den har én avregnet rad.
 * Skjermen bytter altså kilde av seg selv den dagen skyggeloggen fylles.
 */
export function velgUtvalg(
    porteføljeRader: readonly BetEntry[],
    skyggeRader: readonly ShadowEntry[],
): Utvalg {
    const alle: readonly AnalysisBet[] = porteføljeRader;
    const faktisk = settledBets(alle, { excludeDraw: true });
    const fraShadow = settledBets(skyggeRader);
    const fraDraw = settledBets(alle).filter((b) => b.selection === 'draw');

    const skygge = fraShadow.length > 0 ? fraShadow : fraDraw;
    const kilde: Kilde =
        fraShadow.length > 0 ? 'shadow' : fraDraw.length > 0 ? 'portefølje' : 'ingen';

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

/* Utah-vinduet lå her, men Elo-skjermen forteller om det samme vinduet og
 * importerte `utahVindu()` herfra. En skjerm som leser fra en annen skjerms
 * mappe er koblingen filsonene skal hindre, så filteret bor i `lib/utah.ts`. */
