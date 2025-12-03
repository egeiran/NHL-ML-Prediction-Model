import requests
import pandas as pd
from datetime import datetime, timedelta

NT_BASE = "https://api.norsk-tipping.no/OddsenGameInfo/v1/api/events/HKY"
TEAM_CSV_PATH = "data/team_info.csv"


def load_team_map():
    """Lager mapping fra NT sine lagnavn → NHL-abbreviation."""
    df = pd.read_csv(TEAM_CSV_PATH)
    mapping = {}

    # Lag gjerne fullnavn slik NT bruker dem:
    for _, row in df.iterrows():
        # Eksempel: "New York Rangers"
        full_name = f"{row['shortName']} {row['teamName']}"
        mapping[full_name] = row["abbreviation"]

    return mapping


TEAM_MAP = load_team_map()


def get_hockey_events():
    """Returnerer ALLE hockeyevents (NHL + andre ligaer) fra Norsk Tipping."""
    r = requests.get(NT_BASE)
    if r.status_code != 200:
        raise RuntimeError(f"NT API error: {r.status_code}")

    return r.json()["eventList"]


def get_nhl_matches(days_ahead=0):
    """
    Returnerer NHL-kamper som spilles today + days_ahead.
    Standard = i dag.
    """

    target_date = (datetime.now() + timedelta(days=days_ahead)).date()

    events = get_hockey_events()
    nhl_games = []

    for ev in events:
        # vi skal kun ha NHL
        if ev["tournament"]["name"] != "USA - NHL":
            continue

        # konverter startTime → dato
        start_time = datetime.fromisoformat(ev["startTime"].replace("Z", "+00:00"))
        if start_time.date() != target_date:
            continue

        # odds-marked (1X2)
        if "mainMarket" not in ev:
            continue  # kamp mangler odds

        market = ev["mainMarket"]
        selections = market.get("selections", [])

        odds = {s["selectionValue"]: float(s["selectionOdds"]) for s in selections}

        home = ev["homeParticipant"]
        away = ev["awayParticipant"]

        game_info = {
            "eventId": ev["eventId"],
            "startTime": ev["startTime"],
            "home": home,
            "away": away,
            "home_abbr": TEAM_MAP.get(home),
            "away_abbr": TEAM_MAP.get(away),
            "odds_home": odds.get("H"),
            "odds_draw": odds.get("D"),
            "odds_away": odds.get("A"),
        }

        nhl_games.append(game_info)

    return nhl_games


def get_nhl_matches_range(days=3):
    """Returnerer NHL-kamper for de neste `days` dagene."""
    all_games = []
    for d in range(days + 1):
        all_games.extend(get_nhl_matches(days_ahead=d))
    return all_games


if __name__ == "__main__":
    from pprint import pprint

    print("=== NHL matches today ===")
    pprint(get_nhl_matches())

    print("\n=== NHL matches next 3 days ===")
    pprint(get_nhl_matches_range(3))
