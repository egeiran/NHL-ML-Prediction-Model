from typing import Dict, Tuple

import pandas as pd


def _season_label(dt: pd.Timestamp, season_start_month: int) -> int:
    """
    Lager en enkel sesong-ID (2010 betyr 2010-2011) basert på måned.
    """
    year = dt.year
    return year if dt.month >= season_start_month else year - 1


def add_elo_ratings(
    games: pd.DataFrame,
    k_base: float = 20.0,
    home_adv: float = 25.0,
    mov_scale: float = 0.5,
    playoff_mult: float = 1.25,
    regression: float = 0.8,
    season_start_month: int = 9,
    base_rating: float = 1500.0,
) -> Tuple[pd.DataFrame, Dict[str, float]]:
    """
    Beregner Elo-ratinger kronologisk og legger til pre-game ratinger/prob i games.
    Forventning er 3-klasse label, så vi lagrer bare P(home win) og ratingdiff.

    Kolonner lagt til:
      - elo_home_pre, elo_away_pre
      - elo_prob_home, elo_prob_away
      - elo_rating_diff

    Returnerer (games_med_elo, slutt_ratings).
    """
    games = games.sort_values("date").copy()
    games["season"] = games["date"].apply(
        lambda d: _season_label(pd.to_datetime(d), season_start_month)
    )

    ratings: Dict[str, float] = {}
    elo_home_pre = []
    elo_away_pre = []
    elo_prob_home = []
    elo_prob_away = []

    current_season = None

    for _, row in games.iterrows():
        season = row["season"]
        if current_season is None:
            current_season = season
        elif season != current_season:
            # Regress ratings mot base-rating ved sesongstart for å unngå lang hukommelse
            for team in list(ratings.keys()):
                ratings[team] = base_rating + regression * (
                    ratings[team] - base_rating
                )
            current_season = season

        home = row["home_team"]
        away = row["away_team"]

        home_r = ratings.get(home, base_rating)
        away_r = ratings.get(away, base_rating)

        exp_home = 1.0 / (1.0 + 10 ** (-(home_r + home_adv - away_r) / 400))
        exp_away = 1.0 - exp_home

        elo_home_pre.append(home_r)
        elo_away_pre.append(away_r)
        elo_prob_home.append(exp_home)
        elo_prob_away.append(exp_away)

        goal_diff = abs(row["home_goals"] - row["away_goals"])
        is_ot = bool(row.get("is_ot", False))
        is_playoff = bool(row.get("is_playoff", False))

        # OT-seier justeres til 0.5 for mindre ratingstøy
        score_home = 0.5 if is_ot else (1.0 if row["home_goals"] > row["away_goals"] else 0.0)

        k = k_base * (playoff_mult if is_playoff else 1.0)
        mov_mult = 1.0 + mov_scale * max(goal_diff - 1.0, 0.0)
        mov_mult = min(mov_mult, 3.0)

        delta = k * mov_mult * (score_home - exp_home)
        ratings[home] = home_r + delta
        ratings[away] = away_r - delta

    games["elo_home_pre"] = elo_home_pre
    games["elo_away_pre"] = elo_away_pre
    games["elo_prob_home"] = elo_prob_home
    games["elo_prob_away"] = elo_prob_away
    games["elo_rating_diff"] = games["elo_home_pre"] - games["elo_away_pre"]

    return games, ratings
