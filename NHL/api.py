# api.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from typing import List, Dict, Optional

from utils.data_loader import load_and_prepare_games
from utils.feature_engineering import (
    build_team_long_df,
    add_rolling_form,
    get_latest_team_form,
)
from utils.model_utils import load_model

app = FastAPI(title="NHL Prediction API", version="1.0.0")

# CORS middleware for å tillate requests fra Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
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
        games_df, id_to_abbr, abbr_to_id = load_and_prepare_games(
            "data/game.csv", "data/team_info.csv"
        )
        long_df = build_team_long_df(games_df)
        long_df = add_rolling_form(long_df, window=5)
        model = load_model("models/nhl_model.pkl")
        
        _cache["data"] = {
            "games_df": games_df,
            "id_to_abbr": id_to_abbr,
            "abbr_to_id": abbr_to_id,
            "long_df": long_df,
            "model": model,
        }
    return _cache["data"]


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
    
    # Hent siste 5 kamper
    home_games = data["long_df"][data["long_df"]["team"] == home_abbr].sort_values("date").tail(5)
    away_games = data["long_df"][data["long_df"]["team"] == away_abbr].sort_values("date").tail(5)
    
    def format_games(games_df):
        games = []
        for _, row in games_df.iterrows():
            games.append(GameInfo(
                date=row["date"].strftime("%Y-%m-%d"),
                venue="H" if row["is_home"] == 1 else "A",
                result="W" if row["win"] == 1 else "L",
                goals_for=int(row["goals_for"]),
                goals_against=int(row["goals_against"]),
                score=f"{int(row['goals_for'])}-{int(row['goals_against'])}"
            ))
        return games
    
    def calc_stats(games_df):
        if games_df.empty:
            return TeamStats(
                goals_for_avg=0,
                goals_against_avg=0,
                wins=0,
                losses=0,
                win_percentage=0
            )
        gf = games_df["goals_for"].mean()
        ga = games_df["goals_against"].mean()
        wins = int(games_df["win"].sum())
        losses = len(games_df) - wins
        win_pct = (wins / len(games_df) * 100) if len(games_df) > 0 else 0
        return TeamStats(
            goals_for_avg=round(gf, 2),
            goals_against_avg=round(ga, 2),
            wins=wins,
            losses=losses,
            win_percentage=round(win_pct, 1)
        )
    
    # Bygg features for prediksjon
    home_form = get_latest_team_form(data["long_df"], home_abbr)
    away_form = get_latest_team_form(data["long_df"], away_abbr)
    
    feature_row = pd.DataFrame([{
        "home_form_goals_for": home_form["form_goals_for"],
        "home_form_goals_against": home_form["form_goals_against"],
        "home_form_win_rate": home_form["form_win_rate"],
        "away_form_goals_for": away_form["form_goals_for"],
        "away_form_goals_against": away_form["form_goals_against"],
        "away_form_win_rate": away_form["form_win_rate"],
        "home_team_id": data["abbr_to_id"][home_abbr],
        "away_team_id": data["abbr_to_id"][away_abbr],
    }])
    
    # Gjør prediksjon
    probs = data["model"].predict_proba(feature_row)[0]
    pred_class = probs.argmax()
    
    return PredictionResponse(
        home_team=home_abbr,
        away_team=away_abbr,
        home_last_5=format_games(home_games),
        away_last_5=format_games(away_games),
        home_stats=calc_stats(home_games),
        away_stats=calc_stats(away_games),
        prob_home_win=round(float(probs[0]), 3),
        prob_ot=round(float(probs[1]), 3),
        prob_away_win=round(float(probs[2]), 3),
        prediction=LABELS[pred_class]
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
