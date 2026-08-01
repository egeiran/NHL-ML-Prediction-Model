/**
 * Paringen i adressefeltet, slik at et oppgjør kan deles som lenke:
 *
 *     /kamp?hjemme=BOS&borte=TOR&oh=2.2&od=3.9&oa=3.1
 *
 * Bevisst enkelt: URL-en leses én gang som starttilstand og skrives tilbake med
 * `history.replaceState`. Ingen ruting, ingen navigasjon, ingen `router.push`
 * per tastetrykk — skjermen skal ikke fylle historikken med 40 mellomtilstander
 * mens noen skriver «2,45».
 *
 * Alt valideres på vei inn: en ukjent forkortelse eller en ulesbar odds faller
 * tilbake på standardvalget i stedet for å rendre et halvt oppgjør.
 */

import { LAG } from '@/lib/teams';
import type { Valg } from './beregn';

export const STANDARD_VALG: Valg = {
    home: 'BOS',
    away: 'TOR',
    oh: '2.20',
    od: '3.90',
    oa: '3.10',
};

/** Query-nøklene. Norske, som resten av UI-et. */
export const NØKLER = {
    home: 'hjemme',
    away: 'borte',
    oh: 'oh',
    od: 'od',
    oa: 'oa',
} as const;

/** Leseren av query-parametre. `URLSearchParams` og Next sin er like nok. */
export interface Søk {
    get(navn: string): string | null;
}

function lagFra(søk: Søk | null, nøkkel: string, fallback: string): string {
    const rå = søk?.get(nøkkel)?.trim().toUpperCase();
    return rå && LAG[rå] ? rå : fallback;
}

function oddsFra(søk: Søk | null, nøkkel: string, fallback: string): string {
    const rå = søk?.get(nøkkel)?.trim().replace(',', '.');
    if (!rå) return fallback;
    const n = Number.parseFloat(rå);
    return Number.isFinite(n) && n > 0 ? String(n) : fallback;
}

/** Starttilstanden: query-parametrene der de finnes, ellers standardvalget. */
export function fraQuery(søk: Søk | null): Valg {
    return {
        home: lagFra(søk, NØKLER.home, STANDARD_VALG.home),
        away: lagFra(søk, NØKLER.away, STANDARD_VALG.away),
        oh: oddsFra(søk, NØKLER.oh, STANDARD_VALG.oh),
        od: oddsFra(søk, NØKLER.od, STANDARD_VALG.od),
        oa: oddsFra(søk, NØKLER.oa, STANDARD_VALG.oa),
    };
}

/** Gjeldende valg som query-streng, uten `?`. */
export function tilQuery(valg: Valg): string {
    return new URLSearchParams({
        [NØKLER.home]: valg.home,
        [NØKLER.away]: valg.away,
        [NØKLER.oh]: valg.oh,
        [NØKLER.od]: valg.od,
        [NØKLER.oa]: valg.oa,
    }).toString();
}
