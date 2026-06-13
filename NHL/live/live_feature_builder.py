# live/live_feature_builder.py
import os
import pandas as pd
from typing import Dict, List, Optional, Sequence

from live.form_engine import (
    compute_team_form,
    compute_team_form_from_games,
)
from utils.data_loader import load_team_mappings
from utils.elo import build_elo_feature_values, load_ratings
from utils.feature_engineering import DEFAULT_WINDOWS, get_feature_columns
from utils.team_alias import to_canonical

ELO_RATINGS_PATH = "models/elo_ratings.json"


def load_team_ids(team_info_path="data/team_info.csv"):
    _, abbr_to_id = load_team_mappings(team_info_path)
    return abbr_to_id


# Elo-ratings caches, men lastes på nytt hvis fila er oppdatert (mtime endres)
# slik at et langtkjørende API plukker opp ferske tall uten omstart.
_ELO_CACHE = {}


def _get_elo():
    try:
        mtime = os.path.getmtime(ELO_RATINGS_PATH)
    except OSError:
        mtime = None
    if _ELO_CACHE.get("mtime") != mtime:
        ratings, config = load_ratings(ELO_RATINGS_PATH)
        _ELO_CACHE["ratings"] = ratings
        _ELO_CACHE["config"] = config
        _ELO_CACHE["mtime"] = mtime
    return _ELO_CACHE["ratings"], _ELO_CACHE["config"]


def build_live_features(
    away_abbr: str,
    home_abbr: str,
    windows: Sequence[int] = DEFAULT_WINDOWS,
    home_games: Optional[List[Dict]] = None,
    away_games: Optional[List[Dict]] = None,
) -> pd.DataFrame:
    """
    Lager en rad med nøyaktig de samme features som treningsdataen brukte.
    """

    # 1. form-features
    if home_games is not None:
        home_form = compute_team_form_from_games(home_abbr, home_games, windows=windows)
    else:
        home_form = compute_team_form(home_abbr, windows=windows)

    if away_games is not None:
        away_form = compute_team_form_from_games(away_abbr, away_games, windows=windows)
    else:
        away_form = compute_team_form(away_abbr, windows=windows)

    # 2. team_id-features
    abbr_to_id = load_team_ids()

    def _resolve_team_id(abbr: str) -> int:
        canonical = to_canonical(abbr)
        if canonical in abbr_to_id:
            return abbr_to_id[canonical]
        if abbr in abbr_to_id:
            return abbr_to_id[abbr]
        raise ValueError(f"Mangler team_id for lag '{abbr}' (kanonisert: '{canonical}')")

    home_id = _resolve_team_id(home_abbr)
    away_id = _resolve_team_id(away_abbr)

    row = {}
    for w in windows:
        row[f"home_form_goals_for_w{w}"] = home_form[f"form_goals_for_w{w}"]
        row[f"home_form_goals_against_w{w}"] = home_form[f"form_goals_against_w{w}"]
        row[f"home_form_win_rate_w{w}"] = home_form[f"form_win_rate_w{w}"]

        row[f"away_form_goals_for_w{w}"] = away_form[f"form_goals_for_w{w}"]
        row[f"away_form_goals_against_w{w}"] = away_form[f"form_goals_against_w{w}"]
        row[f"away_form_win_rate_w{w}"] = away_form[f"form_win_rate_w{w}"]

    # CRUCIAL: same as training
    row["home_team_id"] = home_id
    row["away_team_id"] = away_id

    # Elo-features (samme rekkefølge som under trening). Bruker kanoniske
    # lagforkortelser for oppslag i de lagrede ratingene.
    elo_ratings, elo_config = _get_elo()
    row.update(
        build_elo_feature_values(
            to_canonical(home_abbr),
            to_canonical(away_abbr),
            elo_ratings,
            elo_config,
        )
    )

    feature_cols = get_feature_columns(windows)

    return pd.DataFrame([row], columns=feature_cols)
