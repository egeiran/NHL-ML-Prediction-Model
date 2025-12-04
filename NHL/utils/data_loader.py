# nhl/data_loader.py
import pandas as pd
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


def _resolve_path(path: str) -> Path:
    """
    Returnerer en absolutt sti. Prøver først gitt sti, deretter BASE_DIR/data/<filnavn>.
    """
    p = Path(path)
    if p.is_file():
        return p
    fallback = DATA_DIR / p.name
    if fallback.is_file():
        return fallback
    return p


def load_and_prepare_games(
    game_path: str = "data/game.csv",
    team_path: str = "data/team_info.csv",
):
    """
    Leser kampfil + team-info, mapper team_id til forkortelser,
    filtrerer til grunnseriekamper, og lager outcome_code (0/1/2).
    Returnerer:
      - games_df: kampdata med ekstra kolonner
      - id_to_abbr: dict team_id -> 'BOS'
      - abbr_to_id: dict 'BOS' -> team_id
    """
    game_path_resolved = _resolve_path(game_path)
    team_path_resolved = _resolve_path(team_path)

    games = pd.read_csv(game_path_resolved)
    teams = pd.read_csv(team_path_resolved)

    # Lag mapping mellom id <-> forkortelse
    id_to_abbr = dict(zip(teams["team_id"], teams["abbreviation"]))
    abbr_to_id = dict(zip(teams["abbreviation"], teams["team_id"]))

    # Legg til hjemme-/bortelag som forkortelser
    games["home_team"] = games["home_team_id"].map(id_to_abbr)
    games["away_team"] = games["away_team_id"].map(id_to_abbr)

    # Kun grunnseriekamper
    games = games[games["type"] == "R"].copy()
    games = games[~games["outcome"].str.contains("tbc", na=False)].copy()

    # Dato i datetime-format
    games["date"] = pd.to_datetime(games["date_time_GMT"])

    # Encode outcome til 0/1/2
    def encode_outcome(o: str) -> int:
        if not isinstance(o, str):
            return -1
        o = o.lower().strip()
        if not o or "tbc" in o:
            return -1  # kamp ikke spilt/ukjent label
        if "ot" in o or "so" in o:
            return 1  # uavgjort-type for OT/SO
        if o.startswith("home win"):
            return 0  # hjemmeseier
        if o.startswith("away win"):
            return 2  # borteseier
        return -1  # ukjent label droppes senere

    games["outcome_code"] = games["outcome"].apply(encode_outcome)
    games = games[games["outcome_code"] >= 0].copy()

    return games, id_to_abbr, abbr_to_id


def load_team_mappings(team_path: str = "data/team_info.csv"):
    """
    Leser kun team-info for å mappe mellom id og forkortelser.
    """
    team_path_resolved = _resolve_path(team_path)
    teams = pd.read_csv(team_path_resolved)
    id_to_abbr = dict(zip(teams["team_id"], teams["abbreviation"]))
    abbr_to_id = dict(zip(teams["abbreviation"], teams["team_id"]))
    return id_to_abbr, abbr_to_id
