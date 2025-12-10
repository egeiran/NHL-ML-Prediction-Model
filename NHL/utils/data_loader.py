# nhl/data_loader.py
import json
import re
from pathlib import Path
from typing import Dict, Tuple

import pandas as pd


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


def _normalize_team_name(name: str) -> str:
    """Enkel normalisering av lagnavn for å matche alias."""
    if not isinstance(name, str):
        return ""
    name = name.lower()
    name = name.replace(".", " ")
    name = name.replace("-", " ")
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def _build_team_alias_map(team_path: str) -> Dict[str, Tuple[str, int]]:
    """
    Lager map: normalisert navn -> (abbr, team_id).
    Inkluderer aliases for navnene som brukes i data.csv og nyere franchise endringer.
    """
    team_path_resolved = _resolve_path(team_path)
    teams = pd.read_csv(team_path_resolved)

    alias_map: Dict[str, Tuple[str, int]] = {}
    for _, row in teams.iterrows():
        abbr = row["abbreviation"]
        team_id = int(row["team_id"])
        full_name = f"{row['shortName']} {row['teamName']}"
        for key in (abbr, row["shortName"], row["teamName"], full_name):
            alias_map[_normalize_team_name(key)] = (abbr, team_id)

    # Manuelle aliaser / franchise-endringer og nye lag som mangler i team_info.csv
    manual = {
        "new york rangers": ("NYR", 3),
        "new york islanders": ("NYI", 2),
        "st louis blues": ("STL", 19),
        "anaheim ducks": ("ANA", 24),
        "mighty ducks of anaheim": ("ANA", 24),
        "phoenix coyotes": ("ARI", 53),  # normaliserer til dagens ARI
        "arizona coyotes": ("ARI", 53),
        "vegas golden knights": ("VGK", 54),
        "seattle kraken": ("SEA", 55),  # ikke i team_info.csv
        "utah hockey club": ("UTA", 56),  # syntetisk id
        "los angeles kings": ("LAK", 26),
        "uta": ("UTA", 56),
    }
    for k, v in manual.items():
        alias_map[_normalize_team_name(k)] = v

    return alias_map


def load_flat_game_csv(
    data_path: str = "data/data.csv",
    team_path: str = "data/team_info.csv",
    start_year: int = 2010,
    include_playoffs: bool = True,
):
    """
    Leser den flate historiske CSV-en (data.csv), normaliserer lag, filtrerer år,
    og koder outcome på samme måte som game.csv-loaderen.

    Returnerer:
      games_df: med kolonner game_id, date, home_team, away_team, *_goals, *_team_id,
                outcome_code, is_playoff, is_ot, elo-friendly felter.
      id_to_abbr / abbr_to_id: mapper for videre bruk.
    """
    data_path_resolved = _resolve_path(data_path)
    alias_map = _build_team_alias_map(team_path)

    games = pd.read_csv(data_path_resolved)
    games["Date"] = pd.to_datetime(games["Date"], errors="coerce")
    games = games.dropna(subset=["Date"])

    # Dropp fremtidige kamper uten mål
    games = games.dropna(subset=["HomeGoals", "AwayGoals"])

    # Filtrer på år for å unngå gammel æra (ties, andre regler)
    games = games[games["Date"].dt.year >= start_year].copy()

    # Playoff-filter
    games["is_playoff"] = games["Type"].str.contains("playoff", case=False, na=False)
    if not include_playoffs:
        games = games[~games["is_playoff"]].copy()

    # OT/SO flagg
    games["is_ot"] = games["Result"].str.contains("ot", case=False, na=False) | games[
        "Result"
    ].str.contains("shootout", case=False, na=False)

    def map_team(name: str) -> Tuple[str, int]:
        key = _normalize_team_name(name)
        if key in alias_map:
            return alias_map[key]
        raise ValueError(f"Fant ikke lagalias for '{name}' (normalisert='{key}')")

    games[["away_team", "away_team_id"]] = games["Away"].apply(
        lambda x: pd.Series(map_team(x))
    )
    games[["home_team", "home_team_id"]] = games["Home"].apply(
        lambda x: pd.Series(map_team(x))
    )

    games["away_goals"] = pd.to_numeric(games["AwayGoals"], errors="coerce").astype(
        int
    )
    games["home_goals"] = pd.to_numeric(games["HomeGoals"], errors="coerce").astype(
        int
    )

    # Encode outcome til 0/1/2 i tråd med load_and_prepare_games
    def encode_outcome(row) -> int:
        if row["is_ot"]:
            return 1
        if row["home_goals"] > row["away_goals"]:
            return 0
        if row["home_goals"] < row["away_goals"]:
            return 2
        return 1  # fall-back på OT-klassen dersom full lik score

    games["outcome_code"] = games.apply(encode_outcome, axis=1)
    games["date"] = games["Date"]

    games = games.sort_values(["date", "Time"]).reset_index(drop=True)
    games["game_id"] = games.index.astype(int)

    # Bygg mappinger fra alias_map (sikrer at også lag som ikke finnes i sample er med)
    abbr_to_id: Dict[str, int] = {}
    for abbr, tid in set(alias_map.values()):
        abbr_to_id[abbr] = tid
    id_to_abbr = {tid: abbr for abbr, tid in abbr_to_id.items()}

    return games, id_to_abbr, abbr_to_id


def load_team_cache_games(
    cache_dir: str = "data/.team_cache", team_path: str = "data/team_info.csv"
) -> pd.DataFrame:
    """
    Leser JSON-cache av nylige kamper (fra live API-cache) og returnerer DataFrame
    med samme kolonner som load_flat_game_csv forventer.
    """
    cache_path = _resolve_path(cache_dir)
    if not cache_path.exists():
        return pd.DataFrame()

    alias_map = _build_team_alias_map(team_path)

    def map_team(name: str) -> Tuple[str, int]:
        key = _normalize_team_name(name)
        if key in alias_map:
            return alias_map[key]
        raise ValueError(f"Fant ikke lagalias for '{name}' (normalisert='{key}')")

    rows = []
    for file in cache_path.glob("*.json"):
        try:
            with open(file, "r") as f:
                data = json.load(f)
        except Exception:
            continue

        for g in data.get("games", []):
            try:
                away_abbr, away_id = map_team(g["away"])
                home_abbr, home_id = map_team(g["home"])
                rows.append(
                    {
                        "game_id": g.get("id"),
                        "date": g.get("date"),
                        "home_team": home_abbr,
                        "away_team": away_abbr,
                        "home_team_id": home_id,
                        "away_team_id": away_id,
                        "home_goals": g.get("home_goals"),
                        "away_goals": g.get("away_goals"),
                        "is_playoff": False,
                        "is_ot": False,  # cache mangler OT-info
                        "source_team": file.stem,
                    }
                )
            except Exception:
                continue

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["home_goals"] = pd.to_numeric(df["home_goals"], errors="coerce")
    df["away_goals"] = pd.to_numeric(df["away_goals"], errors="coerce")
    df = df.dropna(subset=["date", "home_goals", "away_goals", "game_id"])
    df["game_id"] = df["game_id"].astype(int)
    df = df.drop_duplicates(subset=["game_id"], keep="last")

    # Encode outcome_code (ingen OT-info, så bruker standard win/loss)
    def encode_outcome(row) -> int:
        if row["home_goals"] > row["away_goals"]:
            return 0
        if row["home_goals"] < row["away_goals"]:
            return 2
        return 1

    df["outcome_code"] = df.apply(encode_outcome, axis=1)
    return df


def load_flat_game_with_cache(
    data_path: str = "data/data.csv",
    team_path: str = "data/team_info.csv",
    cache_dir: str = "data/.team_cache",
    start_year: int = 2010,
    include_playoffs: bool = True,
):
    """
    Leser data.csv og, hvis tilgjengelig, appender kamper fra cache_dir for fersk sesong.
    """
    games, id_to_abbr, abbr_to_id = load_flat_game_csv(
        data_path=data_path,
        team_path=team_path,
        start_year=start_year,
        include_playoffs=include_playoffs,
    )

    cache_games = load_team_cache_games(cache_dir=cache_dir, team_path=team_path)
    if not cache_games.empty:
        games = (
            pd.concat([games, cache_games], ignore_index=True)
            .drop_duplicates(subset=["game_id"], keep="last")
            .sort_values("date")
        )

    # Utvid mappinger med alle aliaser
    alias_map = _build_team_alias_map(team_path)
    for _, (abbr, tid) in alias_map.items():
        id_to_abbr[tid] = abbr
        abbr_to_id[abbr] = tid

    return games, id_to_abbr, abbr_to_id
