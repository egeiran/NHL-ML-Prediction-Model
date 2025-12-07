import requests
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

NT_BASE_ALL = "https://api.norsk-tipping.no/OddsenGameInfo/v1/api/events/HKY"
NT_BASE_RANGE = "https://api.norsk-tipping.no/OddsenGameInfo/v1/api/events/HKY"  # bruke HKY + params, daterange feiler uten /HKY
BASE_DIR = Path(__file__).resolve().parent.parent
TEAM_CSV_PATH = BASE_DIR / "data" / "team_info.csv"
HTTP_TIMEOUT = 5


def _normalize(name: str) -> str:
    return "".join(ch for ch in name.upper() if ch.isalnum())


def load_team_map():
    """Lager mapping fra NT sine lagnavn → NHL-abbreviation med flere varianter."""
    df = pd.read_csv(TEAM_CSV_PATH)
    mapping = {}
    manual_alias = {
        "UTAHMAMMOTH": "ARI",  # nytt navn, bruker ARI-data inntil videre
        "UTAH": "ARI",
        "UTA": "ARI",
        "NEWYORKISLANDERS": "NYI",  # NT bruker ofte fulle bynavn
        "NEWYORKRANGERS": "NYR",
    }

    for _, row in df.iterrows():
        abbr = row["abbreviation"]
        short = str(row["shortName"])
        team = str(row["teamName"])

        variants = {
            short,
            team,
            f"{short} {team}",
            abbr,
        }

        for v in variants:
            mapping[_normalize(v)] = abbr

    # Legg inn manuelle alias som ikke finnes i team_info.csv
    mapping.update(manual_alias)

    return mapping


TEAM_MAP = load_team_map()


def _map_team(ev: dict, participant_key: str, short_key: str):
    """Returner visningsnavn og abbreviation for et lag fra NT-event."""

    def _lookup(value: str):
        norm = _normalize(value)
        return TEAM_MAP.get(norm)

    name = ev.get(participant_key)
    short_name = ev.get(short_key)

    abbr = None
    for candidate in (name, short_name):
        if candidate:
            abbr = _lookup(candidate)
            if abbr:
                break

    # Noen ganger bruker NT bare «New York» i shortName. Se eventName for å disambiguere.
    if not abbr:
        event_name = ev.get("eventName", "").upper()
        if "NEW YORK" in event_name:
            if "ISLANDERS" in event_name:
                abbr = "NYI"
            elif "RANGERS" in event_name:
                abbr = "NYR"

    display_name = name or short_name
    return display_name, abbr


def _fetch_events_range(days: int):
    """
    Bruker NT sitt daterange-endepunkt slik at vi får hele intervallet.
    Fra-dato settes til 00:00, til-dato til 23:59 som NT krever.
    """
    today = datetime.utcnow().date()
    end_date = today + timedelta(days=days)
    params = {
        "eventType": "HKY",
        "fromDateTime": f"{today:%Y-%m-%d}T0000",
        "toDateTime": f"{end_date:%Y-%m-%d}T2359",
    }
    r = requests.get(NT_BASE_RANGE, params=params, timeout=HTTP_TIMEOUT)
    if r.status_code != 200:
        raise RuntimeError(f"NT range API error: {r.status_code} {r.text}")
    return r.json().get("eventList", [])


def get_hockey_events(days: int):
    """
    Returnerer hockey-events for intervallet [i dag, i dag + days].
    Faller tilbake til gamle /events/HKY hvis daterange feiler.
    """
    events = _fetch_events_range(days)
    if events:
        return events

    # Fallback til gamle all-in-one endepunkt
    r = requests.get(NT_BASE_ALL, timeout=HTTP_TIMEOUT)
    if r.status_code != 200:
        raise RuntimeError(f"NT API error (fallback): {r.status_code}")
    return r.json().get("eventList", [])


def _parse_start_time(start: str):
    if not start:
        return None
    try:
        return datetime.fromisoformat(start.replace("Z", "+00:00"))
    except Exception:
        return None


def get_nhl_matches_range(days=3):
    """
    Returnerer NHL-kamper fra Norsk Tipping for intervallet [i dag, i dag + days].
    Bruker én fetch og filtrerer på dato i startTime.
    """
    events = get_hockey_events(days)
    today = datetime.utcnow().date()
    max_date = today + timedelta(days=days)

    nhl_games = []

    for ev in events:
        # vi skal kun ha NHL
        tournament_name = ev.get("tournament", {}).get("name", "")
        if "NHL" not in tournament_name.upper():
            continue

        start_time = _parse_start_time(ev.get("startTime"))
        if not start_time:
            continue

        start_date = start_time.date()
        if start_date < today or start_date > max_date:
            continue

        market = ev.get("mainMarket", {}) or {}
        selections = market.get("selections", []) or []

        # Odds kan mangle (ikke prissatt ennå). Vi lar dem stå som None.
        odds = {}
        for s in selections:
            try:
                odds[s["selectionValue"]] = float(s["selectionOdds"])
            except Exception:
                continue

        home, home_abbr = _map_team(ev, "homeParticipant", "homeParticipantShortName")
        away, away_abbr = _map_team(ev, "awayParticipant", "awayParticipantShortName")

        game_info = {
            "eventId": ev.get("eventId"),
            "startTime": ev.get("startTime"),
            "home": home,
            "away": away,
            "home_abbr": home_abbr,
            "away_abbr": away_abbr,
            "odds_home": odds.get("H"),
            "odds_draw": odds.get("D"),
            "odds_away": odds.get("A"),
        }

        nhl_games.append(game_info)

    return nhl_games


def get_nhl_matches(days_ahead=0):
    """
    Bakoverkompatibel: returnerer kamper for én dato (i dag + days_ahead).
    """
    today = datetime.utcnow().date()
    target_date = today + timedelta(days=days_ahead)
    return [
        g for g in get_nhl_matches_range(days_ahead)
        if _parse_start_time(g.get("startTime")) and _parse_start_time(g.get("startTime")).date() == target_date
    ]


if __name__ == "__main__":
    from pprint import pprint

    print("=== NHL matches today ===")
    pprint(get_nhl_matches())

    print("\n=== NHL matches next 3 days ===")
    pprint(get_nhl_matches_range(3))
