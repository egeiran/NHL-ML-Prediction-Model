# live/nhl_api.py
import time
from datetime import datetime
import requests

BASE = "https://api-web.nhle.com/v1"

# Enkle caches for å redusere antall kall og unngå 429-rate limits
_scoreboard_cache = {}
_recent_games_cache = {}
RETRY_PAUSE = 0.4
MAX_RETRIES = 3
HTTP_TIMEOUT = 5


def _parse_dt(date_str: str):
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def get_json(url):
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(url, timeout=HTTP_TIMEOUT)
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


# 3) SESONGPROGRAM FOR ETT LAG
_club_schedule_cache = {}
REGULAR_SEASON = 2


def _season_id(day) -> int:
    """NHL-sesong (20262027) for en dato. Ny sesong regnes fra juli."""
    start = day.year if day.month >= 7 else day.year - 1
    return int(f"{start}{start + 1}")


def get_club_schedule(team_abbr, season):
    """
    Hele sesongprogrammet for ett lag (alle kamptyper, spilte og kommende).
    Caches per prosess: daglig kjøring og eksport spør om de samme lagene.
    """
    key = (str(team_abbr).upper(), str(season))
    if key not in _club_schedule_cache:
        url = f"{BASE}/club-schedule-season/{key[0]}/{key[1]}"
        _club_schedule_cache[key] = get_json(url).get("games", []) or []
    return list(_club_schedule_cache[key])


def _game_date(game):
    return game.get("gameDate") or game.get("startTimeUTC")


def _is_regular_season(game) -> bool:
    try:
        return int(game.get("gameType")) == REGULAR_SEASON
    except (TypeError, ValueError):
        return False


def _is_completed(game) -> bool:
    if str(game.get("gameState", "")).upper() not in {"OFF", "FINAL"}:
        return False
    return (
        game.get("homeTeam", {}).get("score") is not None
        and game.get("awayTeam", {}).get("score") is not None
    )


# 4) GET LAST GAMES FOR A TEAM
def get_team_recent_games(team_abbr, limit=5, before=None):
    """
    Lagets siste `limit` ferdigspilte grunnseriekamper, nyeste først.

    Bare grunnserien teller, og vinduet ruller inn i forrige sesong når årets
    ikke har nok kamper – akkurat slik form-featurene ble bygget under
    trening. Tidligere ble kampene hentet fra scoreboardet dag for dag, uten
    filter på kamptype og bare 120 dager tilbake. I sesongstarten besto formen
    da nesten bare av preseason-kamper (ofte med farmerlag-tropper), som
    modellen aldri hadde sett.

    `before` (YYYY-MM-DD) tar bare med kamper spilt før den datoen, slik at
    formen kan rekonstrueres punkt-i-tid.
    """
    cache_key = (team_abbr, limit, before)
    if cache_key in _recent_games_cache:
        return list(_recent_games_cache[cache_key])

    reference = (
        datetime.strptime(before[:10], "%Y-%m-%d") if before else datetime.utcnow()
    )
    season = _season_id(reference)

    collected = []
    seen = set()
    error = None
    # Inneværende sesong og én tilbake er nok til 20 kamper for alle lag.
    for season_offset in range(2):
        start_year = int(str(season)[:4]) - season_offset
        try:
            schedule = get_club_schedule(team_abbr, f"{start_year}{start_year + 1}")
        except Exception as exc:
            # Om sommeren finnes ikke neste sesongs program ennå. Da holder
            # fjorårets – men feiler begge, er det APIet som er nede.
            error = error or exc
            continue
        for game in schedule:
            if not _is_regular_season(game) or not _is_completed(game):
                continue
            date = _game_date(game)
            if before and (not date or date[:10] >= before[:10]):
                continue
            key = game.get("id") or f"{date}"
            if key in seen:
                continue
            seen.add(key)
            collected.append(
                {
                    "id": game.get("id"),
                    "date": date,
                    "away": game.get("awayTeam", {}).get("abbrev"),
                    "home": game.get("homeTeam", {}).get("abbrev"),
                    "away_goals": game.get("awayTeam", {}).get("score"),
                    "home_goals": game.get("homeTeam", {}).get("score"),
                }
            )
        if len(collected) >= limit:
            break

    if not collected and error is not None:
        raise error

    collected = sorted(
        collected,
        key=lambda x: _parse_dt(x.get("date")) or x.get("date"),
        reverse=True,
    )[:limit]
    _recent_games_cache[cache_key] = list(collected)
    return collected


def regular_season_games_played(team_abbr, game_date) -> int:
    """
    Antall ferdigspilte grunnseriekamper laget har i sesongen `game_date`
    hører til, før den datoen.
    """
    day = datetime.strptime(str(game_date)[:10], "%Y-%m-%d")
    season = _season_id(day)
    count = 0
    for game in get_club_schedule(team_abbr, season):
        date = _game_date(game)
        if _is_regular_season(game) and _is_completed(game) and date and date[:10] < str(game_date)[:10]:
            count += 1
    return count


def plays_on(team_abbr, game_date) -> bool:
    """
    Om laget har en grunnseriekamp (spilt eller kommende) på `game_date`
    (nordamerikansk lokal dato, YYYY-MM-DD). Brukes til back-to-back-featuren.
    """
    day = datetime.strptime(str(game_date)[:10], "%Y-%m-%d")
    for game in get_club_schedule(team_abbr, _season_id(day)):
        date = _game_date(game)
        if _is_regular_season(game) and date and date[:10] == str(game_date)[:10]:
            return True
    return False
