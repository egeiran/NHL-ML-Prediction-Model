/**
 * Rene utregninger for «Kampanalyse» (§C.3). Ingen React, ingen formatering —
 * bare tallene skjermen skal vise.
 *
 * Formlene står ordrett i `docs/blalinja/DECISIONS.md`:
 *
 *     implied_prob = 1 / odds
 *     EV           = model_prob * odds - 1
 *     is_value     = EV >= evTerskel
 *
 * Oddsen kommer fra tre frie tekstfelt, så tallene her må tåle tomt felt,
 * bokstaver og verdier som ikke er en pris i det hele tatt. To tilstander
 * holdes fra hverandre:
 *
 *   - **Ingen odds** (tomt/ubrukelig felt) → `null`. Skjermen viser `—` via
 *     `lib/format`, ikke et oppdiktet tall.
 *   - **Ugyldig odds** (`<= 1`, altså en pris som ikke kan gi gevinst) →
 *     marked 0 og EV −1, slik §C.3 «Tilstander» krever. Feltet får ingen rød
 *     ramme; tallene sier fra selv.
 */

import type { TagVariant } from '@/components/ui';
import { slåOppParing } from '@/lib/data';
import {
    erTall,
    evKlasse,
    stolpeBredde,
    tagg,
    utelattGrunn,
    type UtelattGrunn,
} from '@/lib/spill';
import { lagNavn } from '@/lib/teams';
import type { EloData, GameInfo, MatchupsData } from '@/types';

/** Videresendt fra `lib/spill.ts` — samme funksjoner som Verdi bruker. */
export { evKlasse, stolpeBredde, type UtelattGrunn };

export type UtfallNøkkel = 'home' | 'draw' | 'away';

/** Modellpris når paringen ikke finnes i `matchups.json` (§C.3). */
export const FALLBACK_PRIS = { home: 0.33, draw: 0.25, away: 0.42 } as const;

/** Hjemmefordelen Elo bruker når `elo.json:config` ikke er lastet. */
export const HJEMMEFORDEL_FALLBACK = 50;

export interface Utfall {
    nøkkel: UtfallNøkkel;
    /** «Boston Bruins vinner (hjemme)». */
    etikett: string;
    /** Modellens sannsynlighet som brøk. */
    modell: number;
    /** Markedets implisitte sannsynlighet, `null` når feltet er tomt. */
    marked: number | null;
    /** Oddsen slik den ble tolket, `null` når feltet er tomt eller ulesbart. */
    odds: number | null;
    /** `model_prob * odds - 1`, `null` når det ikke finnes odds. */
    ev: number | null;
    tagg: TagVariant;
    /** OT/SO — alltid `UTELATT`: `meta.json:allow_draw_bets` er `false`. */
    erUavgjort: boolean;
    /**
     * Hvorfor utfallet er `UTELATT`: `uavgjort` (OT/SO) eller `oddstak`
     * (odds ≥ `meta.max_odds` — pipelinen ville forkastet spillet). `null` når
     * utfallet vurderes på EV.
     */
    utelattGrunn: UtelattGrunn | null;
    /** EV over terskel og ikke utelatt. Styrer teal på figur og stolpe. */
    spill: boolean;
}

export interface EloOppsummering {
    hjemme: number | null;
    borte: number | null;
    hjemmefordel: number;
    /** `hjemme + hjemmefordel − borte`. `null` når en rating mangler. */
    justertDiff: number | null;
}

export interface FormRad {
    abbr: string;
    navn: string;
    kamper: readonly GameInfo[];
}

export interface Analyse {
    hjemmeNavn: string;
    borteNavn: string;
    /** «Toronto Maple Leafs hos Boston Bruins». */
    tittel: string;
    /** `hjemmeseier` · `OT/SO` · `borteseier`. */
    anbefaling: string;
    /** `false` når paringen ikke finnes og fallbackprisen brukes. */
    harPris: boolean;
    /** Rekkefølge: hjemme · OT/SO · borte. */
    utfall: Utfall[];
    elo: EloOppsummering;
    /** Bortelaget først, slik designet viser det. */
    form: FormRad[];
}

export interface Valg {
    home: string;
    away: string;
    /** Rå feltverdier — skjemaet eier strengene, ikke tallene. */
    oh: string;
    od: string;
    oa: string;
}

/**
 * Tolker et oddsfelt. Tomt felt, bokstaver og `Infinity` gir `null`; komma
 * godtas som desimalskille fordi det er det norske tastaturet skriver.
 */
export function tolkOdds(rå: string): number | null {
    const rent = rå.trim().replace(',', '.');
    if (rent === '') return null;
    const n = Number.parseFloat(rent);
    return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Håndskrevne odds — bevisst avvik fra `lib/spill.ts`                          */
/*                                                                             */
/* De to funksjonene under gjør noe annet enn `markedAv`/`evAv` i `lib/spill`,  */
/* og navnene sier hvorfor: oddsen kommer fra tre frie tekstfelt, ikke fra      */
/* pipelinen. En pris på 0,8 er ikke en manglende verdi — den er en pris som    */
/* aldri kan gi gevinst, og §C.3 krever at skjermen sier nettopp det (marked 0, */
/* EV −1) i stedet for å vise `—`. Ikke slå dem sammen med lib-variantene.      */
/* -------------------------------------------------------------------------- */

/** `1 / odds`. Odds `<= 1` er ikke en pris — markedet settes til 0 (§C.3). */
export function markedAvHåndskrevet(odds: number | null): number | null {
    if (!erTall(odds)) return null;
    return odds > 1 ? 1 / odds : 0;
}

/** `model_prob * odds − 1`. Odds `<= 1` gir −1, altså `−100,0 %` (§C.3). */
export function evAvHåndskrevet(modell: number, odds: number | null): number | null {
    if (!erTall(odds)) return null;
    return odds > 1 ? modell * odds - 1 : -1;
}

function ratingFor(elo: EloData | null, abbr: string): number | null {
    // Nøklene i `elo.json` er visningsforkortelser (UTA). Ingen aliasing her.
    const verdi = elo?.ratings[abbr];
    return erTall(verdi) ? verdi : null;
}

function sisteFem(matchups: MatchupsData | null, abbr: string): readonly GameInfo[] {
    return matchups?.teams[abbr]?.last_5 ?? [];
}

/**
 * Setter sammen hele høyrekolonnen. Alt regnes om ved hver endring — det er en
 * ren funksjon av valgene, så det er ingenting å synkronisere.
 */
export function byggAnalyse(
    matchups: MatchupsData | null,
    elo: EloData | null,
    valg: Valg,
    evTerskel: number,
    maxOdds?: number | null,
): Analyse {
    const hjemmeNavn = lagNavn(valg.home);
    const borteNavn = lagNavn(valg.away);

    // `slåOppParing` slår opp «HOME-AWAY» og bare den: et omvendt oppslag ville
    // gitt prisene fra oppsettet der det andre laget hadde hjemmefordelen.
    // Bommer det, faller vi tilbake på `FALLBACK_PRIS` og `harPris: false`.
    const paring = matchups ? slåOppParing(matchups, valg.home, valg.away) : null;
    const pris = paring
        ? { home: paring.prob_home_win, draw: paring.prob_ot, away: paring.prob_away_win }
        : FALLBACK_PRIS;

    const spesifikasjoner: readonly {
        nøkkel: UtfallNøkkel;
        etikett: string;
        modell: number;
        rå: string;
        erUavgjort: boolean;
    }[] = [
        {
            nøkkel: 'home',
            etikett: `${hjemmeNavn} vinner (hjemme)`,
            modell: pris.home,
            rå: valg.oh,
            erUavgjort: false,
        },
        {
            nøkkel: 'draw',
            etikett: 'Uavgjort etter ordinær tid (OT/SO)',
            modell: pris.draw,
            rå: valg.od,
            erUavgjort: true,
        },
        {
            nøkkel: 'away',
            etikett: `${borteNavn} vinner (borte)`,
            modell: pris.away,
            rå: valg.oa,
            erUavgjort: false,
        },
    ];

    const utfall: Utfall[] = spesifikasjoner.map((s) => {
        const modell = erTall(s.modell) ? s.modell : 0;
        const odds = tolkOdds(s.rå);
        const ev = evAvHåndskrevet(modell, odds);
        const grunn = utelattGrunn(s.erUavgjort, odds, maxOdds);
        const merke = tagg(ev, evTerskel, grunn);
        return {
            nøkkel: s.nøkkel,
            etikett: s.etikett,
            modell,
            marked: markedAvHåndskrevet(odds),
            odds,
            ev,
            tagg: merke,
            erUavgjort: s.erUavgjort,
            // Grunnen dempes og forklares i UI, så den følger taggen: et utfall
            // som uansett faller på EV er `NEI`, ikke et dempet «over oddstaket».
            utelattGrunn: merke === 'utelatt' ? grunn : null,
            spill: merke === 'spill',
        };
    });

    // Anbefalingen er modellens største sannsynlighet, ikke oddsavhengig.
    const ANBEFALING: Record<UtfallNøkkel, string> = {
        home: 'hjemmeseier',
        draw: 'OT/SO',
        away: 'borteseier',
    };
    const beste = utfall.reduce((a, b) => (b.modell > a.modell ? b : a));

    const hjemmefordel = erTall(elo?.config.home_advantage)
        ? elo.config.home_advantage
        : HJEMMEFORDEL_FALLBACK;
    const eloHjemme = ratingFor(elo, valg.home);
    const eloBorte = ratingFor(elo, valg.away);

    return {
        hjemmeNavn,
        borteNavn,
        tittel: `${borteNavn} hos ${hjemmeNavn}`,
        anbefaling: ANBEFALING[beste.nøkkel],
        harPris: paring !== null,
        utfall,
        elo: {
            hjemme: eloHjemme,
            borte: eloBorte,
            hjemmefordel,
            justertDiff:
                eloHjemme !== null && eloBorte !== null
                    ? eloHjemme + hjemmefordel - eloBorte
                    : null,
        },
        form: [
            { abbr: valg.away, navn: borteNavn, kamper: sisteFem(matchups, valg.away) },
            { abbr: valg.home, navn: hjemmeNavn, kamper: sisteFem(matchups, valg.home) },
        ],
    };
}
