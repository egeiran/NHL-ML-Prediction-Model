/**
 * Rene utregninger for «Verdi i dag». Ingen React, ingen formatering — bare
 * tallene skjermen skal vise.
 *
 * Formlene står ordrett i `docs/blalinja/DECISIONS.md`:
 *
 *     implied_prob = 1 / odds
 *     EV           = model_prob * odds - 1
 *     is_value     = EV >= evTerskel
 *
 * `value_*`-feltene i `value-report.json` leses IKKE som EV: pipelinen har
 * historisk skrevet flere ulike definisjoner der, og DECISIONS er tydelig på at
 * EV regnes fra modellsannsynlighet og odds. Mangler oddsen, finnes ingen EV.
 */

import type { TagVariant } from '@/components/ui';
import { LAG } from '@/lib/teams';
import type { EloData, MatchupsData, ValueGame } from '@/types';

export type UtfallNøkkel = 'away' | 'draw' | 'home';

export interface Utfall {
    nøkkel: UtfallNøkkel;
    /** «Boston Bruins vinner» / «OT/SO». */
    etikett: string;
    /** Modellens sannsynlighet som brøk. */
    modell: number | null;
    /** Markedets implisitte sannsynlighet som brøk. */
    marked: number | null;
    odds: number | null;
    /** `model_prob * odds - 1`. */
    ev: number | null;
    tagg: TagVariant;
    /** OT/SO — alltid `UTELATT`, alltid halv opasitet. */
    erUavgjort: boolean;
}

export interface Kamp {
    id: string;
    /** Forkortelse, ikke fullt navn. */
    hjemme: string;
    borte: string;
    hjemmeNavn: string;
    borteNavn: string;
    /** ISO-tidspunkt for avkast, eller `null`. */
    start: string | null;
    dato: string;
    utfall: Utfall[];
    /** Antall utfall tagget `SPILL`. OT/SO teller aldri med. */
    antallSpill: number;
}

/** Elo og form for én kamp — hentet fra `elo.json` og `matchups.json`. */
export interface KampKontekst {
    eloBorte: number | null;
    eloHjemme: number | null;
    /** Hjemme minus borte. */
    eloDiff: number | null;
    /** Bortelagets fem siste, skråstrek, hjemmelagets fem siste. */
    form: string | null;
}

function erTall(n: number | null | undefined): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

/** `EV = model_prob * odds - 1`. `null` når ett av leddene mangler. */
export function evAv(modell: number | null, odds: number | null): number | null {
    if (!erTall(modell) || !erTall(odds)) return null;
    return modell * odds - 1;
}

/** Markedets implisitte sannsynlighet: feltet fra pipelinen, ellers `1 / odds`. */
export function markedAv(implisitt: number | null | undefined, odds: number | null): number | null {
    if (erTall(implisitt)) return implisitt;
    if (erTall(odds) && odds > 0) return 1 / odds;
    return null;
}

function tall(n: number | null | undefined): number | null {
    return erTall(n) ? n : null;
}

/**
 * Forkortelsen for et lag. `home_abbr`/`away_abbr` når pipelinen har skrevet
 * dem, ellers slås navnet opp blant de 32 lagene. Dette er ikke aliaslogikk
 * (DECISIONS punkt 5) — det er bare å finne koden bak et navn.
 */
export function finnAbbr(abbr: string | null | undefined, navn: string): string {
    const rå = (abbr ?? '').trim();
    if (rå !== '') return rå;
    const rent = navn.trim();
    if (rent === '') return '';
    if (LAG[rent]) return rent;
    for (const lag of Object.values(LAG)) {
        if (lag.navn.toLowerCase() === rent.toLowerCase()) return lag.abbr;
    }
    return rent;
}

/** Fullt lagnavn for en forkortelse som kan være ukjent. */
function navnFor(abbr: string, fallback: string): string {
    return LAG[abbr]?.navn ?? (fallback.trim() !== '' ? fallback.trim() : abbr);
}

function tagg(ev: number | null, evTerskel: number, erUavgjort: boolean): TagVariant {
    if (erUavgjort) return 'utelatt';
    return ev !== null && ev >= evTerskel ? 'spill' : 'nei';
}

/** Bygger de tre utfallsradene i rekkefølgen borte · OT/SO · hjemme. */
export function byggKamp(spill: ValueGame, evTerskel: number): Kamp {
    const hjemme = finnAbbr(spill.home_abbr, spill.home);
    const borte = finnAbbr(spill.away_abbr, spill.away);
    const hjemmeNavn = navnFor(hjemme, spill.home);
    const borteNavn = navnFor(borte, spill.away);

    const rå: readonly {
        nøkkel: UtfallNøkkel;
        etikett: string;
        modell: number | null;
        odds: number | null;
        implisitt: number | null | undefined;
    }[] = [
        {
            nøkkel: 'away',
            etikett: `${borteNavn} vinner`,
            modell: tall(spill.model_away_win),
            odds: tall(spill.odds_away),
            implisitt: spill.implied_away_prob,
        },
        {
            nøkkel: 'draw',
            etikett: 'OT/SO',
            modell: tall(spill.model_draw),
            odds: tall(spill.odds_draw),
            implisitt: spill.implied_draw_prob,
        },
        {
            nøkkel: 'home',
            etikett: `${hjemmeNavn} vinner`,
            modell: tall(spill.model_home_win),
            odds: tall(spill.odds_home),
            implisitt: spill.implied_home_prob,
        },
    ];

    const utfall: Utfall[] = rå.map((r) => {
        const erUavgjort = r.nøkkel === 'draw';
        const ev = evAv(r.modell, r.odds);
        return {
            nøkkel: r.nøkkel,
            etikett: r.etikett,
            modell: r.modell,
            marked: markedAv(r.implisitt, r.odds),
            odds: r.odds,
            ev,
            tagg: tagg(ev, evTerskel, erUavgjort),
            erUavgjort,
        };
    });

    return {
        id: spill.event_id,
        hjemme,
        borte,
        hjemmeNavn,
        borteNavn,
        start: spill.start_time ?? null,
        dato: spill.date,
        utfall,
        antallSpill: utfall.filter((u) => u.tagg === 'spill').length,
    };
}

/** Alle kampene, sortert på avkast og deretter kamp-id, slik at rekkefølgen er stabil. */
export function byggKamper(rapport: readonly ValueGame[], evTerskel: number): Kamp[] {
    return rapport
        .map((g) => byggKamp(g, evTerskel))
        .sort((a, b) => {
            const av = a.start ?? a.dato;
            const bv = b.start ?? b.dato;
            if (av !== bv) return av < bv ? -1 : 1;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
}

/** Summen av utfall tagget `SPILL` over et sett kamper. */
export function tellSpill(kamper: readonly Kamp[]): number {
    return kamper.reduce((sum, k) => sum + k.antallSpill, 0);
}

function eloFor(elo: EloData | null, abbr: string): number | null {
    const verdi = elo?.ratings[abbr];
    return erTall(verdi) ? verdi : null;
}

function formFor(matchups: MatchupsData | null, abbr: string): string | null {
    const siste = matchups?.teams[abbr]?.last_5;
    if (!siste || siste.length === 0) return null;
    return siste.map((k) => k.result).join('');
}

/**
 * Elo og form for én kamp. Begge kildene er valgfrie: mangler de, viser
 * skjermen `—` i stedet for å nekte å rendre kampen.
 */
export function kampKontekst(
    kamp: Kamp,
    elo: EloData | null,
    matchups: MatchupsData | null,
): KampKontekst {
    const eloBorte = eloFor(elo, kamp.borte);
    const eloHjemme = eloFor(elo, kamp.hjemme);
    const formBorte = formFor(matchups, kamp.borte);
    const formHjemme = formFor(matchups, kamp.hjemme);
    return {
        eloBorte,
        eloHjemme,
        eloDiff: eloBorte !== null && eloHjemme !== null ? eloHjemme - eloBorte : null,
        form: formBorte !== null && formHjemme !== null ? `${formBorte} / ${formHjemme}` : null,
    };
}

/** Bredden på et sannsynlighetslag i stolpen. */
export function stolpeBredde(p: number | null): string {
    if (!erTall(p)) return '0%';
    return `${Math.min(Math.max(p, 0), 1) * 100}%`;
}

/** EV-farge: over terskel → teal, positiv → ink, ellers muted. */
export function evKlasse(ev: number | null, evTerskel: number): string {
    if (ev === null) return 'c-muted';
    if (ev >= evTerskel) return 'c-teal';
    return ev > 0 ? 'c-ink' : 'c-muted';
}
