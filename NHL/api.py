# api.py
import os
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from bet_tracker import (
    build_portfolio_payload,
    load_history,
    update_daily_bets,
    DEFAULT_MIN_VALUE,
    DEFAULT_MAX_ODDS,
)
from live.team_cache import clear_team_cache
from report_service import (
    PREDICT_GAMES_NEEDED,
    build_prediction,
    build_value_report,
    fetch_team_games,
    get_data,
    list_teams,
)
from utils.team_alias import to_canonical

app = FastAPI(title="NHL Prediction API", version="1.0.0")

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
EXTRA_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
# Tillat alle localhost-porter (f.eks. 3001/3002 når Next velger ny port)
LOCAL_ORIGIN_REGEX = os.environ.get("ALLOWED_ORIGIN_REGEX") or r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

# CORS middleware for å tillate requests fra Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_ALLOWED_ORIGINS + EXTRA_ALLOWED_ORIGINS,
    allow_origin_regex=LOCAL_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionRequest(BaseModel):
    home_team: str
    away_team: str


class GameInfo(BaseModel):
    date: str
    venue: str  # "H" or "A"
    result: str  # "W" or "L"
    goals_for: int
    goals_against: int
    score: str


class TeamStats(BaseModel):
    goals_for_avg: float
    goals_against_avg: float
    wins: int
    losses: int
    win_percentage: float


class PredictionResponse(BaseModel):
    home_team: str
    away_team: str
    home_last_5: List[GameInfo]
    away_last_5: List[GameInfo]
    home_stats: TeamStats
    away_stats: TeamStats
    prob_home_win: float
    prob_ot: float
    prob_away_win: float
    prediction: str


class ValueGameResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    event_id: str
    date: str
    start_time: str
    home: str
    away: str
    home_abbr: Optional[str]
    away_abbr: Optional[str]
    odds_home: Optional[float]
    odds_draw: Optional[float]
    odds_away: Optional[float]
    model_home_win: float
    model_draw: float
    model_away_win: float
    model_home_odds: Optional[float]
    model_draw_odds: Optional[float]
    model_away_odds: Optional[float]
    implied_home_prob: Optional[float]
    implied_draw_prob: Optional[float]
    implied_away_prob: Optional[float]
    value_home: Optional[float]
    value_draw: Optional[float]
    value_away: Optional[float]
    best_value: Optional[str]
    best_value_delta: Optional[float]


class BetEntry(BaseModel):
    model_config = ConfigDict(protected_namespaces=(), extra="allow")
    season: Optional[str] = None
    date: str
    event_id: str
    start_time: Optional[str] = ""
    home_abbr: Optional[str] = None
    away_abbr: Optional[str] = None
    selection: str
    odds: float
    model_prob: float
    implied_prob: float
    value: float
    stake: float
    status: str
    payout: float
    profit: float
    actual_outcome: Optional[str] = None


class PortfolioPoint(BaseModel):
    date: str
    invested: float
    value: float
    settled_return: float
    open_stake: float
    open_bets: int
    bets_placed: int
    bets_won: int
    bets_settled: int


class PortfolioSummary(BaseModel):
    total_bets: int
    open_bets: int
    total_staked: float
    settled_return: float
    current_value: float
    open_stake: float
    profit: float
    roi: float
    win_rate: float


class PortfolioAllTime(BaseModel):
    total_bets: int
    profit: float


class PortfolioResponse(BaseModel):
    season: Optional[str] = None
    seasons: List[str] = []
    all_time: Optional[PortfolioAllTime] = None
    timeseries: List[PortfolioPoint]
    summary: PortfolioSummary
    bets: List[BetEntry]


class PortfolioUpdateRequest(BaseModel):
    days_ahead: int = 1
    stake_per_bet: float = 100.0
    min_value: float = DEFAULT_MIN_VALUE
    max_odds: Optional[float] = DEFAULT_MAX_ODDS
    value_games: Optional[List[ValueGameResponse]] = None


@app.get("/")
def read_root():
    return {"message": "NHL Prediction API", "version": "1.0.0"}


@app.get("/teams", response_model=List[Dict[str, str]])
def get_teams():
    """Returnerer liste over alle tilgjengelige lag"""
    return list_teams()


@app.post("/predict", response_model=PredictionResponse)
def predict_game(request: PredictionRequest):
    """Gjør en prediksjon for en kamp"""
    home_abbr_raw = request.home_team.upper()
    away_abbr_raw = request.away_team.upper()
    home_abbr = to_canonical(home_abbr_raw)
    away_abbr = to_canonical(away_abbr_raw)

    data = get_data()

    # Valider at lagene eksisterer i modelloppsettet (kanonisert)
    if home_abbr not in data["abbr_to_id"]:
        raise HTTPException(status_code=404, detail=f"Team {home_abbr_raw} not found")
    if away_abbr not in data["abbr_to_id"]:
        raise HTTPException(status_code=404, detail=f"Team {away_abbr_raw} not found")

    try:
        home_recent = fetch_team_games(home_abbr_raw, limit=PREDICT_GAMES_NEEDED)
        away_recent = fetch_team_games(away_abbr_raw, limit=PREDICT_GAMES_NEEDED)
    except Exception as exc:  # pragma: no cover - beskytter API-et
        # Detaljene logges, men sendes ikke ut: de kan avsløre filstier o.l.
        print(f"Henting av kamper feilet: {exc!r}")
        raise HTTPException(status_code=502, detail="Kunne ikke hente kampdata")

    if not home_recent:
        raise HTTPException(
            status_code=404, detail=f"Fant ingen kamper for {home_abbr}"
        )
    if not away_recent:
        raise HTTPException(
            status_code=404, detail=f"Fant ingen kamper for {away_abbr}"
        )

    try:
        prediction = build_prediction(home_abbr, away_abbr, home_recent, away_recent)
    except Exception as exc:  # pragma: no cover - beskytter API-et
        # F.eks. manglende Elo-ratings eller modellfil. Detaljene logges.
        print(f"Prediksjon feilet: {exc!r}")
        raise HTTPException(status_code=502, detail="Kunne ikke beregne prediksjonen")

    return PredictionResponse(**prediction)


@app.get("/value-report", response_model=List[ValueGameResponse])
def get_value_report(days: int = 3):
    """
    Returnerer kamper for de neste `days` dagene med modell-sannsynlighet,
    markedets odds og forventet EV.
    """
    try:
        report = build_value_report(days, verbose=True)
    except Exception as exc:  # pragma: no cover - beskytter API-et
        # Detaljene logges, men sendes ikke ut: de kan avsløre filstier o.l.
        print(f"Value-rapport feilet: {exc!r}")
        raise HTTPException(status_code=502, detail="Kunne ikke bygge value-rapporten")

    return [ValueGameResponse(**row) for row in report]


@app.get("/portfolio", response_model=PortfolioResponse)
def get_portfolio(season: Optional[str] = None, all_seasons: bool = False):
    """
    Returnerer historiske bets + tidsserie for investert/verdi til grafen.

    Uten `season` vises nyeste sesong som har spill. `all_seasons=true` gir hele
    historikken samlet.
    """
    history = load_history()
    return build_portfolio_payload(history, season=season, all_seasons=all_seasons)


@app.post("/portfolio/update", response_model=PortfolioResponse)
def trigger_portfolio_update(req: PortfolioUpdateRequest):
    """
    Kjører daglig oppdatering: avregner ferdige kamper og legger til alle value-bets over min_value.
    """
    days = max(0, min(req.days_ahead, 10))

    result = update_daily_bets(
        days_ahead=days,
        stake_per_bet=req.stake_per_bet,
        min_value=req.min_value,
        max_odds=req.max_odds,
        # All rapportbygging skjer på serveren for å unngå manipulert input
        prefetched_report=None,
        # Ta alle dagens kamper over min_value, ikke bare én per dag
        take_all_prefetched=True,
    )
    return result["portfolio"]


# Alias-endepunkt for eldre/alternative ruter
@app.get("/value_report", response_model=List[ValueGameResponse], include_in_schema=False)
def get_value_report_alias(days: int = 3):
    return get_value_report(days)


@app.post("/cache/clear")
def clear_cache():
    """Tømmer team games cache (brukes ved behov for fresh data)."""
    clear_team_cache()
    return {"status": "ok", "message": "Team cache cleared"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
