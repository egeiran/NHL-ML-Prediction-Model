# api.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from bet_tracker import (
    build_portfolio_payload,
    load_history,
    update_daily_bets,
)
from live.nhl_api import get_team_recent_games
from live.nt_odds import get_nhl_matches_range
from live.form_engine import (
    compute_stats_from_games,
    format_recent_games,
)
from live.live_feature_builder import build_live_features
from utils.data_loader import load_team_mappings
from utils.feature_engineering import DEFAULT_WINDOWS
from utils.model_utils import load_model

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "team_info.csv"
MODEL_PATH = BASE_DIR / "models" / "nhl_model.pkl"

app = FastAPI(title="NHL Prediction API", version="1.0.0")

# CORS middleware for å tillate requests fra Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],  # Next.js dev default hosts
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LABELS = ["Home Win", "OT / SO", "Away Win"]

# Cache for å unngå å laste data på nytt for hver request
_cache = {}


def get_data():
    """Henter og cacher data"""
    if "data" not in _cache:
        id_to_abbr, abbr_to_id = load_team_mappings(str(DATA_PATH))
        model = load_model(str(MODEL_PATH))

        _cache["data"] = {
            "id_to_abbr": id_to_abbr,
            "abbr_to_id": abbr_to_id,
            "model": model,
        }
    return _cache["data"]


def implied_probability(odds: Optional[float]) -> Optional[float]:
    """Konverterer odds til implisitt sannsynlighet."""
    if odds is None or odds <= 1e-9:
        return None
    return 1 / odds


def normalize_probs(*probs: Optional[float]):
    """Sørger for at sannsynlighetene summerer til 1."""
    clean = [p if p is not None else 0.0 for p in probs]
    total = sum(clean)
    if total <= 0:
        return tuple(0.0 for _ in clean)
    return tuple(p / total for p in clean)


def evaluate_value(model_prob: float, implied_prob: Optional[float]) -> Optional[float]:
    """VALUE = hvor mye vi mener oddsen er feilprisett."""
    if implied_prob is None:
        return None
    return model_prob - implied_prob


def prob_to_decimal_odds(prob: float) -> Optional[float]:
    """Konverterer modell-prob til decimal odds (fair odds)."""
    if prob <= 0:
        return None
    return round(1 / prob, 2)


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


class PortfolioSummary(BaseModel):
    total_bets: int
    open_bets: int
    total_staked: float
    settled_return: float
    current_value: float
    profit: float
    roi: float


class PortfolioResponse(BaseModel):
    timeseries: List[PortfolioPoint]
    summary: PortfolioSummary
    bets: List[BetEntry]


class PortfolioUpdateRequest(BaseModel):
    days_ahead: int = 1
    stake_per_bet: float = 100.0
    min_value: float = 0.01
    value_games: Optional[List[ValueGameResponse]] = None


@app.get("/")
def read_root():
    return {"message": "NHL Prediction API", "version": "1.0.0"}


@app.get("/teams", response_model=List[Dict[str, str]])
def get_teams():
    """Returnerer liste over alle tilgjengelige lag"""
    data = get_data()
    teams = []
    for abbr in sorted(data["abbr_to_id"].keys()):
        teams.append({
            "abbreviation": abbr,
            "id": str(data["abbr_to_id"][abbr])
        })
    return teams


@app.post("/predict", response_model=PredictionResponse)
def predict_game(request: PredictionRequest):
    """Gjør en prediksjon for en kamp"""
    home_abbr = request.home_team.upper()
    away_abbr = request.away_team.upper()
    
    data = get_data()
    
    # Valider at lagene eksisterer
    if home_abbr not in data["abbr_to_id"]:
        raise HTTPException(status_code=404, detail=f"Team {home_abbr} not found")
    if away_abbr not in data["abbr_to_id"]:
        raise HTTPException(status_code=404, detail=f"Team {away_abbr} not found")

    max_games_needed = max(max(DEFAULT_WINDOWS), 5)

    try:
        home_recent = get_team_recent_games(home_abbr, limit=max_games_needed)
        away_recent = get_team_recent_games(away_abbr, limit=max_games_needed)
    except Exception as exc:  # pragma: no cover - beskytter API-et
        raise HTTPException(
            status_code=502, detail=f"Feil ved henting av kamper: {exc}"
        )

    if not home_recent:
        raise HTTPException(
            status_code=404, detail=f"Fant ingen kamper for {home_abbr}"
        )
    if not away_recent:
        raise HTTPException(
            status_code=404, detail=f"Fant ingen kamper for {away_abbr}"
        )

    home_last_5 = format_recent_games(home_abbr, home_recent, limit=5)
    away_last_5 = format_recent_games(away_abbr, away_recent, limit=5)
    home_stats = compute_stats_from_games(home_abbr, home_recent[:5])
    away_stats = compute_stats_from_games(away_abbr, away_recent[:5])

    feature_row = build_live_features(
        away_abbr,
        home_abbr,
        windows=DEFAULT_WINDOWS,
        home_games=home_recent,
        away_games=away_recent,
    )

    probs = data["model"].predict_proba(feature_row)[0]
    pred_idx = probs.argmax()
    pred_class = data["model"].classes_[pred_idx]
    class_prob_map = dict(zip(data["model"].classes_, probs))

    prob_home_win = round(float(class_prob_map.get(0, 0.0)), 3)
    prob_ot = round(float(class_prob_map.get(1, 0.0)), 3)
    prob_away_win = round(float(class_prob_map.get(2, 0.0)), 3)

    label_idx = int(pred_class) if isinstance(pred_class, (int, float)) else pred_idx
    prediction_label = LABELS[label_idx] if 0 <= label_idx < len(LABELS) else str(pred_class)

    return PredictionResponse(
        home_team=home_abbr,
        away_team=away_abbr,
        home_last_5=home_last_5,
        away_last_5=away_last_5,
        home_stats=TeamStats(**home_stats),
        away_stats=TeamStats(**away_stats),
        prob_home_win=prob_home_win,
        prob_ot=prob_ot,
        prob_away_win=prob_away_win,
        prediction=prediction_label,
    )


@app.get("/value-report", response_model=List[ValueGameResponse])
def get_value_report(days: int = 3):
    """
    Returnerer kamper for de neste `days` dagene med modell-sannsynlighet,
    markedets odds og value-gap.
    """
    # Begrens antall dager for å unngå unødvendig store kall
    days = max(0, min(days, 10))
    data = get_data()
    model = data["model"]

    try:
        games = get_nhl_matches_range(days)
    except Exception as exc:  # pragma: no cover - beskytter API-et
        raise HTTPException(status_code=502, detail=f"Feil ved henting av odds: {exc}")
    results: List[ValueGameResponse] = []

    for game in games:
        home_abbr = game.get("home_abbr")
        away_abbr = game.get("away_abbr")

        if not home_abbr or not away_abbr:
            # Mangler mapping - hopp over
            continue

        try:
            feature_row = build_live_features(
                away_abbr,
                home_abbr,
                windows=DEFAULT_WINDOWS,
            )
            probs = model.predict_proba(feature_row)[0]
        except Exception as exc:  # pragma: no cover - beskytter API-et
            print(f"Skipper kamp {home_abbr} vs {away_abbr}: {exc}")
            continue

        class_prob_map = dict(zip(model.classes_, probs))
        home_prob, draw_prob, away_prob = normalize_probs(
            float(class_prob_map.get(0, 0.0)),
            float(class_prob_map.get(1, 0.0)),
            float(class_prob_map.get(2, 0.0)),
        )

        raw_imp_home = implied_probability(game.get("odds_home"))
        raw_imp_draw = implied_probability(game.get("odds_draw"))
        raw_imp_away = implied_probability(game.get("odds_away"))

        imp_home, imp_draw, imp_away = normalize_probs(
            raw_imp_home if raw_imp_home is not None else 0.0,
            raw_imp_draw if raw_imp_draw is not None else 0.0,
            raw_imp_away if raw_imp_away is not None else 0.0,
        )

        value_home = evaluate_value(home_prob, imp_home if raw_imp_home is not None else None)
        value_draw = evaluate_value(draw_prob, imp_draw if raw_imp_draw is not None else None)
        value_away = evaluate_value(away_prob, imp_away if raw_imp_away is not None else None)

        value_map = {
            "home": value_home,
            "draw": value_draw,
            "away": value_away,
        }
        available_values = {k: v for k, v in value_map.items() if v is not None}
        best_value = None
        best_value_delta = None
        if available_values:
            best_value, best_value_delta = max(
                available_values.items(), key=lambda kv: kv[1]
            )

        raw_start = game.get("startTime") or ""
        try:
            start_dt = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
            date_str = start_dt.strftime("%Y-%m-%d")
            start_time = start_dt.isoformat()
        except Exception:
            date_str = ""
            start_time = raw_start if isinstance(raw_start, str) else ""

        results.append(ValueGameResponse(
            event_id=str(game.get("eventId") or f"{home_abbr}-{away_abbr}-{start_time}"),
            date=date_str,
            start_time=start_time,
            home=str(game.get("home") or home_abbr or ""),
            away=str(game.get("away") or away_abbr or ""),
            home_abbr=home_abbr or None,
            away_abbr=away_abbr or None,
            odds_home=game.get("odds_home"),
            odds_draw=game.get("odds_draw"),
            odds_away=game.get("odds_away"),
            model_home_win=round(home_prob, 3),
            model_draw=round(draw_prob, 3),
            model_away_win=round(away_prob, 3),
            model_home_odds=prob_to_decimal_odds(home_prob),
            model_draw_odds=prob_to_decimal_odds(draw_prob),
            model_away_odds=prob_to_decimal_odds(away_prob),
            implied_home_prob=round(imp_home, 3) if raw_imp_home is not None else None,
            implied_draw_prob=round(imp_draw, 3) if raw_imp_draw is not None else None,
            implied_away_prob=round(imp_away, 3) if raw_imp_away is not None else None,
            value_home=round(value_home, 3) if value_home is not None else None,
            value_draw=round(value_draw, 3) if value_draw is not None else None,
            value_away=round(value_away, 3) if value_away is not None else None,
            best_value=best_value,
            best_value_delta=round(best_value_delta, 3) if best_value_delta is not None else None,
        ))

    return results


@app.get("/portfolio", response_model=PortfolioResponse)
def get_portfolio():
    """
    Returnerer historiske bets + tidsserie for investert/verdi til grafen.
    """
    history = load_history()
    return build_portfolio_payload(history)


@app.post("/portfolio/update", response_model=PortfolioResponse)
def trigger_portfolio_update(req: PortfolioUpdateRequest):
    """
    Kjører daglig oppdatering: avregner ferdige kamper og legger til dagens beste value-bet.
    """
    days = max(0, min(req.days_ahead, 10))

    result = update_daily_bets(
        days_ahead=days,
        stake_per_bet=req.stake_per_bet,
        min_value=req.min_value,
        # All rapportbygging skjer på serveren for å unngå manipulert input
        prefetched_report=None,
        take_all_prefetched=False,
    )
    return result["portfolio"]


# Alias-endepunkt for eldre/alternative ruter
@app.get("/value_report", response_model=List[ValueGameResponse], include_in_schema=False)
def get_value_report_alias(days: int = 3):
    return get_value_report(days)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
