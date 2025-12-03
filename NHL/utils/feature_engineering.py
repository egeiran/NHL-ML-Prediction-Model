# nhl/feature_engineering.py
import pandas as pd


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


def add_rolling_form(long_df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    """
    Legger på rolling form-statistikk per lag.
      - form_goals_for
      - form_goals_against
      - form_win_rate
    """
    # Groupby team og kjør rolling innenfor hvert lag
    grouped = long_df.groupby("team", group_keys=False)

    long_df["form_goals_for"] = (
        grouped["goals_for"]
        .rolling(window, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    long_df["form_goals_against"] = (
        grouped["goals_against"]
        .rolling(window, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    long_df["form_win_rate"] = (
        grouped["win"]
        .rolling(window, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )

    return long_df


def make_game_feature_frame(
    games: pd.DataFrame, long_df_with_form: pd.DataFrame
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
        ["game_id", "form_goals_for", "form_goals_against", "form_win_rate"]
    ].rename(
        columns={
            "form_goals_for": "home_form_goals_for",
            "form_goals_against": "home_form_goals_against",
            "form_win_rate": "home_form_win_rate",
        }
    )

    # Bortelag-features
    away_features = long_df_with_form[long_df_with_form["is_home"] == 0][
        ["game_id", "form_goals_for", "form_goals_against", "form_win_rate"]
    ].rename(
        columns={
            "form_goals_for": "away_form_goals_for",
            "form_goals_against": "away_form_goals_against",
            "form_win_rate": "away_form_win_rate",
        }
    )

    # Merge inn på games
    merged = games.merge(home_features, on="game_id").merge(
        away_features, on="game_id"
    )

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

    X = merged[feature_cols]
    y = merged["outcome_code"]

    return X, y, merged, feature_cols


def get_latest_team_form(
    long_df_with_form: pd.DataFrame, team_abbr: str
) -> dict:
    """
    Henter 'siste form' for et lag basert på rolling-kolonnene.
    Brukes i predict.py så vi bruker nøyaktig samme logikk som i trening.
    """
    t = long_df_with_form[long_df_with_form["team"] == team_abbr]

    if t.empty:
        # Ingen kamper? Returner noe nøytralt
        return {
            "form_goals_for": 0.0,
            "form_goals_against": 0.0,
            "form_win_rate": 0.5,
        }

    t_sorted = t.sort_values("date")
    last_row = t_sorted.iloc[-1]

    return {
        "form_goals_for": last_row["form_goals_for"],
        "form_goals_against": last_row["form_goals_against"],
        "form_win_rate": last_row["form_win_rate"],
    }
