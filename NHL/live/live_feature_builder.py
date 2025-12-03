# live/live_feature_builder.py
import pandas as pd
import json
import os

from live.form_engine import compute_team_form


def load_team_ids(team_info_path="data/team_info.csv"):
    df = pd.read_csv(team_info_path)
    # mapping f.eks: "NYR" → 3
    abbr_to_id = dict(zip(df["abbreviation"], df["team_id"]))
    return abbr_to_id


def build_live_features(away_abbr: str, home_abbr: str) -> pd.DataFrame:
    """
    Lager en rad med nøyaktig de samme features som treningsdataen brukte.
    """

    # 1. form-features
    away_form = compute_team_form(away_abbr)
    home_form = compute_team_form(home_abbr)

    # 2. team_id-features
    abbr_to_id = load_team_ids()

    if home_abbr not in abbr_to_id:
        raise ValueError(f"Mangler team_id for HOME-lag '{home_abbr}'")

    if away_abbr not in abbr_to_id:
        raise ValueError(f"Mangler team_id for AWAY-lag '{away_abbr}'")

    home_id = abbr_to_id[home_abbr]
    away_id = abbr_to_id[away_abbr]

    row = {
        "home_form_goals_for": home_form["form_goals_for"],
        "home_form_goals_against": home_form["form_goals_against"],
        "home_form_win_rate": home_form["form_win_rate"],

        "away_form_goals_for": away_form["form_goals_for"],
        "away_form_goals_against": away_form["form_goals_against"],
        "away_form_win_rate": away_form["form_win_rate"],

        # CRUCIAL: same as training
        "home_team_id": home_id,
        "away_team_id": away_id,
    }

    feature_cols = [
        "home_form_goals_for",
        "home_form_goals_against",
        "home_form_win_rate",
        "away_form_goals_for",
        "away_form_goals_against",
        "away_form_win_rate",
        "home_team_id",
        "away_team_id",
    ]

    return pd.DataFrame([row], columns=feature_cols)
