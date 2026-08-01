/**
 * Filtrering, sortering og nøkkeltall for Historikk (§C.4).
 *
 * Ren logikk, ingen React: skjermen memoiserer kallene. 202 rader skal ikke
 * sorteres på hver render, og de skal ikke sorteres to steder heller.
 *
 * Nøkkeltallene regnes av det **filtrerte** utvalget. Et tall som står igjen
 * fra totalen mens et filter er aktivt, er en løgn i overskriftsstørrelse.
 */

import type { PillOption } from '@/components/ui';
import { erTall } from '@/lib/spill';
import type { BetEntry } from '@/types';

/* -------------------------------------------------------------------------- */
/* Filtertyper                                                                 */
/* -------------------------------------------------------------------------- */

export type StatusFilter = 'alle' | 'vunnet' | 'tapt';
export type UtfallFilter = 'alle' | 'hjemme' | 'borte' | 'otso';
export type Sortering = 'nyeste' | 'ev' | 'netto';

export const STATUS_VALG: readonly PillOption<StatusFilter>[] = [
    { value: 'alle', label: 'Alle' },
    { value: 'vunnet', label: 'Vunnet' },
    { value: 'tapt', label: 'Tapt' },
];

export const UTFALL_VALG: readonly PillOption<UtfallFilter>[] = [
    { value: 'alle', label: 'Alle utfall' },
    { value: 'hjemme', label: 'Hjemme' },
    { value: 'borte', label: 'Borte' },
    { value: 'otso', label: 'OT/SO' },
];

export const SORT_VALG: readonly PillOption<Sortering>[] = [
    { value: 'nyeste', label: 'Nyeste' },
    { value: 'ev', label: 'Høyest EV' },
    { value: 'netto', label: 'Beste netto' },
];

export const STANDARD_STATUS: StatusFilter = 'alle';
export const STANDARD_UTFALL: UtfallFilter = 'alle';
export const STANDARD_SORT: Sortering = 'nyeste';

function er<V extends string>(valg: readonly PillOption<V>[], v: string | null | undefined): v is V {
    return typeof v === 'string' && valg.some((o) => o.value === v);
}

/** Leser `?status=` og faller tilbake til standarden ved ukjent verdi. */
export function lesStatus(v: string | null | undefined): StatusFilter {
    return er(STATUS_VALG, v) ? v : STANDARD_STATUS;
}

export function lesUtfall(v: string | null | undefined): UtfallFilter {
    return er(UTFALL_VALG, v) ? v : STANDARD_UTFALL;
}

export function lesSort(v: string | null | undefined): Sortering {
    return er(SORT_VALG, v) ? v : STANDARD_SORT;
}

/* -------------------------------------------------------------------------- */
/* Filtrering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `selection` er `'home' | 'draw' | 'away'` — OT/SO er `draw`. Typen tillater
 * en vilkårlig streng, så ukjente verdier faller ut av utfallsfiltrene i
 * stedet for å bli tvunget inn i feil bøtte.
 */
const UTFALL_NØKKEL: Record<Exclude<UtfallFilter, 'alle'>, string> = {
    hjemme: 'home',
    borte: 'away',
    otso: 'draw',
};

const STATUS_NØKKEL: Record<Exclude<StatusFilter, 'alle'>, BetEntry['status']> = {
    vunnet: 'won',
    tapt: 'lost',
};

export function filtrer(
    bets: readonly BetEntry[],
    status: StatusFilter,
    utfall: UtfallFilter,
): BetEntry[] {
    const ønsketStatus = status === 'alle' ? null : STATUS_NØKKEL[status];
    const ønsketUtfall = utfall === 'alle' ? null : UTFALL_NØKKEL[utfall];
    return bets.filter(
        (b) =>
            (ønsketStatus === null || b.status === ønsketStatus) &&
            (ønsketUtfall === null || b.selection === ønsketUtfall),
    );
}

/* -------------------------------------------------------------------------- */
/* Sortering                                                                   */
/* -------------------------------------------------------------------------- */

/** Millisekunder for radens kamptidspunkt. Datoen alene er nok når `start_time` mangler. */
function tid(b: BetEntry): number {
    if (b.start_time) {
        const t = Date.parse(b.start_time);
        if (!Number.isNaN(t)) return t;
    }
    const d = Date.parse(`${b.date}T00:00:00Z`);
    return Number.isNaN(d) ? 0 : d;
}

/** Sorterings- og summeringsverdi: manglende tall er 0, ikke `null`. */
function tall(n: number | null | undefined): number {
    return erTall(n) ? n : 0;
}

/** Nyeste først, med `event_id` som siste, deterministiske skille. */
function nyesteFørst(a: BetEntry, b: BetEntry): number {
    return tid(b) - tid(a) || (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0);
}

/** Returnerer alltid en ny array — inndata muteres ikke. */
export function sorter(bets: readonly BetEntry[], sortering: Sortering): BetEntry[] {
    const kopi = bets.slice();
    switch (sortering) {
        case 'ev':
            return kopi.sort((a, b) => tall(b.value) - tall(a.value) || nyesteFørst(a, b));
        case 'netto':
            return kopi.sort((a, b) => tall(b.profit) - tall(a.profit) || nyesteFørst(a, b));
        case 'nyeste':
        default:
            return kopi.sort(nyesteFørst);
    }
}

/* -------------------------------------------------------------------------- */
/* Nøkkeltall                                                                  */
/* -------------------------------------------------------------------------- */

export interface Nøkkeltall {
    /** Antall rader i utvalget, åpne inkludert. */
    utvalg: number;
    /** Avregnede rader (`won` + `lost`). Nevneren i treffraten. */
    avregnede: number;
    åpne: number;
    /** `null` når ingenting er avregnet — da finnes det ingen treffrate å vise. */
    treffrate: number | null;
    /** Sum `profit` over avregnede rader. Åpne spill har ingen netto ennå. */
    netto: number;
}

export function nøkkeltall(bets: readonly BetEntry[]): Nøkkeltall {
    let vunnet = 0;
    let avregnede = 0;
    let netto = 0;
    for (const b of bets) {
        if (b.status === 'pending') continue;
        avregnede += 1;
        netto += tall(b.profit);
        if (b.status === 'won') vunnet += 1;
    }
    return {
        utvalg: bets.length,
        avregnede,
        åpne: bets.length - avregnede,
        treffrate: avregnede > 0 ? vunnet / avregnede : null,
        netto,
    };
}

/* -------------------------------------------------------------------------- */
/* Radpresentasjon                                                             */
/* -------------------------------------------------------------------------- */

export type Fortegn = 'positiv' | 'negativ' | 'null';

export function fortegn(n: number | null | undefined): Fortegn {
    if (!erTall(n) || n === 0) return 'null';
    return n > 0 ? 'positiv' : 'negativ';
}

/** «Hjem» · «Borte» · «OT/SO». Ukjente verdier vises rått framfor å gjettes bort. */
export function spillEtikett(selection: string): string {
    switch (selection) {
        case 'home':
            return 'Hjem';
        case 'away':
            return 'Borte';
        case 'draw':
            return 'OT/SO';
        default:
            return selection;
    }
}

export function resultatEtikett(status: BetEntry['status']): string {
    switch (status) {
        case 'won':
            return 'Vunnet';
        case 'lost':
            return 'Tapt';
        case 'pending':
        default:
            return 'Åpen';
    }
}
