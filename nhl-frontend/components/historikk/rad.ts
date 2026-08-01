/**
 * Radmodellen som både tabellen og mobilkortene leser. Ett sted å bestemme hva
 * en rad *er*, så desktop og mobil ikke sier forskjellige ting om samme spill.
 */

import { MANGLER } from '@/lib/format';
import { lagNavn } from '@/lib/teams';
import type { BetEntry } from '@/types';

/** «Carolina Hurricanes hos Vegas Golden Knights». Borte først, som i designet. */
export function kampTekst(b: BetEntry): string {
    const hjemme = b.home_abbr ? lagNavn(b.home_abbr) : '';
    const borte = b.away_abbr ? lagNavn(b.away_abbr) : '';
    if (hjemme && borte) return `${borte} hos ${hjemme}`;
    if (hjemme) return `hos ${hjemme}`;
    if (borte) return borte;
    return MANGLER;
}

/** Stabil React-nøkkel. `event_id` alene holder ikke — samme kamp kan ha flere spill. */
export function radNøkkel(b: BetEntry, i: number): string {
    return `${b.event_id}:${b.selection}:${i}`;
}
