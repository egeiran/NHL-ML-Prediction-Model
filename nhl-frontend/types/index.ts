/**
 * Typene speiler de faktiske filene i `public/data/`. Der en type er videre enn
 * dagens fil (nye nullable felt på `BetEntry`), er det fordi pipelinen skriver
 * dem ved neste kjøring. Ingenting her skal antas å finnes uten sjekk.
 */

/* -------------------------------------------------------------------------- */
/* Lag                                                                         */
/* -------------------------------------------------------------------------- */

/** `teams.json` — 32 rader. `id` er NHL-APIets numeriske lag-id, som streng. */
export interface Team {
    abbreviation: string;
    id: string;
}

export interface GameInfo {
    date: string;
    venue: string;
    result: string;
    goals_for: number;
    goals_against: number;
    score: string;
}

export interface TeamStats {
    goals_for_avg: number;
    goals_against_avg: number;
    wins: number;
    losses: number;
    win_percentage: number;
}

/** Siste 5 kamper + nøkkeltall for ett lag, slik de ligger i `matchups.json`. */
export interface TeamSummary {
    last_5: GameInfo[];
    stats: TeamStats;
}

export interface MatchupPrediction {
    prob_home_win: number;
    prob_ot: number;
    prob_away_win: number;
    prediction: string;
}

/** `matchups.json` — 992 nøkler `"HOME-AWAY"` og 32 lag. */
export interface MatchupsData {
    generated_at: string;
    teams: Record<string, TeamSummary>;
    matchups: Record<string, MatchupPrediction>;
}

/** Sammenstilt kampanalyse — bygges i frontend av `MatchupsData`. */
export interface PredictionResponse {
    home_team: string;
    away_team: string;
    home_last_5: GameInfo[];
    away_last_5: GameInfo[];
    home_stats: TeamStats;
    away_stats: TeamStats;
    prob_home_win: number;
    prob_ot: number;
    prob_away_win: number;
    prediction: string;
}

/* -------------------------------------------------------------------------- */
/* Meta                                                                        */
/* -------------------------------------------------------------------------- */

/** `meta.json`. `value_min` er pipelinens EV-terskel og default for brukeren. */
export interface SiteMeta {
    generated_at: string;
    days_ahead: number;
    files: string[];
    failed: string[];
    /** Pipelinens EV-terskel som brøk, f.eks. 0.15. */
    value_min: number;
    /**
     * EV-terskelen for OT/SO, f.eks. 0.30 — høyere enn `value_min` fordi
     * OT/SO-oddsen ligger fast. Mangler i `meta.json` skrevet før terskelen
     * fantes; da gjelder `value_min` for alle tre utfall.
     */
    draw_value_min?: number;
    /** Høyeste odds pipelinen spiller. */
    max_odds: number;
    /** Om OT/SO-spill legges inn. */
    allow_draw_bets: boolean;
}

/* -------------------------------------------------------------------------- */
/* Value-rapport                                                               */
/* -------------------------------------------------------------------------- */

export type ValueOutcomeKey = 'home' | 'draw' | 'away';

/** `value-report.json` — tom array i sesongpausen. */
export interface ValueGame {
    event_id: string;
    date: string;
    start_time: string;
    home: string;
    away: string;
    home_abbr?: string | null;
    away_abbr?: string | null;
    odds_home?: number | null;
    odds_draw?: number | null;
    odds_away?: number | null;
    model_home_win: number;
    model_draw: number;
    model_away_win: number;
    model_home_odds?: number | null;
    model_draw_odds?: number | null;
    model_away_odds?: number | null;
    implied_home_prob?: number | null;
    implied_draw_prob?: number | null;
    implied_away_prob?: number | null;
    value_home?: number | null;
    value_draw?: number | null;
    value_away?: number | null;
    best_value?: ValueOutcomeKey | null;
    best_value_delta?: number | null;
}

/* -------------------------------------------------------------------------- */
/* Portefølje                                                                  */
/* -------------------------------------------------------------------------- */

export type BetStatus = 'pending' | 'won' | 'lost';

/**
 * Én rad i `portfolio.json:bets[]` — og samme radform i `shadow.json`.
 *
 * De tolv `odds_*` / `model_*` / `implied_*_prob` / `value_*`-feltene er nye:
 * de mangler helt i dagens fil (202 historiske rader) og blir `null` på dem når
 * pipelinen regenererer. Behandle dem alltid som `number | null | undefined`.
 */
export interface BetEntry {
    date: string;
    event_id: string;
    start_time?: string;
    home_abbr?: string | null;
    away_abbr?: string | null;
    selection: ValueOutcomeKey | string;
    odds: number;
    model_prob: number;
    implied_prob: number;
    value: number;
    stake: number;
    status: BetStatus;
    payout: number;
    profit: number;
    actual_outcome?: string | null;
    created_at?: string | null;
    updated_at?: string | null;

    /* Fullt oddsbilde for kampen — null på alle historiske rader. */
    odds_home?: number | null;
    odds_draw?: number | null;
    odds_away?: number | null;
    model_home_win?: number | null;
    model_draw?: number | null;
    model_away_win?: number | null;
    implied_home_prob?: number | null;
    implied_draw_prob?: number | null;
    implied_away_prob?: number | null;
    value_home?: number | null;
    value_draw?: number | null;
    value_away?: number | null;
}

/** Ett punkt i `portfolio.json:timeseries[]`. `value` er KUMULATIV nettogevinst. */
export interface PortfolioPoint {
    date: string;
    invested: number;
    /** Kumulativ nettogevinst i kroner, ikke saldo. */
    value: number;
    settled_return: number;
    open_stake: number;
    open_bets: number;
    bets_placed: number;
    bets_won: number;
    bets_settled: number;
}

export interface PortfolioSummary {
    total_bets: number;
    open_bets: number;
    total_staked: number;
    settled_return: number;
    current_value: number;
    open_stake: number;
    profit: number;
    roi: number;
    win_rate: number;
}

/** `portfolio.json` — topp-nivå er nøyaktig disse tre nøklene. */
export interface PortfolioResponse {
    timeseries: PortfolioPoint[];
    summary: PortfolioSummary;
    bets: BetEntry[];
}

/** `shadow.json` — samme radform som `portfolio.json:bets[]`. I dag `[]`. */
export type ShadowEntry = BetEntry;

/* -------------------------------------------------------------------------- */
/* Elo                                                                         */
/* -------------------------------------------------------------------------- */

export interface EloConfig {
    base_rating: number;
    home_advantage: number;
    k_factor: number;
    ot_win_score: number;
    scale: number;
    season_regression: number;
}

export interface EloMeta {
    n_games: number;
    /** Siste kampdato som er med i ratingene, `YYYY-MM-DD`. */
    through: string;
    updated_at: string;
    n_api_games?: number;
    source?: string;
}

/**
 * `elo.json`. 32 lag, nøkkel `UTA` — ingen `ARI`. Aliasingen skjer i
 * eksport-steget, aldri i frontend (`display_keys: true` bekrefter det).
 */
export interface EloData {
    generated_at: string;
    config: EloConfig;
    meta: EloMeta;
    /** `true` når `ratings` allerede er skrevet med visningsforkortelser. */
    display_keys: boolean;
    ratings: Record<string, number>;
}
