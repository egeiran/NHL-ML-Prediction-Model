# live/nhl_api.py
import time
from datetime import datetime
import requests

BASE = "https://api-web.nhle.com/v1"

# Enkle caches for å redusere antall kall og unngå 429-rate limits
_scoreboard_cache = {}
_recent_games_cache = {}
MAX_DAYS_BACK = 200  # begrenser hvor langt tilbake vi søker
RETRY_PAUSE = 0.4
MAX_RETRIES = 3


def _parse_dt(date_str: str):
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def get_json(url):
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(url)
            if r.status_code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_PAUSE * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_PAUSE * (attempt + 1))
                continue
            raise last_exc

# 1) GET SCOREBOARD
def get_scoreboard(date):
    """
    Returns all games for the given date (YYYY-MM-DD)
    """
    if date in _scoreboard_cache:
        return _scoreboard_cache[date]

    url = f"{BASE}/scoreboard/{date}"
    data = get_json(url)
    _scoreboard_cache[date] = data
    return data


# 2) GET GAMECENTER BOXCORE
def get_boxscore(game_id):
    """
    Detailed boxscore data for a game ID
    """
    url = f"{BASE}/gamecenter/{game_id}/boxscore"
    return get_json(url)


def get_play_by_play(game_id):
    """
    Full play-by-play data for a game ID
    """
    url = f"{BASE}/gamecenter/{game_id}/play-by-play"
    return get_json(url)


# 3) GET LAST GAMES FOR A TEAM
def get_team_recent_games(team_abbr, limit=5):
    """
    Collect recent games for a team ID or abbreviation.
    We fetch multiple scoreboard days backwards until we have N games.
    """

    cache_key = (team_abbr, limit)
    if cache_key in _recent_games_cache:
        return list(_recent_games_cache[cache_key])

    from datetime import datetime, timedelta

    collected = []
    seen = set()
    days_back = 0

    while len(collected) < limit and days_back < MAX_DAYS_BACK:
        date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        sb = get_scoreboard(date)

        # Scoreboard-response kan komme i to former: gamesByDate eller games
        if "gamesByDate" in sb and sb["gamesByDate"]:
            day_games = []
            for day in sb["gamesByDate"]:
                day_games.extend(day.get("games", []))
        else:
            day_games = sb.get("games", [])

        for game in day_games:
            away = game.get("awayTeam", {}).get("abbrev")
            home = game.get("homeTeam", {}).get("abbrev")
            if not away or not home:
                continue

            if away != team_abbr and home != team_abbr:
                continue

            game_state = game.get("gameState", "").upper()
            if game_state not in {"OFF", "FINAL"}:
                continue  # ikke ferdigspilt

            key = game.get("id") or f"{home}|{away}|{game.get('gameDate') or game.get('startTimeUTC')}"
            if key in seen:
                continue
            seen.add(key)

            collected.append(
                {
                    "id": game.get("id"),
                    "date": game.get("gameDate") or game.get("startTimeUTC"),
                    "away": away,
                    "home": home,
                    "away_goals": game.get("awayTeam", {}).get("score"),
                    "home_goals": game.get("homeTeam", {}).get("score"),
                }
            )

            if len(collected) >= limit:
                break

        days_back += 1

    collected = sorted(
        collected,
        key=lambda x: _parse_dt(x.get("date")) or x.get("date"),
        reverse=True,
    )
    _recent_games_cache[cache_key] = list(collected)
    return collected
