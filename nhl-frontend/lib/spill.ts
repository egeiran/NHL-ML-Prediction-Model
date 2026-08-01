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
 * `odds >= max_odds`). Uten denne sjekken kunne UI vise et utfall med odds 4,5
 * og EV 0,30 som «SPILL» selv om `bet_history.csv` aldri får raden — nøyaktig
 * avviket DECISIONS punkt 6 sier UI skal si fra om.
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
 * Hvorfor et utfall er `UTELATT` — to ulike grunner som ser like ut i taggen:
 *
 *   - `uavgjort` — OT/SO. `meta.allow_draw_bets` er `false`.
 *   - `oddstak` — odds ≥ `meta.max_odds`. Pipelinen ville forkastet spillet.
 *
 * `null` betyr at utfallet vurderes på EV som vanlig.
 */
export type UtelattGrunn = 'uavgjort' | 'oddstak';

export function utelattGrunn(
    erUavgjort: boolean,
    odds: number | null | undefined,
    maxOdds: number | null | undefined,
): UtelattGrunn | null {
    if (erUavgjort) return 'uavgjort';
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
 * `SPILL` når EV er over terskelen, `UTELATT` når utfallet er utelatt av en
 * annen grunn enn EV, ellers `NEI`. Rekkefølgen er viktig: et utelatt utfall
 * skal aldri bli `SPILL`, uansett hvor god EV-en ser ut.
 */
export function tagg(
    ev: number | null,
    evTerskel: number,
    grunn: UtelattGrunn | null,
): TagVariant {
    if (grunn !== null) return 'utelatt';
    return ev !== null && ev >= evTerskel ? 'spill' : 'nei';
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
