import pandas as pd
from typing import Iterable, List, Sequence

DEFAULT_WINDOWS: Sequence[int] = (5, 20)


def build_team_long_df(games: pd.DataFrame) -> pd.DataFrame:
    """
    Lager en 'long' dataframe: én rad per (kamp, lag).
    Kolonner:
      - game_id
      - team
      - is_home (1/0)
      - goals_for
      - goals_against
      - win (bool/int)
      - date
    """
    rows = []
    for _, row in games.iterrows():
        game_id = row["game_id"]

        # Hjemmelag
        rows.append(
            {
                "game_id": game_id,
                "team": row["home_team"],
                "is_home": 1,
                "goals_for": row["home_goals"],
                "goals_against": row["away_goals"],
                "win": int(row["home_goals"] > row["away_goals"]),
                "date": row["date"],
            }
        )

        # Bortelag
        rows.append(
            {
                "game_id": game_id,
                "team": row["away_team"],
                "is_home": 0,
                "goals_for": row["away_goals"],
                "goals_against": row["home_goals"],
                "win": int(row["away_goals"] > row["home_goals"]),
                "date": row["date"],
            }
        )

    long_df = pd.DataFrame(rows)
    long_df.sort_values(["team", "date"], inplace=True)
    return long_df


def _fill_form_na(long_df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    """Fyller NaN i form-kolonner med nøytrale verdier."""
    for col in columns:
        if "win_rate" in col:
            long_df[col] = long_df[col].fillna(0.5)
        else:
            long_df[col] = long_df[col].fillna(0.0)
    return long_df


def add_multiwindow_form(
    long_df: pd.DataFrame, windows: Sequence[int] = DEFAULT_WINDOWS
) -> pd.DataFrame:
    """
    Legger på rolling form-statistikk per lag for flere vinduer, uten lekkasje.
    Nye kolonner per vindu:
      - form_goals_for_w{n}
      - form_goals_against_w{n}
      - form_win_rate_w{n}

    Merk: vi shifter én kamp for å unngå å bruke nåværende kamp i feature-settet.
    """
    long_df = long_df.sort_values(["team", "date"]).copy()
    grouped = long_df.groupby("team", group_keys=False)
    form_cols = []

    for w in windows:
        goals_for = (
            grouped["goals_for"]
            .shift(1)
            .rolling(w, min_periods=1)
            .mean()
            .reset_index(level=0, drop=True)
        )
        goals_against = (
            grouped["goals_against"]
            .shift(1)
            .rolling(w, min_periods=1)
            .mean()
            .reset_index(level=0, drop=True)
        )
        win_rate = (
            grouped["win"]
            .shift(1)
            .rolling(w, min_periods=1)
            .mean()
            .reset_index(level=0, drop=True)
        )

        gf_col = f"form_goals_for_w{w}"
        ga_col = f"form_goals_against_w{w}"
        wr_col = f"form_win_rate_w{w}"

        long_df[gf_col] = goals_for
        long_df[ga_col] = goals_against
        long_df[wr_col] = win_rate

        form_cols.extend([gf_col, ga_col, wr_col])

    long_df = _fill_form_na(long_df, form_cols)
    return long_df


def add_rolling_form(long_df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    """
    Beholder bakoverkompatibilitet – bruk heller add_multiwindow_form.
    """
    return add_multiwindow_form(long_df, windows=(window,))


def _rename_form_cols(df: pd.DataFrame, prefix: str, windows: Sequence[int]):
    cols = {}
    for w in windows:
        cols[f"form_goals_for_w{w}"] = f"{prefix}_form_goals_for_w{w}"
        cols[f"form_goals_against_w{w}"] = f"{prefix}_form_goals_against_w{w}"
        cols[f"form_win_rate_w{w}"] = f"{prefix}_form_win_rate_w{w}"
    return df.rename(columns=cols)


def get_feature_columns(windows: Sequence[int] = DEFAULT_WINDOWS) -> List[str]:
    """Feature-kolonneorden delt mellom trening og prediksjon."""
    feature_cols: List[str] = []
    for prefix in ("home", "away"):
        for metric in ("form_goals_for", "form_goals_against", "form_win_rate"):
            for w in windows:
                feature_cols.append(f"{prefix}_{metric}_w{w}")
    feature_cols.extend(["home_team_id", "away_team_id"])
    return feature_cols


def make_game_feature_frame(
    games: pd.DataFrame, long_df_with_form: pd.DataFrame, windows: Sequence[int] = DEFAULT_WINDOWS
):
    """
    Lager game-level featurer ved å ta form-statistikk for home/away
    og merge tilbake til games.
    Returnerer:
      - X: feature-matrise
      - y: labels (outcome_code)
      - merged: full merged df (nyttig til analyser)
      - feature_cols: liste over feature-kolonnene i X
    """
    # Hjemmelag-features
    home_features = long_df_with_form[long_df_with_form["is_home"] == 1][
        ["game_id"]
        + [f"form_goals_for_w{w}" for w in windows]
        + [f"form_goals_against_w{w}" for w in windows]
        + [f"form_win_rate_w{w}" for w in windows]
    ]
    home_features = _rename_form_cols(home_features, "home", windows)

    # Bortelag-features
    away_features = long_df_with_form[long_df_with_form["is_home"] == 0][
        ["game_id"]
        + [f"form_goals_for_w{w}" for w in windows]
        + [f"form_goals_against_w{w}" for w in windows]
        + [f"form_win_rate_w{w}" for w in windows]
    ]
    away_features = _rename_form_cols(away_features, "away", windows)

    merged = games.merge(home_features, on="game_id").merge(
        away_features, on="game_id"
    )

    feature_cols = get_feature_columns(windows)

    X = merged[feature_cols]
    y = merged["outcome_code"]

    return X, y, merged, feature_cols


def get_latest_team_form(
    long_df_with_form: pd.DataFrame,
    team_abbr: str,
    windows: Sequence[int] = DEFAULT_WINDOWS,
) -> dict:
    """
    Henter 'siste form' for et lag basert på rolling-kolonnene.
    Brukes i predict.py så vi bruker nøyaktig samme logikk som i trening.
    """
    t = long_df_with_form[long_df_with_form["team"] == team_abbr]

    if t.empty:
        empty_form = {}
        for w in windows:
            empty_form[f"form_goals_for_w{w}"] = 0.0
            empty_form[f"form_goals_against_w{w}"] = 0.0
            empty_form[f"form_win_rate_w{w}"] = 0.5
        return empty_form

    last_row = t.sort_values("date").iloc[-1]

    result = {}
    for w in windows:
        result[f"form_goals_for_w{w}"] = last_row[f"form_goals_for_w{w}"]
        result[f"form_goals_against_w{w}"] = last_row[f"form_goals_against_w{w}"]
        result[f"form_win_rate_w{w}"] = last_row[f"form_win_rate_w{w}"]

    return result
