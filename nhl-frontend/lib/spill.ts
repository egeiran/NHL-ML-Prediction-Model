/**
 * Delt spill-logikk: EV, marked, oddstak, tagging og de to presentasjonsavledede
 * verdiene (`evKlasse`, `stolpeBredde`) som Verdi og Kampanalyse begge trenger.
 *
 * Bakgrunn: sju skjermer ble bygget parallelt og landet på hver sin kopi av de
 * samme fem funksjonene. Kopiene var ordrett like da de ble skrevet, men to av
 * dem hadde allerede begynt å drive fra hverandre. Formlene står i
 * `docs/blalinja/DECISIONS.md` og skal finnes ett sted:
 *
 *     implied_prob = 1 / odds
 *     EV           = model_prob * odds - 1
 *     is_value     = EV >= evTerskel
 *
 * `components/kamp/beregn.ts` har bevisst avvikende varianter (`evAvHåndskrevet`,
 * `markedAvHåndskrevet`) fordi oddsen der er tre frie tekstfelt. De bor der,
 * med navn som sier hvorfor.
 */

import type { TagVariant } from '@/components/ui';
import { MANGLER } from '@/lib/format';
import { LAG, lagNavn } from '@/lib/teams';
import type { BetEntry } from '@/types';

/** Endelig tallsjekk. `null`, `undefined`, `NaN` og `±Infinity` faller ut. */
export function erTall(n: number | null | undefined): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

/* -------------------------------------------------------------------------- */
/* EV og marked                                                                */
/* -------------------------------------------------------------------------- */

/** `EV = model_prob * odds - 1`. `null` når ett av leddene mangler. */
export function evAv(modell: number | null | undefined, odds: number | null | undefined): number | null {
    if (!erTall(modell) || !erTall(odds)) return null;
    return modell * odds - 1;
}

/**
 * EV for ett utfall i `value-report.json` / `portfolio.json`.
 *
 * Bruker `value_*` når feltet finnes. Pipelinen regner det fra den **urundede**
 * modellsannsynligheten (`NHL/report_service.py` → `expected_value()`), mens
 * `model_*` skrives avrundet til tre desimaler i samme objekt. Regner vi selv
 * fra `model_*`, avviker EV med opptil ~0,2 prosentpoeng fra det pipelinen
 * brukte da den valgte spill — nok til å vippe SPILL/NEI på terskelen og nok
 * til at EV-kolonnen på siten ikke stemmer med `bet_history.csv`.
 *
 * `value_*` er samme definisjon som formelen (PROBLEMS.md: «Value fields in bet
 * history now match the selection logic (EV)»), så dette er presisjon, ikke en
 * annen størrelse. Mangler feltet — historiske rader har det ikke — regnes EV
 * fra `model_*` som før.
 */
export function evForUtfall(
    verdi: number | null | undefined,
    modell: number | null | undefined,
    odds: number | null | undefined,
): number | null {
    if (!erTall(odds)) return null;
    if (erTall(verdi)) return verdi;
    return evAv(modell, odds);
}

/** Markedets implisitte sannsynlighet: feltet fra pipelinen, ellers `1 / odds`. */
export function markedAv(
    implisitt: number | null | undefined,
    odds: number | null | undefined,
): number | null {
    if (erTall(implisitt)) return implisitt;
    if (erTall(odds) && odds > 0) return 1 / odds;
    return null;
}

/* -------------------------------------------------------------------------- */
/* Oddstak og tagging                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Pipelinen legger bare inn spill med `odds < max_odds` (`meta.json`, i dag
 * 4,0 — se `_choose_best_per_day()` i `NHL/bet_tracker.py`, som forkaster
 * `odds >= max_odds`). Sjekken lukker ett konkret avvik: uten den kunne UI vise
 * et utfall med odds 4,5 og EV 0,30 som «SPILL» der `bet_history.csv` garantert
 * ikke får raden.
 *
 * Den gir **ikke** paritet med loggen. `_choose_best_per_day()` beholder høyst
 * **ett** spill per dag, bare `best_value`-utfallet, og bare når alle tre
 * oddsene finnes. Siten viser alle utfall som passerer EV og oddstak, per kamp —
 * altså jevnt over flere SPILL enn loggen får. Oddstaket fjerner en av flere
 * grunner til at de to listene spriker, ikke spriket.
 *
 * Mangler `max_odds` (meta ikke lastet), gjelder ingen grense.
 */
export function overOddstak(
    odds: number | null | undefined,
    maxOdds: number | null | undefined,
): boolean {
    if (!erTall(odds) || !erTall(maxOdds) || maxOdds <= 0) return false;
    return odds >= maxOdds;
}

/**
 * EV-terskelen som gjelder for ett utfall.
 *
 * OT/SO har en høyere terskel enn hjemme og borte (`meta.draw_value_min`, i dag
 * 0,30 mot 0,15). Grunnen er at Norsk Tipping holder OT/SO-oddsen praktisk talt
 * fast rundt 3,90, mens hjemme- og borteoddsen beveger seg med markedet: samme
 * EV-terskel måler et markedssignal i det ene tilfellet og bare modellens egen
 * dristighet i det andre. Se `DEFAULT_DRAW_MIN_VALUE` i `NHL/bet_tracker.py`.
 *
 * Brukerens slider kan skjerpe, aldri slakke: terskelen er den høyeste av de to.
 * Mangler `draw_value_min` (gammel `meta.json`), gjelder den vanlige terskelen.
 */
export function evTerskelFor(
    erUavgjort: boolean,
    evTerskel: number,
    drawEvTerskel: number | null | undefined,
): number {
    if (!erUavgjort || !erTall(drawEvTerskel)) return evTerskel;
    return Math.max(evTerskel, drawEvTerskel);
}

/**
 * Hvorfor pipelinen ikke ville tatt utfallet — to ulike grunner:
 *
 *   - `uavgjort` — OT/SO, og `meta.allow_draw_bets` er `false`. Er de på,
 *     vurderes utfallet på EV som alle andre, bare mot en høyere terskel
 *     (se `evTerskelFor`).
 *   - `oddstak` — odds ≥ `meta.max_odds`. Pipelinen ville forkastet spillet.
 *
 * `null` betyr at utfallet vurderes på EV som vanlig.
 *
 * Dette er den *faktiske* grunnen, ikke nødvendigvis den som vises: `tagg()`
 * lar `oddstak` bli `NEI` når EV uansett er under terskelen. Kaller du begge,
 * la den viste grunnen følge taggen, ellers demper UI en rad det står `NEI` på.
 */
export type UtelattGrunn = 'uavgjort' | 'oddstak';

export function utelattGrunn(
    erUavgjort: boolean,
    odds: number | null | undefined,
    maxOdds: number | null | undefined,
    /** `meta.allow_draw_bets`. Utelatt = OT/SO spilles (pipelinens default). */
    allowDrawBets?: boolean | null,
): UtelattGrunn | null {
    if (erUavgjort && allowDrawBets === false) return 'uavgjort';
    if (overOddstak(odds, maxOdds)) return 'oddstak';
    return null;
}

/** Kort forklaring til `UTELATT`-taggen. `null` når utfallet ikke er utelatt. */
export function utelattTekst(grunn: UtelattGrunn | null): string | null {
    switch (grunn) {
        case 'uavgjort':
            return 'OT/SO spilles ikke';
        case 'oddstak':
            return 'Over pipelinens oddstak';
        default:
            return null;
    }
}

/**
 * Taggen for ett utfall. Rekkefølgen er ikke vilkårlig — den avgjør hvilken av
 * to sanne ting taggen forteller:
 *
 *   1. **`UTELATT · uavgjort` gjelder bare når OT/SO er skrudd av.** Da spiller
 *      vi ikke utfallet i det hele tatt, og EV-en er ikke en vurdering vi har
 *      tatt stilling til. Er de på, faller de gjennom til punkt 2 og 3 mot sin
 *      egen, høyere terskel — send den inn via `evTerskelFor()`.
 *   2. **EV under terskel gir `NEI`**, også over oddstaket. Det er den primære
 *      grunnen: vi ville ikke tatt spillet uansett hva pipelinen tillot. For
 *      store outsidere er odds ≥ 4,0 vanlig, og `UTELATT · oddstak` på et utfall
 *      med EV −0,30 slår sammen «vi *kan* ikke» og «vi *ville* ikke» til noe
 *      mindre informativt enn begge deler.
 *   3. **`UTELATT` på oddstaket bare når utfallet ellers ville kvalifisert** —
 *      EV ≥ terskel, men odds over taket. Da er taket faktisk det som stopper
 *      spillet, og taggen sier noe leseren ikke kunne sett av EV-en alene.
 *
 * Et utelatt utfall blir aldri `SPILL`.
 */
export function tagg(
    ev: number | null,
    evTerskel: number,
    grunn: UtelattGrunn | null,
): TagVariant {
    if (grunn === 'uavgjort') return 'utelatt';
    if (ev === null || ev < evTerskel) return 'nei';
    return grunn === 'oddstak' ? 'utelatt' : 'spill';
}

/* -------------------------------------------------------------------------- */
/* Presentasjonsavledet                                                        */
/* -------------------------------------------------------------------------- */

/** EV-farge: over terskel → teal, positiv → ink, ellers muted. */
export function evKlasse(ev: number | null, evTerskel: number): string {
    if (ev === null) return 'c-muted';
    if (ev >= evTerskel) return 'c-teal';
    return ev > 0 ? 'c-ink' : 'c-muted';
}

/**
 * Bredden på et sannsynlighetslag i stolpen, klemt inn i [0, 1].
 *
 * Merk: `components/skygge/beregn.ts` har en annen `stolpeBredde` med annen
 * semantikk (felles nevner mellom to paneler). De skal ikke slås sammen.
 */
export function stolpeBredde(p: number | null | undefined): string {
    if (!erTall(p)) return '0%';
    return `${Math.min(Math.max(p, 0), 1) * 100}%`;
}

/* -------------------------------------------------------------------------- */
/* Lagnavn og kamptekst                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fullt lagnavn for en forkortelse som kan være ukjent. Kjent forkortelse gir
 * navnet fra `LAG`; ellers står strengen fra fila, og som siste utvei
 * forkortelsen selv.
 */
export function navnFor(abbr: string | null | undefined, fallback: string): string {
    const kode = (abbr ?? '').trim();
    if (kode !== '' && Object.hasOwn(LAG, kode)) return lagNavn(kode);
    const rent = fallback.trim();
    return rent !== '' ? rent : kode;
}

/**
 * «Carolina Hurricanes hos Vegas Golden Knights». Borte først, som i designet.
 *
 * Fallbacken er bevisst delvis: mangler ett av lagene, står det vi vet. En rå
 * `event_id` er en maskinstreng og hører ikke hjemme i UI — den varianten fantes
 * i `oversikt/SisteAvgjorte.tsx` og er erstattet av denne.
 */
export function kampTekst(b: BetEntry): string {
    const hjemme = b.home_abbr ? lagNavn(b.home_abbr) : '';
    const borte = b.away_abbr ? lagNavn(b.away_abbr) : '';
    if (hjemme && borte) return `${borte} hos ${hjemme}`;
    if (hjemme) return `hos ${hjemme}`;
    if (borte) return borte;
    return MANGLER;
}

/* -------------------------------------------------------------------------- */
/* Kronologi                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Millisekunder for radens kamptidspunkt. Datoen alene er nok når `start_time`
 * mangler.
 */
export function tid(b: BetEntry): number {
    if (b.start_time) {
        const t = Date.parse(b.start_time);
        if (!Number.isNaN(t)) return t;
    }
    const d = Date.parse(`${b.date}T00:00:00Z`);
    return Number.isNaN(d) ? 0 : d;
}

/**
 * Nyeste først, med `event_id` som siste, deterministiske skille.
 *
 * Historikk og «Siste avgjorte» på Oversikt viser de samme radene i den samme
 * rekkefølgen. Da må rekkefølgen defineres ett sted — to kopier som driver fra
 * hverandre ville gitt to ulike «nyeste ni».
 */
export function nyesteFørst(a: BetEntry, b: BetEntry): number {
    return tid(b) - tid(a) || (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0);
}
