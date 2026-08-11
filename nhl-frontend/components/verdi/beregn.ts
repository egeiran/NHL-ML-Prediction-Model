/**
 * Rene utregninger for «Verdi i dag». Ingen React, ingen formatering — bare
 * tallene skjermen skal vise.
 *
 * Formlene og tagge-logikken ligger i `lib/spill.ts` — Kampanalyse bruker de
 * samme. Her står bare det som er Verdi-skjermens eget: radoppbyggingen,
 * sorteringen og kampkonteksten.
 *
 * EV leses fra `value_*` når feltet finnes. Det er samme definisjon som
 * formelen (PROBLEMS.md melder den gamle tvetydigheten som lukket), men regnet
 * fra den urundede sannsynligheten — se `evForUtfall` i `lib/spill.ts`.
 */

import type { TagVariant } from '@/components/ui';
import {
    erTall,
    evAv,
    evForUtfall,
    evKlasse,
    evTerskelFor,
    markedAv,
    navnFor,
    stolpeBredde,
    tagg,
    utelattGrunn,
    type UtelattGrunn,
} from '@/lib/spill';
import { LAG } from '@/lib/teams';
import type { EloData, MatchupsData, ValueGame } from '@/types';

/**
 * Videresendt fra `lib/spill.ts` så kallstedene i denne mappen slipper å vite
 * hvor de bor. `evAv`/`markedAv` er samme funksjoner som før.
 */
export { evAv, evKlasse, markedAv, stolpeBredde, type UtelattGrunn };

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
    /** `value_*` når pipelinen har skrevet det, ellers `model_prob * odds - 1`. */
    ev: number | null;
    tagg: TagVariant;
    /** OT/SO. `UTELATT` bare når OT/SO-spill er skrudd av. */
    erUavgjort: boolean;
    /**
     * Hvorfor utfallet er `UTELATT`: `uavgjort` (OT/SO) eller `oddstak`
     * (odds ≥ `meta.max_odds`, altså over pipelinens grense). `null` når
     * utfallet vurderes på EV.
     */
    utelattGrunn: UtelattGrunn | null;
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
    /** Antall utfall tagget `SPILL`. */
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
    if (Object.hasOwn(LAG, rent)) return rent;
    for (const lag of Object.values(LAG)) {
        if (lag.navn.toLowerCase() === rent.toLowerCase()) return lag.abbr;
    }
    return rent;
}

/**
 * Bygger de tre utfallsradene i rekkefølgen borte · OT/SO · hjemme.
 *
 * `maxOdds` er `meta.json:max_odds` — pipelinens oddstak. Utelates den, gjelder
 * ingen grense, og skjermen kan komme til å tagge et utfall `SPILL` med odds
 * over taket, som `bet_history.csv` garantert ikke får. Send den alltid inn når
 * `meta` er lastet.
 *
 * Merk at taket ikke gir paritet med loggen: `record_new_bets()` i
 * `NHL/bet_tracker.py` tar høyst ETT utfall per kamp – det beste av dem som
 * klarer sin egen terskel – og bare når alle tre oddsene finnes. Denne skjermen
 * viser alle kvalifiserende utfall. Taket lukker én kilde til avvik, ikke
 * avviket.
 */
export function byggKamp(
    spill: ValueGame,
    evTerskel: number,
    maxOdds?: number | null,
    drawEvTerskel?: number | null,
    allowDrawBets?: boolean | null,
): Kamp {
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
        verdi: number | null | undefined;
    }[] = [
        {
            nøkkel: 'away',
            etikett: `${borteNavn} vinner`,
            modell: tall(spill.model_away_win),
            odds: tall(spill.odds_away),
            implisitt: spill.implied_away_prob,
            verdi: spill.value_away,
        },
        {
            nøkkel: 'draw',
            etikett: 'OT/SO',
            modell: tall(spill.model_draw),
            odds: tall(spill.odds_draw),
            implisitt: spill.implied_draw_prob,
            verdi: spill.value_draw,
        },
        {
            nøkkel: 'home',
            etikett: `${hjemmeNavn} vinner`,
            modell: tall(spill.model_home_win),
            odds: tall(spill.odds_home),
            implisitt: spill.implied_home_prob,
            verdi: spill.value_home,
        },
    ];

    const utfall: Utfall[] = rå.map((r) => {
        const erUavgjort = r.nøkkel === 'draw';
        const ev = evForUtfall(r.verdi, r.modell, r.odds);
        const grunn = utelattGrunn(erUavgjort, r.odds, maxOdds, allowDrawBets);
        // OT/SO måles mot sin egen, høyere terskel — se evTerskelFor().
        const merke = tagg(ev, evTerskelFor(erUavgjort, evTerskel, drawEvTerskel), grunn);
        return {
            nøkkel: r.nøkkel,
            etikett: r.etikett,
            modell: r.modell,
            marked: markedAv(r.implisitt, r.odds),
            odds: r.odds,
            ev,
            tagg: merke,
            erUavgjort,
            // Grunnen dempes og forklares i UI, så den følger taggen: et utfall
            // som uansett faller på EV er `NEI`, ikke et dempet «over oddstaket».
            utelattGrunn: merke === 'utelatt' ? grunn : null,
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

/**
 * Alle kampene, sortert på avkast og deretter kamp-id, slik at rekkefølgen er
 * stabil. `maxOdds`, `drawEvTerskel` og `allowDrawBets` er pipelinens egne
 * regler fra `meta.json` — send dem inn så skjermen ikke tagger spill pipelinen
 * ville forkastet, eller utelater OT/SO den faktisk tar.
 */
export function byggKamper(
    rapport: readonly ValueGame[],
    evTerskel: number,
    maxOdds?: number | null,
    drawEvTerskel?: number | null,
    allowDrawBets?: boolean | null,
): Kamp[] {
    return rapport
        .map((g) => byggKamp(g, evTerskel, maxOdds, drawEvTerskel, allowDrawBets))
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
