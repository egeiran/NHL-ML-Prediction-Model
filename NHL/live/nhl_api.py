# live/nhl_api.py
import requests

BASE = "https://api-web.nhle.com/v1"


def get_json(url):
    r = requests.get(url)
    r.raise_for_status()
    return r.json()

# 1) GET SCOREBOARD
def get_scoreboard(date):
    """
    Returns all games for the given date (YYYY-MM-DD)
    """
    url = f"{BASE}/scoreboard/{date}"
    return get_json(url)


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

    from datetime import datetime, timedelta

    collected = []
    days_back = 0

    while len(collected) < limit and days_back < 60:
        date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        sb = get_scoreboard(date)

        for day in sb.get("gamesByDate", []):
            for game in day.get("games", []):
                away = game["awayTeam"]["abbrev"]
                home = game["homeTeam"]["abbrev"]

                if away == team_abbr or home == team_abbr:
                    if game["gameState"] == "OFF":  # completed game
                        collected.append({
                            "id": game["id"],
                            "date": game["gameDate"],
                            "away": away,
                            "home": home,
                            "away_goals": game["awayTeam"].get("score"),
                            "home_goals": game["homeTeam"].get("score"),
                        })

                        if len(collected) >= limit:
                            break

        days_back += 1

    return collected
