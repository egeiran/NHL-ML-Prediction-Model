/**
 * Regnestykkene bak Oversikt. Rene funksjoner, ingen React — så de kan leses,
 * og eventuelt testes, uten å rendre en skjerm.
 *
 * Formlene står ordrett i `docs/blalinja/DECISIONS.md`:
 *
 *   EV           = model_prob * odds - 1
 *   daily_pnl[i] = value[i] - value[i-1]        // value[-1] behandles som 0
 *   window_net   = value[siste] - value[indeks før vindusstart]
 *
 * `PortfolioPoint.value` er KUMULATIV nettogevinst, ikke saldo. Alt under bygger
 * på det; forveksles de to blir både vindusnettoen og søylene feil.
 */

import { erTall, evForUtfall, evTerskelFor, navnFor, overOddstak } from '@/lib/spill';
import type { PortfolioPoint, ValueGame } from '@/types';

/* -------------------------------------------------------------------------- */
/* Kontrollverdier                                                             */
/*                                                                             */
/* Hero-vinduet og kurvelabbens rekkevidde er bevisst TO kontroller med hver    */
/* sin state og hvert sitt verdisett (§C.1). De skal ikke slås sammen.          */
/* -------------------------------------------------------------------------- */

export type HeroVindu = '60' | '90' | 'alt';
export type LabRekkevidde = 'alt' | '60' | '20';
export type LabModus = 'netto' | 'dag';

/* -------------------------------------------------------------------------- */
/* Hero-vinduet                                                                */
/* -------------------------------------------------------------------------- */

export interface Vindusutsnitt {
    /** Punktene i vinduet, i serierekkefølge. */
    punkter: readonly PortfolioPoint[];
    /**
     * Kumulativ nettogevinst ved punktet FØR vinduet — nullpunktet vinduet måles
     * fra. `0` når vinduet starter på serien, siden `value[-1]` er 0.
     */
    førVindu: number;
}

/** Trekker `dager` fra en `YYYY-MM-DD` og gir samme format tilbake. */
function trekkDager(dato: string, dager: number): string {
    const t = Date.parse(`${dato}T00:00:00Z`);
    if (Number.isNaN(t)) return dato;
    return new Date(t - dager * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Utsnittet hero-kurven tegner.
 *
 * Vinduet regnes fra seriens siste dato, ikke fra dagens dato: i en sesongpause
 * ville «siste 60 dager» ellers vært tomt. Blir utsnittet kortere enn tre
 * punkter faller vi tilbake på de ti siste — en kurve med to punkter er en strek,
 * ikke en form.
 */
export function heroUtsnitt(ts: readonly PortfolioPoint[], vindu: HeroVindu): Vindusutsnitt {
    if (ts.length === 0) return { punkter: [], førVindu: 0 };
    let start = 0;
    if (vindu !== 'alt') {
        const grense = trekkDager(ts[ts.length - 1].date, Number(vindu));
        const funnet = ts.findIndex((p) => p.date >= grense);
        start = funnet < 0 || ts.length - funnet < 3 ? Math.max(0, ts.length - 10) : funnet;
    }
    return { punkter: ts.slice(start), førVindu: start > 0 ? ts[start - 1].value : 0 };
}

export interface Herotall {
    /** `value[siste] − value[før vindusstart]`. Skjules i UI når den er negativ. */
    vindusnetto: number;
    /** Spill lagt inn i perioden. */
    spill: number;
    /** Treff / spill i perioden, som brøk. */
    treffrate: number;
    besteDag: number;
    svakesteDag: number;
}

/** Nøkkeltallene i statraden. `null` når vinduet er tomt. */
export function herotall(u: Vindusutsnitt): Herotall | null {
    const { punkter, førVindu } = u;
    if (punkter.length === 0) return null;

    const deltaer = dagligPnl(punkter, førVindu);
    let spill = 0;
    let treff = 0;
    for (const p of punkter) {
        spill += p.bets_placed;
        treff += p.bets_won;
    }

    return {
        vindusnetto: punkter[punkter.length - 1].value - førVindu,
        spill,
        treffrate: spill > 0 ? treff / spill : 0,
        besteDag: Math.max(...deltaer),
        svakesteDag: Math.min(...deltaer),
    };
}

/** Etiketten over vindusnettoen. */
export function vindusetikett(vindu: HeroVindu): string {
    return vindu === 'alt' ? 'Hele historikken' : `Siste ${vindu} dager`;
}

/* -------------------------------------------------------------------------- */
/* Serier                                                                      */
/* -------------------------------------------------------------------------- */

/** `value[i] − value[i−1]`, med `førVindu` som verdien før første punkt. */
export function dagligPnl(punkter: readonly PortfolioPoint[], førVindu = 0): number[] {
    return punkter.map((p, i) => p.value - (i > 0 ? punkter[i - 1].value : førVindu));
}

/** Kurvelabbens rekkevidde: de siste 20/60 punktene, eller hele serien. */
export function labUtsnitt(
    ts: readonly PortfolioPoint[],
    rekkevidde: LabRekkevidde,
): readonly PortfolioPoint[] {
    if (rekkevidde === 'alt') return ts;
    return ts.slice(-Number(rekkevidde));
}

/**
 * Verdiene kurvelabben tegner.
 *
 * I «Daglig P&L» må differansen for det første punktet i utsnittet regnes mot
 * punktet før det i HELE serien, ikke mot 0 — ellers får den første søyla hele
 * den kumulative gevinsten i seg.
 */
export function labVerdier(
    hele: readonly PortfolioPoint[],
    utsnitt: readonly PortfolioPoint[],
    modus: LabModus,
): number[] {
    if (modus === 'netto') return utsnitt.map((p) => p.value);
    const start = hele.length - utsnitt.length;
    return dagligPnl(utsnitt, start > 0 ? hele[start - 1].value : 0);
}

/** Kurvelabbens tittel følger modusen. */
export function labTittel(modus: LabModus): string {
    return modus === 'netto' ? 'Netto resultat over tid' : 'Resultat per kampdag';
}

/* -------------------------------------------------------------------------- */
/* Dagens spill                                                                */
/* -------------------------------------------------------------------------- */

export interface Spill {
    /** Stabil React-nøkkel: kamp + side. */
    nøkkel: string;
    /** Lagforkortelse for logoen. Faller tilbake på navnet når abbr mangler. */
    abbr: string;
    navn: string;
    motstander: string;
    /** `uavgjort` = OT/SO. Da er `abbr`/`navn` hjemmelaget, som logoen viser. */
    side: 'hjemme' | 'borte' | 'uavgjort';
    /** Fullt tidsstempel for avspark, eller `null`. */
    start: string | null;
    modellProb: number;
    odds: number;
    /** `value_*` når pipelinen har skrevet det, ellers `model_prob * odds − 1`. */
    ev: number;
}

/**
 * Spillene over EV-terskelen, sortert på EV synkende.
 *
 * Alle tre utfall vurderes. OT/SO måles mot `drawEvTerskel`
 * (`meta.draw_value_min`, høyere enn den vanlige — se `evTerskelFor` i
 * `lib/spill.ts`) og faller helt ut når `allowDrawBets` er `false`.
 *
 * `evTerskel` SKAL komme fra `useEvTerskel()`. Leses den fra noe annet sted,
 * driver skjermene fra hverandre (DECISIONS punkt 6).
 *
 * `maxOdds` er `meta.json:max_odds`. Pipelinen krever `odds < max_odds`
 * (`NHL/bet_tracker.py`), så uten den kunne «Dagens spill» vise et utfall med
 * odds 4,5 og EV 0,30 som `bet_history.csv` garantert ikke får. Utelates
 * argumentet, gjelder ingen grense — send den alltid inn når `meta` er lastet.
 *
 * Taket er ikke det samme som paritet med loggen. `record_new_bets()` tar høyst
 * ETT utfall per kamp – det beste av dem som klarer sin egen terskel – og bare
 * når alle tre oddsene finnes; «Dagens spill» lister alle kvalifiserende utfall
 * på tvers av dagens kamper. Lista er altså normalt lengre enn loggen blir.
 */
export function finnSpill(
    kamper: readonly ValueGame[],
    evTerskel: number,
    maxOdds?: number | null,
    drawEvTerskel?: number | null,
    allowDrawBets?: boolean | null,
): Spill[] {
    const ut: Spill[] = [];

    for (const k of kamper) {
        const hjemmeAbbr = k.home_abbr ?? null;
        const borteAbbr = k.away_abbr ?? null;
        const kandidater = [
            {
                side: 'hjemme' as const,
                abbr: hjemmeAbbr,
                rå: k.home,
                motstander: navnFor(borteAbbr, k.away),
                prob: k.model_home_win,
                odds: k.odds_home,
                verdi: k.value_home,
            },
            {
                side: 'borte' as const,
                abbr: borteAbbr,
                rå: k.away,
                motstander: navnFor(hjemmeAbbr, k.home),
                prob: k.model_away_win,
                odds: k.odds_away,
                verdi: k.value_away,
            },
            {
                // Logoen viser hjemmelaget; `side` forteller at raden er OT/SO.
                side: 'uavgjort' as const,
                abbr: hjemmeAbbr,
                rå: k.home,
                motstander: navnFor(borteAbbr, k.away),
                prob: k.model_draw,
                odds: k.odds_draw,
                verdi: k.value_draw,
            },
        ];

        for (const c of kandidater) {
            const erUavgjort = c.side === 'uavgjort';
            if (erUavgjort && allowDrawBets === false) continue;
            if (!erTall(c.prob) || !erTall(c.odds) || c.odds <= 0) continue;
            if (overOddstak(c.odds, maxOdds)) continue;
            const ev = evForUtfall(c.verdi, c.prob, c.odds);
            if (ev === null || ev < evTerskelFor(erUavgjort, evTerskel, drawEvTerskel)) continue;
            ut.push({
                nøkkel: `${k.event_id}-${c.side}`,
                abbr: c.abbr ?? c.rå,
                navn: navnFor(c.abbr, c.rå),
                motstander: c.motstander,
                side: c.side,
                start: k.start_time ?? null,
                modellProb: c.prob,
                odds: c.odds,
                ev,
            });
        }
    }

    ut.sort((a, b) => b.ev - a.ev);
    return ut;
}
