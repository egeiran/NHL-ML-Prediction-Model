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

/* -------------------------------------------------------------------------- */
/* Skyggestrategien på vinner inkl. OT (strategy-ml.json)                      */
/* -------------------------------------------------------------------------- */

/**
 * `nobet` = kampen ble vurdert, men ikke spilt (grunnen står i `skip_reason`).
 * `void` = utsatt kamp, innsatsen tilbake.
 */
export type StrategiStatus = 'pending' | 'won' | 'lost' | 'nobet' | 'void';

/** Én kamp i `data/strategy_ml.csv`, låst ved første daglige kjøring innen 24 t. */
export interface StrategiRad {
    date: string;
    game_key: string;
    /** UTC, `...Z`. */
    start_time: string;
    home_abbr: string;
    away_abbr: string;
    decided_at: string;
    status: StrategiStatus;
    selection: 'home' | 'away' | '' | null;
    odds: number | null;
    ev: number | null;
    ev_home: number | null;
    ev_away: number | null;
    stake: number | null;
    skip_reason: string | null;
    nt_ml_home: number | null;
    nt_ml_away: number | null;
    sharp_source: string | null;
    sharp_ml_home: number | null;
    sharp_ml_away: number | null;
    /** Pinnacles margin-frie P(hjemme vinner inkl. OT) ved beslutning. */
    p_fair_home: number | null;
    /** NTs egen margin-frie P(hjemme). */
    p_nt_home: number | null;
    /** Elo-modellens P(hjemme inkl. OT). Logges, styrer ikke spillene. */
    p_model_ml_home: number | null;
    ml_outcome: 'home' | 'away' | null;
    reg_outcome: string | null;
    profit: number | null;
    /** Oddsen vi fikk × Pinnacles margin-frie sannsynlighet ved start − 1. Hovedmålet. */
    clv_sharp: number | null;
    /** Oddsen vi fikk / NTs sluttodds − 1. */
    clv_nt: number | null;
    close_nt_ml_home: number | null;
    close_nt_ml_away: number | null;
    p_fair_close_home: number | null;
}

export interface ClvStat {
    n: number;
    mean: number | null;
    ci_low: number | null;
    ci_high: number | null;
    positive_share: number | null;
}

export interface StrategiSammendrag {
    games: number;
    games_with_sharp: number;
    bets: number;
    open: number;
    settled: number;
    won: number;
    staked: number;
    profit: number;
    roi: number | null;
    clv_sharp: ClvStat;
    clv_nt: ClvStat;
    skip_reasons: Record<string, number>;
    target_bets: number;
    /** 0–1, andel av `target_bets` med CLV. */
    progress: number;
    /** ≥ target_bets spill og nedre grense i CI-et over null. */
    promotable: boolean;
}

export interface StrategiData {
    generated_at: string;
    strategy: string;
    params: {
        ev_min: number;
        max_odds: number;
        stake: number;
        target_bets: number;
        ci_level: number;
        devig: string;
        sharp_sources: string[];
        max_deviation: number;
    };
    summary: StrategiSammendrag;
    /** Dagens portefølje (HUB) fra strategiens første dag. `null` før første kamp. */
    portfolio_same_period: {
        from: string;
        bets: number;
        settled: number;
        profit: number;
        roi: number | null;
        clv_nt: number | null;
        clv_n: number;
    } | null;
    status: {
        last_run_at: string | null;
        last_job: string | null;
        /** `ok` · `no_key` · `low_quota` · `no_games` · `error`. */
        sharp_status: string | null;
        sharp_matched: number | null;
        nt_events: number | null;
        quota_remaining: number | null;
        first_decision: string | null;
    };
    /** Nyeste kamp først. */
    rows: StrategiRad[];
}
