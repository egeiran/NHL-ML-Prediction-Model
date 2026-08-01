/**
 * Radmodellen som både tabellen og mobilkortene leser. Ett sted å bestemme hva
 * en rad *er*, så desktop og mobil ikke sier forskjellige ting om samme spill.
 */

import { kampTekst } from '@/lib/spill';
import type { BetEntry } from '@/types';

/**
 * «Carolina Hurricanes hos Vegas Golden Knights». Borte først, som i designet.
 * Bor i `lib/spill.ts` fordi Oversikt viser den samme raden.
 */
export { kampTekst };

/** Stabil React-nøkkel. `event_id` alene holder ikke — samme kamp kan ha flere spill. */
export function radNøkkel(b: BetEntry, i: number): string {
    return `${b.event_id}:${b.selection}:${i}`;
}
