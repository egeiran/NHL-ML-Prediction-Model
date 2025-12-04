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

export type ValueOutcomeKey = 'home' | 'draw' | 'away';

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
    status: 'pending' | 'won' | 'lost';
    payout: number;
    profit: number;
    actual_outcome?: string | null;
}

export interface PortfolioPoint {
    date: string;
    invested: number;
    value: number;
    settled_return: number;
    open_stake: number;
    open_bets: number;
}

export interface PortfolioSummary {
    total_bets: number;
    open_bets: number;
    total_staked: number;
    settled_return: number;
    current_value: number;
    profit: number;
    roi: number;
}

export interface PortfolioResponse {
    timeseries: PortfolioPoint[];
    summary: PortfolioSummary;
    bets: BetEntry[];
}
