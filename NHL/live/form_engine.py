# live/form_engine.py
from datetime import datetime
from typing import Dict, List, Sequence

from live.nhl_api import get_team_recent_games
from utils.feature_engineering import DEFAULT_WINDOWS


def _parse_date(date_str: str):
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def _sort_games_desc(games: List[Dict]) -> List[Dict]:
    """Sorter kamper etter dato (nyeste først)."""
    # Dedup med samme nøkkel som i nhl_api for ekstra sikkerhet
    seen = set()
    unique = []
    for g in games:
        key = g.get("id") or f"{g.get('home')}|{g.get('away')}|{g.get('date')}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(g)

    return sorted(
        unique,
        key=lambda g: _parse_date(g.get("date")) or g.get("date"),
        reverse=True,
    )


def compute_team_form_from_games(
    team_abbr: str,
    games: List[Dict],
    windows: Sequence[int] = DEFAULT_WINDOWS,
) -> Dict[str, float]:
    """
    Beregn form-statistikk for et lag basert på en liste med kamper.
    Games forventes å være sortert nyeste først.
    """
    result: Dict[str, float] = {}
    games = _sort_games_desc(games)

    if not games:
        for w in windows:
            result[f"form_goals_for_w{w}"] = 0.0
            result[f"form_goals_against_w{w}"] = 0.0
            result[f"form_win_rate_w{w}"] = 0.5
        return result

    for w in windows:
        subset = games[:w]
        if not subset:
            continue

        goals_for = []
        goals_against = []
        wins = []

        for g in subset:
            is_home = g["home"] == team_abbr
            gf = g["home_goals"] if is_home else g["away_goals"]
            ga = g["away_goals"] if is_home else g["home_goals"]

            goals_for.append(gf)
            goals_against.append(ga)
            wins.append(1 if gf > ga else 0)

        # Behold full presisjon som i treningspipen (ingen nedrunding)
        result[f"form_goals_for_w{w}"] = sum(goals_for) / len(subset)
        result[f"form_goals_against_w{w}"] = sum(goals_against) / len(subset)
        result[f"form_win_rate_w{w}"] = sum(wins) / len(subset)

    return result


def compute_team_form(
    team_abbr: str, windows: Sequence[int] = DEFAULT_WINDOWS
) -> Dict[str, float]:
    recent = _sort_games_desc(
        get_team_recent_games(team_abbr, limit=max(windows))
    )
    return compute_team_form_from_games(team_abbr, recent, windows=windows)


def format_recent_games(
    team_abbr: str, games: List[Dict], limit: int = 5
) -> List[Dict]:
    """
    Formatterer kampliste til frontend-vennlig struktur.
    games forventes å være sortert nyeste først.
    """
    games = _sort_games_desc(games)
    formatted = []
    for g in reversed(games[:limit]):
        is_home = g["home"] == team_abbr
        gf = g["home_goals"] if is_home else g["away_goals"]
        ga = g["away_goals"] if is_home else g["home_goals"]

        date_str = g.get("date", "")
        dt = _parse_date(date_str)
        formatted_date = dt.strftime("%Y-%m-%d") if dt else date_str[:10]

        formatted.append(
            {
                "date": formatted_date,
                "venue": "H" if is_home else "A",
                "result": "W" if gf > ga else "L",
                "goals_for": int(gf),
                "goals_against": int(ga),
                "score": f"{int(gf)}-{int(ga)}",
            }
        )

    return formatted


def compute_stats_from_games(team_abbr: str, games: List[Dict]) -> Dict[str, float]:
    """Returnerer samme struktur som tidligere home_stats/away_stats."""
    if not games:
        return {
            "goals_for_avg": 0.0,
            "goals_against_avg": 0.0,
            "wins": 0,
            "losses": 0,
            "win_percentage": 0.0,
        }

    goals_for, goals_against, wins = [], [], []
    for g in games:
        is_home = g["home"] == team_abbr
        gf = g["home_goals"] if is_home else g["away_goals"]
        ga = g["away_goals"] if is_home else g["home_goals"]
        goals_for.append(gf)
        goals_against.append(ga)
        wins.append(1 if gf > ga else 0)

    losses = len(wins) - sum(wins)
    win_pct = (sum(wins) / len(wins) * 100) if wins else 0.0

    return {
        "goals_for_avg": round(sum(goals_for) / len(goals_for), 2),
        "goals_against_avg": round(sum(goals_against) / len(goals_against), 2),
        "wins": int(sum(wins)),
        "losses": int(losses),
        "win_percentage": round(win_pct, 1),
    }
