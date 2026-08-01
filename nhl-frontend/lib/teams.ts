/**
 * Lagnavn, konferanse, logo og norsk sortering.
 *
 * Navnene og konferanseinndelingen er hentet fra
 * `docs/design_handoff_blalinja_frontend/nhl-data.js` (`names` og `west`), som
 * er samme kilde designet ble bygget mot. `id` er NHL-APIets numeriske lag-id og
 * stemmer med `public/data/teams.json`.
 *
 * Ingen aliaslogikk her: `elo.json` skrives med visningsforkortelser (`UTA`,
 * ingen `ARI`) i eksport-steget. DECISIONS punkt 5.
 */

export type Konferanse = 'Øst' | 'Vest';

export interface LagInfo {
    /** Trebokstavsforkortelse, f.eks. `BOS`. */
    abbr: string;
    /** Fullt lagnavn, sorterbart: `Boston Bruins`. */
    navn: string;
    konferanse: Konferanse;
    /** NHL-APIets numeriske lag-id, som streng. */
    id: string;
}

const LAG_LISTE: readonly LagInfo[] = [
    { abbr: 'ANA', navn: 'Anaheim Ducks', konferanse: 'Vest', id: '24' },
    { abbr: 'BOS', navn: 'Boston Bruins', konferanse: 'Øst', id: '6' },
    { abbr: 'BUF', navn: 'Buffalo Sabres', konferanse: 'Øst', id: '7' },
    { abbr: 'CAR', navn: 'Carolina Hurricanes', konferanse: 'Øst', id: '12' },
    { abbr: 'CBJ', navn: 'Columbus Blue Jackets', konferanse: 'Øst', id: '29' },
    { abbr: 'CGY', navn: 'Calgary Flames', konferanse: 'Vest', id: '20' },
    { abbr: 'CHI', navn: 'Chicago Blackhawks', konferanse: 'Vest', id: '16' },
    { abbr: 'COL', navn: 'Colorado Avalanche', konferanse: 'Vest', id: '21' },
    { abbr: 'DAL', navn: 'Dallas Stars', konferanse: 'Vest', id: '25' },
    { abbr: 'DET', navn: 'Detroit Red Wings', konferanse: 'Øst', id: '17' },
    { abbr: 'EDM', navn: 'Edmonton Oilers', konferanse: 'Vest', id: '22' },
    { abbr: 'FLA', navn: 'Florida Panthers', konferanse: 'Øst', id: '13' },
    { abbr: 'LAK', navn: 'Los Angeles Kings', konferanse: 'Vest', id: '26' },
    { abbr: 'MIN', navn: 'Minnesota Wild', konferanse: 'Vest', id: '30' },
    { abbr: 'MTL', navn: 'Montreal Canadiens', konferanse: 'Øst', id: '8' },
    { abbr: 'NJD', navn: 'New Jersey Devils', konferanse: 'Øst', id: '1' },
    { abbr: 'NSH', navn: 'Nashville Predators', konferanse: 'Vest', id: '18' },
    { abbr: 'NYI', navn: 'New York Islanders', konferanse: 'Øst', id: '2' },
    { abbr: 'NYR', navn: 'New York Rangers', konferanse: 'Øst', id: '3' },
    { abbr: 'OTT', navn: 'Ottawa Senators', konferanse: 'Øst', id: '9' },
    { abbr: 'PHI', navn: 'Philadelphia Flyers', konferanse: 'Øst', id: '4' },
    { abbr: 'PIT', navn: 'Pittsburgh Penguins', konferanse: 'Øst', id: '5' },
    { abbr: 'SEA', navn: 'Seattle Kraken', konferanse: 'Vest', id: '55' },
    { abbr: 'SJS', navn: 'San Jose Sharks', konferanse: 'Vest', id: '28' },
    { abbr: 'STL', navn: 'St. Louis Blues', konferanse: 'Vest', id: '19' },
    { abbr: 'TBL', navn: 'Tampa Bay Lightning', konferanse: 'Øst', id: '14' },
    { abbr: 'TOR', navn: 'Toronto Maple Leafs', konferanse: 'Øst', id: '10' },
    { abbr: 'UTA', navn: 'Utah Mammoth', konferanse: 'Vest', id: '53' },
    { abbr: 'VAN', navn: 'Vancouver Canucks', konferanse: 'Vest', id: '23' },
    { abbr: 'VGK', navn: 'Vegas Golden Knights', konferanse: 'Vest', id: '54' },
    { abbr: 'WPG', navn: 'Winnipeg Jets', konferanse: 'Vest', id: '52' },
    { abbr: 'WSH', navn: 'Washington Capitals', konferanse: 'Øst', id: '15' },
];

/**
 * Oppslag på forkortelse. 32 lag.
 *
 * Prototypeløst: forkortelser slås opp fra data vi ikke kontrollerer navnet på,
 * og med `Object.prototype` i kjeden ville `LAG['constructor']` vært sannhets-
 * verdi-sann og gjort et tilfeldig navn til et gyldig lag.
 */
export const LAG: Readonly<Record<string, LagInfo>> = Object.assign(
    Object.create(null) as Record<string, LagInfo>,
    Object.fromEntries(LAG_LISTE.map((l) => [l.abbr, l])),
);

/** Norsk kollasjon: æ ø å sorteres sist, ikke som a/o. */
export const kollator = new Intl.Collator('nb', { sensitivity: 'base' });

/** Alle 32 lag, sortert på fullt navn med `Intl.Collator('nb')`. */
export const ALLE_LAG: readonly LagInfo[] = LAG_LISTE.slice().sort((a, b) =>
    kollator.compare(a.navn, b.navn),
);

/** `lagNavn('BOS')` → `Boston Bruins`. Ukjent forkortelse gir forkortelsen. */
export function lagNavn(abbr: string | null | undefined): string {
    if (!abbr) return '';
    return LAG[abbr]?.navn ?? abbr;
}

/** `lagEtikett('BOS')` → `Boston Bruins (BOS)`. Til select-alternativer. */
export function lagEtikett(abbr: string): string {
    return `${lagNavn(abbr)} (${abbr})`;
}

/** `konferanse('BOS')` → `Øst`. `null` for ukjent forkortelse. */
export function konferanse(abbr: string | null | undefined): Konferanse | null {
    if (!abbr) return null;
    return LAG[abbr]?.konferanse ?? null;
}

/** NHL-APIets numeriske lag-id. `null` for ukjent forkortelse. */
export function lagId(abbr: string | null | undefined): string | null {
    if (!abbr) return null;
    return LAG[abbr]?.id ?? null;
}

/**
 * Logo fra NHL-APIet.
 *
 * URL-mønsteret kunne ikke verifiseres med curl fra byggemiljøet — utgående
 * trafikk til `assets.nhle.com` blokkeres av proxyen (403 på CONNECT, altså en
 * policy-avvisning, ikke et svar fra verten). Mønsteret er derfor tatt fra
 * handoffen. Alle logoer rendres via `<TeamLogo>`, som faller tilbake på den
 * stiplede plassholderen ved lastefeil — den er allerede designet som
 * laste- og feiltilstand, så en feil URL degraderer pent.
 */
export const LOGO_BASE = 'https://assets.nhle.com/logos/nhl/svg';

export function logoUrl(abbr: string): string {
    return `${LOGO_BASE}/${encodeURIComponent(abbr)}_light.svg`;
}

/** Sorterer forkortelser på fullt norsk-kollasjonert lagnavn. */
export function sorterAbbr(abbrs: readonly string[]): string[] {
    return abbrs.slice().sort((a, b) => kollator.compare(lagNavn(a), lagNavn(b)));
}

/** Sorterer vilkårlige rader på lagnavnet bak en forkortelse. */
export function sorterPåLag<T>(rader: readonly T[], abbrAv: (rad: T) => string): T[] {
    return rader.slice().sort((a, b) => kollator.compare(lagNavn(abbrAv(a)), lagNavn(abbrAv(b))));
}
