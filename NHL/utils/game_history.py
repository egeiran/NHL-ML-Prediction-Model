"""
Kamphistorikken modellen og Elo bygges på: game.csv (2000–2020) skjøtet med
ferdigspilte grunnseriekamper fra NHL-APIet (2020/21 og framover).

Delt av train_model.py, update_elo_ratings.py, backtest_season.py og
repredict_season.py, så alle ser nøyaktig samme kamper, samme lagnavn og
samme lokale kampdato.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import pandas as pd

from utils.data_loader import load_and_prepare_games
from utils.elo import EloConfig, compute_elo_state
from utils.team_alias import to_canonical

GAME_COLUMNS = [
    "game_id", "date", "season", "home_team", "away_team",
    "home_goals", "away_goals", "outcome_code", "local_date",
]

# Første API-sesong. game.csv dekker grunnserien t.o.m. 2019/20.
FIRST_API_SEASON = "20202021"


def current_season_id(today: datetime) -> str:
    """NHL-sesong-id (YYYYYYYY). Ny sesong regnes fra juli."""
    year = today.year
    start = year if today.month >= 7 else year - 1
    return f"{start}{start + 1}"


def seasons_to_fetch(until_season: Optional[int] = None) -> List[str]:
    """
    API-sesongene som skal hentes. `NHL_ELO_SEASONS` (komma-liste) overstyrer,
    ellers fra `NHL_ELO_START_SEASON` (default 2020/21) til inneværende sesong,
    eventuelt avkortet til `until_season`.
    """
    explicit = os.environ.get("NHL_ELO_SEASONS")
    if explicit:
        seasons = [s.strip() for s in explicit.split(",") if s.strip()]
    else:
        start = os.environ.get("NHL_ELO_START_SEASON", FIRST_API_SEASON)
        start_year = int(start[:4])
        end_year = int(current_season_id(datetime.now(timezone.utc))[:4])
        seasons = [f"{y}{y + 1}" for y in range(start_year, end_year + 1)]
    if until_season is not None:
        seasons = [s for s in seasons if int(s) <= int(until_season)]
    return seasons


def historical_frame() -> pd.DataFrame:
    """
    game.csv som kampframe. Datoene gjøres tz-naive (UTC), og `local_date` er
    nordamerikansk kampdato: starttid i GMT minus 5 timer. En kamp som starter
    01:00 GMT ble spilt kvelden før lokalt, og back-to-back må telles på den.
    """
    games, _, _ = load_and_prepare_games("data/game.csv", "data/team_info.csv")
    df = games.copy()
    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    df["local_date"] = (df["date"] - pd.Timedelta(hours=5)).dt.normalize()
    df["season"] = df["season"].astype(int)
    return df[GAME_COLUMNS]


def api_frame(seasons: List[str]) -> pd.DataFrame:
    """Ferdigspilte API-kamper som kampframe. Tom frame ved feil/ingen."""
    from live.nhl_results import fetch_completed_games

    rows = fetch_completed_games(seasons, include_playoffs=False)
    if not rows:
        return pd.DataFrame(columns=GAME_COLUMNS)

    records = []
    for g in rows:
        records.append(
            {
                "game_id": g["id"],
                "date": pd.to_datetime(g["date"]),
                "season": int(g["season"]),
                # Kanoniser så franchise-historikk videreføres (UTA -> ARI osv.).
                "home_team": to_canonical(g["home"]),
                "away_team": to_canonical(g["away"]),
                "home_goals": g["home_goals"],
                "away_goals": g["away_goals"],
                "outcome_code": g["outcome_code"],
                # gameDate fra APIet er allerede lokal kampdato.
                "local_date": pd.to_datetime(g["date"]).normalize(),
            }
        )
    return pd.DataFrame.from_records(records, columns=GAME_COLUMNS)


def combine(hist: pd.DataFrame, api: pd.DataFrame) -> pd.DataFrame:
    """Skjøter historikk og API-kamper i kronologisk rekkefølge."""
    frames = [f for f in (hist, api) if not f.empty]
    combined = pd.concat(frames, ignore_index=True) if frames else hist.copy()
    combined = combined.dropna(subset=["date"]).sort_values(["date", "game_id"])
    combined["season"] = combined["season"].astype(int)
    return combined.reset_index(drop=True)


def add_back_to_back(games: pd.DataFrame) -> pd.DataFrame:
    """
    `home_b2b`/`away_b2b` = 1 når laget spilte grunnseriekamp dagen før
    (lokal dato). Bare kampene i `games` teller, så serien må være komplett.
    """
    rows = pd.concat(
        [
            games[["game_id", "home_team", "local_date"]]
            .rename(columns={"home_team": "team"})
            .assign(is_home=1),
            games[["game_id", "away_team", "local_date"]]
            .rename(columns={"away_team": "team"})
            .assign(is_home=0),
        ],
        ignore_index=True,
    ).sort_values(["team", "local_date", "game_id"])
    previous = rows.groupby("team")["local_date"].shift(1)
    rows["b2b"] = ((rows["local_date"] - previous).dt.days == 1).astype(int)

    home = rows[rows["is_home"] == 1][["game_id", "b2b"]].rename(columns={"b2b": "home_b2b"})
    away = rows[rows["is_home"] == 0][["game_id", "b2b"]].rename(columns={"b2b": "away_b2b"})
    return games.merge(home, on="game_id", how="left").merge(away, on="game_id", how="left")


def build_feature_history(
    games: pd.DataFrame,
    config: EloConfig = EloConfig(),
) -> Tuple[pd.DataFrame, Dict[str, float], Dict[str, int]]:
    """
    Pre-kamp Elo + back-to-back for hver kamp i `games`, punkt-i-tid.

    Returnerer (frame, siste ratings, sesongen hvert lag sist spilte i).
    """
    elo_df, ratings, last_season = compute_elo_state(games, config)
    frame = add_back_to_back(games).merge(elo_df, on="game_id", how="left")
    return frame, ratings, last_season


def load_games(
    include_api: bool = True,
    until_season: Optional[int] = None,
    min_api_games: int = 0,
) -> Tuple[pd.DataFrame, int]:
    """
    game.csv + API-kamper. Returnerer (kamper, antall fra APIet).

    `min_api_games` gjør APIet påkrevd: får vi færre kamper derfra, kastes
    RuntimeError i stedet for å stille tilbake til 2020-data.
    """
    hist = historical_frame()
    api = pd.DataFrame(columns=GAME_COLUMNS)
    if include_api:
        seasons = seasons_to_fetch(until_season)
        print(f"Fetching completed games from NHL API for seasons: {seasons}")
        api = api_frame(seasons)
        print(f"  API games fetched: {len(api)}")
        if len(api) < min_api_games:
            raise RuntimeError(
                f"Fikk bare {len(api)} kamper fra NHL-APIet (krever {min_api_games})"
            )
    games = combine(hist, api)
    if until_season is not None:
        games = games[games["season"] <= int(until_season)].reset_index(drop=True)
    return games, len(api)
