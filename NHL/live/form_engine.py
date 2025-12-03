# live/form_engine.py
from live.nhl_api import get_team_recent_games, get_boxscore
import pandas as pd

def safe_get(d, path, default=0):
    """
    Utility to safely extract nested fields.
    path: ["a", "b", "c"] means d["a"]["b"]["c"]
    Returns default value if any level is missing.
    """
    cur = d
    for p in path:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return default
    return cur


def compute_team_form(team_abbr, n=5):
    recent = get_team_recent_games(team_abbr, limit=n)

    if not recent:
        return {
            "form_goals_for": 0,
            "form_goals_against": 0,
            "form_goal_diff": 0,
            "form_win_rate": 0,
        }

    gf, ga, wins = [], [], []

    for g in recent:
        game_id = g["id"]
        box = get_boxscore(game_id)

        # Extract home/away blocks (they ALWAYS exist)
        home = box.get("homeTeam", {})
        away = box.get("awayTeam", {})

        # Determine perspective
        is_home = (g["home"] == team_abbr)

        # Goals (always available)
        goals_for = g["home_goals"] if is_home else g["away_goals"]
        goals_against = g["away_goals"] if is_home else g["home_goals"]

        gf.append(goals_for)
        ga.append(goals_against)
        wins.append(1 if goals_for > goals_against else 0)

    return {
        "form_goals_for": round(sum(gf) / len(gf), 2),
        "form_goals_against": round(sum(ga) / len(ga), 2),
        "form_goal_diff": round((sum(gf) - sum(ga)) / len(gf), 2),
        "form_win_rate": round(sum(wins) / len(wins), 2)
    }


print(compute_team_form("BOS"))
print(compute_team_form("TOR"))
print(compute_team_form("VGK"))