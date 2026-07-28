import {
    MatchupsData,
    PortfolioResponse,
    PredictionResponse,
    SiteMeta,
    Team,
    ValueGame,
} from '@/types';

const API_BASE_RAW =
    process.env.NEXT_PUBLIC_API_BASE ??
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');

/** Tom API-base = statisk modus: all data leses fra ferdiggenerert JSON. */
export const API_BASE = API_BASE_RAW.endsWith('/') ? API_BASE_RAW.slice(0, -1) : API_BASE_RAW;
export const STATIC_MODE = API_BASE === '';

/**
 * Porteføljen kan bare oppdateres når API-et kjører lokalt eller serverer
 * frontend selv – et statisk bygg har ingen backend å skrive til.
 */
export const CAN_UPDATE_PORTFOLIO =
    !STATIC_MODE &&
    (API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1') || API_BASE.startsWith('/'));

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const apiUrl = (path: string) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
const dataUrl = (file: string) => `${BASE_PATH}/data/${file}`;

async function readError(res: Response): Promise<string> {
    // Body-en kan bare leses én gang, så vi henter teksten og parser den selv.
    let text = '';
    try {
        text = (await res.text()).trim();
    } catch {
        return '';
    }

    try {
        const body = JSON.parse(text);
        // FastAPI kan svare med detail som liste (422) – bare strenger vises.
        if (typeof body?.detail === 'string') return body.detail;
        if (typeof body?.message === 'string') return body.message;
        return '';
    } catch {
        // Hopp over HTML-feilsider (f.eks. 404 fra en statisk host)
        return text.startsWith('<') || text.length > 200 ? '' : text;
    }
}

async function getJson<T>(url: string, fallbackMessage: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        const reason = await readError(res);
        throw new Error(reason || fallbackMessage);
    }
    return (await res.json()) as T;
}

export async function fetchTeams(): Promise<Team[]> {
    if (STATIC_MODE) {
        return getJson<Team[]>(dataUrl('teams.json'), 'Kunne ikke hente lag');
    }
    return getJson<Team[]>(apiUrl('/teams'), 'Kunne ikke hente lag');
}

/**
 * Value-boardet. I statisk modus er horisonten allerede bakt inn i den
 * genererte fila, så `days` brukes kun mot et levende API.
 */
export async function fetchValueReport(days: number): Promise<ValueGame[]> {
    if (STATIC_MODE) {
        return getJson<ValueGame[]>(dataUrl('value-report.json'), 'Kunne ikke hente oddsrapport');
    }

    let res = await fetch(apiUrl(`/value-report?days=${days}`));
    if (res.status === 404) {
        // Backend kan kjøre uten bindestrek-ruten (fallback)
        res = await fetch(apiUrl(`/value_report?days=${days}`));
    }
    if (!res.ok) {
        const reason = await readError(res);
        throw new Error(reason || 'Kunne ikke hente oddsrapport');
    }
    return (await res.json()) as ValueGame[];
}

export async function fetchPortfolio(): Promise<PortfolioResponse> {
    if (STATIC_MODE) {
        return getJson<PortfolioResponse>(dataUrl('portfolio.json'), 'Kunne ikke hente porteføljen');
    }
    return getJson<PortfolioResponse>(apiUrl('/portfolio'), 'Kunne ikke hente porteføljen');
}

export async function updatePortfolio(valueGames: ValueGame[]): Promise<PortfolioResponse> {
    if (!CAN_UPDATE_PORTFOLIO) {
        throw new Error('Porteføljen oppdateres automatisk og kan ikke endres herfra');
    }

    const res = await fetch(apiUrl('/portfolio/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            days_ahead: 1,
            stake_per_bet: 100,
            min_value: 0.2,
            max_odds: 4.0,
            value_games: valueGames, // sender allerede hentet odds/matchdata for raskere oppdatering
        }),
    });
    if (!res.ok) {
        throw new Error('Oppdatering feilet');
    }
    return (await res.json()) as PortfolioResponse;
}

let matchupsPromise: Promise<MatchupsData> | null = null;

function loadMatchups(): Promise<MatchupsData> {
    if (!matchupsPromise) {
        matchupsPromise = getJson<MatchupsData>(
            dataUrl('matchups.json'),
            'Kunne ikke hente forhåndsberegnede prediksjoner'
        ).catch((err) => {
            matchupsPromise = null; // la neste forsøk prøve på nytt
            throw err;
        });
    }
    return matchupsPromise;
}

export async function fetchPrediction(
    homeTeam: string,
    awayTeam: string
): Promise<PredictionResponse> {
    if (!STATIC_MODE) {
        const res = await fetch(apiUrl('/predict'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ home_team: homeTeam, away_team: awayTeam }),
        });
        if (!res.ok) {
            const reason = await readError(res);
            throw new Error(reason || 'Feil ved prediksjon');
        }
        return (await res.json()) as PredictionResponse;
    }

    const data = await loadMatchups();
    const matchup = data.matchups[`${homeTeam}-${awayTeam}`];
    const home = data.teams[homeTeam];
    const away = data.teams[awayTeam];

    if (!matchup || !home || !away) {
        throw new Error('Ingen forhåndsberegnet prediksjon for denne kombinasjonen');
    }

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

/** Når dataen sist ble generert. Kun tilgjengelig i statisk modus. */
export async function fetchMeta(): Promise<SiteMeta | null> {
    if (!STATIC_MODE) {
        return null;
    }
    try {
        return await getJson<SiteMeta>(dataUrl('meta.json'), 'Kunne ikke hente metadata');
    } catch {
        return null;
    }
}
