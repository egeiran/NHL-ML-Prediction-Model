/**
 * Utah-datavinduet — delt av Skyggelogg (§C.7) og Elo (§C.5).
 *
 * Begge skjermene forteller om den samme perioden, og skal fortelle om den med
 * de samme tallene. Filteret bodde en stund i `components/skygge/beregn.ts` og
 * ble importert derfra av `components/elo/Parametere.tsx` — en skjerm som leser
 * fra en annen skjerms mappe er nøyaktig koblingen filsonene skal hindre. Den
 * bor her i stedet.
 */

import {
    settledBets,
    summarize,
    type AnalysisSummary,
} from '@/lib/analysis';
import type { BetEntry } from '@/types';

/**
 * Datavinduet fra `PROBLEMS.md`: alle Utah-spill til og med 2026-04-17 ble lagt
 * inn på korrupt form-grunnlag. Filteret er ordrett det samme som pandas-
 * snutten der (`date <= 2026-04-17` og `UTA`/`ARI` i et av lagfeltene).
 *
 * Dette er *ikke* aliaslogikk i DECISIONS-forstand (punkt 5) — ingenting mappes
 * fra `ARI` til `UTA` for visning. Det er et navngitt historisk datavindu som
 * plukkes ut for å telles, og begge forkortelsene står med fordi historikken
 * inneholder rader fra før eksport-steget normaliserte dem.
 */
export const UTAH_VINDU_TIL = '2026-04-17';

const UTAH_ABBR: readonly string[] = ['UTA', 'ARI'];

function erUtah(b: BetEntry): boolean {
    return (
        (b.home_abbr != null && UTAH_ABBR.includes(b.home_abbr)) ||
        (b.away_abbr != null && UTAH_ABBR.includes(b.away_abbr))
    );
}

export interface UtahVindu {
    sammendrag: AnalysisSummary;
    /** Hvor mange av spillene i vinduet som var OT/SO — de ligger også i skyggeloggen. */
    otso: number;
    /** Netto for OT/SO-spillene i vinduet, i kroner. */
    otsoNetto: number;
}

export function utahVindu(porteføljeRader: readonly BetEntry[]): UtahVindu {
    const iVindu = porteføljeRader.filter((b) => erUtah(b) && b.date <= UTAH_VINDU_TIL);
    const avregnet = settledBets(iVindu);
    const otso = avregnet.filter((b) => b.selection === 'draw');
    return {
        sammendrag: summarize(avregnet),
        otso: otso.length,
        otsoNetto: summarize(otso).profit,
    };
}
