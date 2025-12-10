from typing import Dict, List, Sequence, Tuple

import pandas as pd

from utils.data_loader import load_flat_game_with_cache
from utils.elo import add_elo_ratings
from utils.feature_engineering import (
    DEFAULT_WINDOWS,
    add_multiwindow_form,
    build_team_long_df,
    get_feature_columns,
    get_latest_team_form,
)

# Standard Elo-parametre brukt i trening/inferens
ELO_HOME_ADV = 25.0
ELO_PARAMS = dict(
    k_base=20.0,
    home_adv=ELO_HOME_ADV,
    mov_scale=0.5,
    playoff_mult=1.25,
    regression=0.8,
    season_start_month=9,
)
BASE_RATING = 1500.0


def load_context(
    start_year: int = 2010,
    include_playoffs: bool = True,
    data_path: str = "data/data.csv",
    team_path: str = "data/team_info.csv",
    cache_dir: str = "data/.team_cache",
):
    """
    Leser historiske kamper + .team_cache, beregner Elo-ratinger og form-features.
    Returnerer dict med games, long_df, ratings, mappinger, feature_cols.
    """
    games, id_to_abbr, abbr_to_id = load_flat_game_with_cache(
        data_path=data_path,
        team_path=team_path,
        cache_dir=cache_dir,
        start_year=start_year,
        include_playoffs=include_playoffs,
    )

    games, ratings = add_elo_ratings(games, **ELO_PARAMS)

    long_df = build_team_long_df(games)
    long_df = add_multiwindow_form(long_df, windows=DEFAULT_WINDOWS)
    feature_cols = get_feature_columns(DEFAULT_WINDOWS)

    return {
        "games": games,
        "long_df": long_df,
        "ratings": ratings,
        "feature_cols": feature_cols,
        "id_to_abbr": id_to_abbr,
        "abbr_to_id": abbr_to_id,
    }


def build_feature_row(
    home: str,
    away: str,
    long_df: pd.DataFrame,
    ratings: Dict[str, float],
    abbr_to_id: Dict[str, int],
    windows: Sequence[int] = DEFAULT_WINDOWS,
    home_adv: float = ELO_HOME_ADV,
) -> Dict[str, float]:
    """Lager feature-row for en matchup basert på siste form + Elo-ratinger."""
    home_form = get_latest_team_form(long_df, home, windows=windows)
    away_form = get_latest_team_form(long_df, away, windows=windows)

    feat: Dict[str, float] = {}
    for w in windows:
        feat[f"home_form_goals_for_w{w}"] = home_form[f"form_goals_for_w{w}"]
        feat[f"home_form_goals_against_w{w}"] = home_form[f"form_goals_against_w{w}"]
        feat[f"home_form_win_rate_w{w}"] = home_form[f"form_win_rate_w{w}"]
        feat[f"away_form_goals_for_w{w}"] = away_form[f"form_goals_for_w{w}"]
        feat[f"away_form_goals_against_w{w}"] = away_form[f"form_goals_against_w{w}"]
        feat[f"away_form_win_rate_w{w}"] = away_form[f"form_win_rate_w{w}"]

    feat["home_team_id"] = abbr_to_id.get(home, -1)
    feat["away_team_id"] = abbr_to_id.get(away, -1)

    home_r = ratings.get(home, BASE_RATING)
    away_r = ratings.get(away, BASE_RATING)
    exp_home = 1.0 / (1.0 + 10 ** (-(home_r + home_adv - away_r) / 400))
    feat["elo_prob_home"] = exp_home
    feat["elo_prob_away"] = 1 - exp_home
    feat["elo_rating_diff"] = home_r - away_r
    return feat


def get_recent_games_from_df(
    games_df: pd.DataFrame, team_abbr: str, limit: int = 5
) -> List[Dict]:
    """
    Henter siste 'limit' kamper for et lag fra games_df og returnerer liste av dict.
    """
    subset = games_df[
        (games_df["home_team"] == team_abbr) | (games_df["away_team"] == team_abbr)
    ].sort_values("date", ascending=False)

    rows = []
    for _, g in subset.head(limit).iterrows():
        rows.append(
            {
                "id": g.get("game_id"),
                "date": g.get("date"),
                "home": g["home_team"],
                "away": g["away_team"],
                "home_goals": int(g["home_goals"]),
                "away_goals": int(g["away_goals"]),
            }
        )
    return rows
