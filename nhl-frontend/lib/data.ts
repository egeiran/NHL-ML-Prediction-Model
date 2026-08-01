/**
 * Datalasting. Statisk eksport (`output: 'export'`) betyr at det ikke finnes
 * noe API, ingen route handlers og ingen server actions — alt leses klientside
 * fra `public/data/*.json`.
 *
 * Hver fil hentes maksimalt én gang per sidelast: promiset memoiseres, slik at
 * sju skjermer som alle spør etter `portfolio.json` deler ett nettverkskall.
 * Et avvist promise fjernes fra cachen, så «Prøv igjen» faktisk prøver igjen.
 */

import type {
    EloData,
    MatchupsData,
    PortfolioResponse,
    PredictionResponse,
    ShadowEntry,
    SiteMeta,
    Team,
    ValueGame,
} from '@/types';

/** Settes når siten mountes under et underkatalog-prefiks. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Filnavnene, slik de skal vises i feiltilstanden («{filnavn} svarte ikke»). */
export const DATA_FILER = {
    teams: 'teams.json',
    meta: 'meta.json',
    valueReport: 'value-report.json',
    portfolio: 'portfolio.json',
    matchups: 'matchups.json',
    elo: 'elo.json',
    shadow: 'shadow.json',
} as const;

export type DataNøkkel = keyof typeof DATA_FILER;

const dataUrl = (fil: string) => `${BASE_PATH}/data/${fil}`;

/** Feil fra datalasting. Bærer filnavnet så feilpanelet kan navngi kilden. */
export class DataFeil extends Error {
    readonly fil: string;

    constructor(fil: string, melding: string) {
        super(melding);
        this.name = 'DataFeil';
        this.fil = fil;
    }
}

async function hentJson<T>(fil: string, melding: string): Promise<T> {
    let res: Response;
    try {
        res = await fetch(dataUrl(fil));
    } catch {
        throw new DataFeil(fil, melding);
    }
    if (!res.ok) throw new DataFeil(fil, melding);
    try {
        return (await res.json()) as T;
    } catch {
        throw new DataFeil(fil, `${fil} inneholdt ugyldig JSON`);
    }
}

/* -------------------------------------------------------------------------- */
/* Memoisering                                                                 */
/* -------------------------------------------------------------------------- */

const cache = new Map<DataNøkkel, Promise<unknown>>();

function memoisert<T>(nøkkel: DataNøkkel, melding: string): Promise<T> {
    const eksisterende = cache.get(nøkkel) as Promise<T> | undefined;
    if (eksisterende) return eksisterende;

    const p = hentJson<T>(DATA_FILER[nøkkel], melding).catch((err: unknown) => {
        // La neste forsøk gå på nettet igjen i stedet for å gjenbruke feilen.
        cache.delete(nøkkel);
        throw err;
    });
    cache.set(nøkkel, p);
    return p;
}

/** Tømmer cachen for ett datasett (eller alle). Brukes av «Prøv igjen». */
export function invalider(nøkkel?: DataNøkkel): void {
    if (nøkkel) cache.delete(nøkkel);
    else cache.clear();
}

/* -------------------------------------------------------------------------- */
/* Lastere                                                                     */
/* -------------------------------------------------------------------------- */

export function fetchTeams(): Promise<Team[]> {
    return memoisert<Team[]>('teams', 'Kunne ikke hente lag');
}

export function fetchMeta(): Promise<SiteMeta> {
    return memoisert<SiteMeta>('meta', 'Kunne ikke hente metadata');
}

/** Value-rapporten. Tom array i sesongpausen — det er hovedtilstanden. */
export function fetchValueReport(): Promise<ValueGame[]> {
    return memoisert<ValueGame[]>('valueReport', 'Kunne ikke hente value-rapporten');
}

export function fetchPortfolio(): Promise<PortfolioResponse> {
    return memoisert<PortfolioResponse>('portfolio', 'Kunne ikke hente porteføljen');
}

export function fetchMatchups(): Promise<MatchupsData> {
    return memoisert<MatchupsData>('matchups', 'Kunne ikke hente forhåndsberegnede prediksjoner');
}

export function fetchElo(): Promise<EloData> {
    return memoisert<EloData>('elo', 'Kunne ikke hente Elo-ratinger');
}

/** Skyggeloggen. `[]` i dag; Skyggelogg-skjermen faller da tilbake på portfolio. */
export function fetchShadow(): Promise<ShadowEntry[]> {
    return memoisert<ShadowEntry[]>('shadow', 'Kunne ikke hente skyggeloggen');
}

/* -------------------------------------------------------------------------- */
/* Avledet                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Slår opp en paring i `matchups.json` på `"HOME-AWAY"`.
 *
 * **Ingen `"AWAY-HOME"`-fallback.** Nøklene i `matchups.json` er ordnede par:
 * fila har alle 32×31 = 992 kombinasjoner, så oppslaget bommer bare hvis fila
 * er ufullstendig. Et omvendt oppslag ville gitt `prob_home_win` fra oppsettet
 * der det *andre* laget hadde hjemmefordelen, og merket den med `homeTeam` —
 * altså speilvendte priser uten varsel. Returnerer heller `null`, og kalleren
 * bestemmer fallback (Kampanalyse bruker `{h:.33, o:.25, a:.42}` og en note om
 * at det ikke finnes en lagret modellpris).
 */
export function slåOppParing(
    data: MatchupsData,
    homeTeam: string,
    awayTeam: string,
): PredictionResponse | null {
    const matchup = data.matchups[`${homeTeam}-${awayTeam}`];
    const home = data.teams[homeTeam];
    const away = data.teams[awayTeam];
    if (!matchup || !home || !away) return null;

    return {
        home_team: homeTeam,
        away_team: awayTeam,
        home_last_5: home.last_5,
        away_last_5: away.last_5,
        home_stats: home.stats,
        away_stats: away.stats,
        ...matchup,
    };
}
