# live/nhl_results.py
"""
Henter ferdigspilte NHL-kamper fra api-web.nhle.com for hele sesonger.

Brukes både av sesong-backtesten og av Elo-oppdateringen for å holde
ratingene à jour mellom treninger. Returnerer kamper i et normalisert
format som matcher feltene vi trenger til Elo (samme semantikk som
game.csv-radene).
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

from live.nhl_api import BASE, get_json

# De 32 nåværende NHL-lagene (API-forkortelser).
CURRENT_TEAMS = [
    "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ", "DAL", "DET",
    "EDM", "FLA", "LAK", "MIN", "MTL", "NSH", "NJD", "NYI", "NYR", "OTT",
    "PHI", "PIT", "SJS", "SEA", "STL", "TBL", "TOR", "UTA", "VAN", "VGK",
    "WSH", "WPG",
]


def normalize_game(g: Dict) -> Optional[Dict]:
    """Plukker ut feltene vi trenger fra et rått API-kampobjekt, eller None."""
    state = str(g.get("gameState", "")).upper()
    if state not in {"OFF", "FINAL"}:
        return None  # ikke ferdigspilt

    home = g.get("homeTeam", {})
    away = g.get("awayTeam", {})
    home_abbr = home.get("abbrev")
    away_abbr = away.get("abbrev")
    home_goals = home.get("score")
    away_goals = away.get("score")
    if not home_abbr or not away_abbr or home_goals is None or away_goals is None:
        return None

    last_period = str(g.get("gameOutcome", {}).get("lastPeriodType", "REG")).upper()
    is_ot = last_period in {"OT", "SO"}
    if is_ot:
        outcome_code = 1
    else:
        outcome_code = 0 if home_goals > away_goals else 2

    return {
        "id": g.get("id"),
        "date": g.get("gameDate"),
        "season": g.get("season"),
        "game_type": g.get("gameType"),
        "home": home_abbr,
        "away": away_abbr,
        "home_goals": int(home_goals),
        "away_goals": int(away_goals),
        "is_ot": is_ot,
        "outcome_code": outcome_code,
    }


def fetch_club_schedule(team: str, season: str) -> List[Dict]:
    """Rå kampliste for ett lag i én sesong (tom liste ved feil)."""
    url = f"{BASE}/club-schedule-season/{team}/{season}"
    try:
        data = get_json(url)
    except Exception as exc:
        print(f"  [WARN] {team} {season}: {exc}")
        return []
    return data.get("games", [])


def fetch_completed_games(
    seasons: List[str],
    include_playoffs: bool = False,
    pause: float = 0.12,
    verbose: bool = True,
) -> List[Dict]:
    """
    Henter alle ferdigspilte kamper for gitte sesonger, deduplisert på game id
    og sortert kronologisk (eldst først).
    """
    allowed_types = {2, 3} if include_playoffs else {2}
    by_id: Dict[int, Dict] = {}

    for season in seasons:
        season_count = 0
        for team in CURRENT_TEAMS:
            for raw in fetch_club_schedule(team, season):
                gid = raw.get("id")
                if gid is None or gid in by_id:
                    continue
                ng = normalize_game(raw)
                if ng and ng.get("game_type") in allowed_types:
                    by_id[gid] = ng
                    season_count += 1
            time.sleep(pause)
        if verbose:
            print(f"  season {season}: {season_count} completed games")

    games = list(by_id.values())
    games.sort(key=lambda g: (g["date"], g["id"]))
    return games
