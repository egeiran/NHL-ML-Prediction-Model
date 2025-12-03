# nhl/data_loader.py
import pandas as pd


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
    games = pd.read_csv(game_path)
    teams = pd.read_csv(team_path)

    # Lag mapping mellom id <-> forkortelse
    id_to_abbr = dict(zip(teams["team_id"], teams["abbreviation"]))
    abbr_to_id = dict(zip(teams["abbreviation"], teams["team_id"]))

    # Legg til hjemme-/bortelag som forkortelser
    games["home_team"] = games["home_team_id"].map(id_to_abbr)
    games["away_team"] = games["away_team_id"].map(id_to_abbr)

    # Kun grunnseriekamper
    games = games[games["type"] == "R"].copy()

    # Dato i datetime-format
    games["date"] = pd.to_datetime(games["date_time_GMT"])

    # Encode outcome til 0/1/2
    def encode_outcome(o: str) -> int:
        if isinstance(o, str):
            o = o.lower()
            if o.startswith("home win"):
                return 0  # hjemmeseier
            if o.startswith("away win"):
                return 2  # borteseier
        # alt annet (OT/SO/etc.) regner vi som "uavgjort-type" (1)
        return 1

    games["outcome_code"] = games["outcome"].apply(encode_outcome)

    return games, id_to_abbr, abbr_to_id
