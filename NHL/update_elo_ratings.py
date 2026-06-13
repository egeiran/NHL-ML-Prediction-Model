#!/usr/bin/env python3
"""
Holder Elo-ratingene à jour mellom treninger.

Bakgrunn: models/elo_ratings.json genereres under trening fra data/game.csv,
men den dataen stopper i 2020. For at Elo skal være "kjent" når vi ser på nye
kamper, ruller vi ratingene framover med faktiske resultater fra NHL-APIet
(samme API vi allerede bruker). game.csv endres ikke.

Slik gjøres det:
  1. Seed fra game.csv (2000-2020) -> gir franchise-historikk og riktig skala.
  2. Hent alle ferdigspilte kamper fra og med sesongen 2020/21 til i dag fra
     api-web.nhle.com.
  3. Kjør hele tidslinjen kronologisk gjennom Elo-motoren (med sesongregresjon).
  4. Lagre oppdaterte ratings til models/elo_ratings.json.

Det finnes ikke noe stabilt tredjeparts-API for *vår* Elo, så dette er den
riktige måten: vi vedlikeholder den selv fra kampresultatene.

Idempotent: kan kjøres så ofte man vil (f.eks. daglig i GitHub Actions).

Miljøvariabler:
  NHL_ELO_START_SEASON   første API-sesong å hente (default "20202021")
  NHL_ELO_SEASONS        eksplisitt komma-liste, overstyrer start/auto
  NHL_ELO_SKIP_API       "1" -> hopp over API (kun historikk, for lokal test)
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List

import pandas as pd

from live.nhl_results import fetch_completed_games
from utils.data_loader import load_and_prepare_games
from utils.elo import EloConfig, compute_elo_history, save_ratings
from utils.team_alias import to_canonical

ELO_COLUMNS = [
    "game_id", "date", "season", "home_team", "away_team",
    "home_goals", "away_goals", "outcome_code",
]


def current_season_id(today: datetime) -> str:
    """NHL-sesong-id (YYYYYYYY). Ny sesong regnes fra juli."""
    year = today.year
    start = year if today.month >= 7 else year - 1
    return f"{start}{start + 1}"


def seasons_to_fetch() -> List[str]:
    explicit = os.environ.get("NHL_ELO_SEASONS")
    if explicit:
        return [s.strip() for s in explicit.split(",") if s.strip()]

    start = os.environ.get("NHL_ELO_START_SEASON", "20202021")
    start_year = int(start[:4])
    end_year = int(current_season_id(datetime.now(timezone.utc))[:4])
    return [f"{y}{y + 1}" for y in range(start_year, end_year + 1)]


def historical_frame() -> pd.DataFrame:
    """game.csv som Elo-klar frame (datoer normalisert til tz-naive)."""
    games, _, _ = load_and_prepare_games("data/game.csv", "data/team_info.csv")
    df = games[ELO_COLUMNS].copy()
    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    return df


def api_frame(seasons: List[str]) -> pd.DataFrame:
    """Ferdigspilte API-kamper som Elo-klar frame. Tom frame ved feil/ingen."""
    rows = fetch_completed_games(seasons, include_playoffs=False)
    if not rows:
        return pd.DataFrame(columns=ELO_COLUMNS)

    records = []
    for g in rows:
        records.append(
            {
                "game_id": g["id"],
                "date": pd.to_datetime(g["date"]),
                "season": int(g["season"]),
                # Kanoniser så franchise-historikk videreføres (UTA -> ARI osv.).
                "home_team": to_canonical(g["home"]),
                "away_team": to_canonical(g["away"]),
                "home_goals": g["home_goals"],
                "away_goals": g["away_goals"],
                "outcome_code": g["outcome_code"],
            }
        )
    return pd.DataFrame.from_records(records, columns=ELO_COLUMNS)


def main() -> None:
    config = EloConfig()
    print("Seeding Elo from historical game.csv (2000-2020)...")
    hist = historical_frame()
    print(f"  historical games: {len(hist)}")

    if os.environ.get("NHL_ELO_SKIP_API") == "1":
        api = pd.DataFrame(columns=ELO_COLUMNS)
        print("Skipping NHL API fetch (NHL_ELO_SKIP_API=1).")
    else:
        seasons = seasons_to_fetch()
        print(f"Fetching completed games from NHL API for seasons: {seasons}")
        api = api_frame(seasons)
        print(f"  API games fetched: {len(api)}")

    combined = pd.concat([hist, api], ignore_index=True)
    combined = combined.dropna(subset=["date"]).sort_values(["date", "game_id"])

    _, ratings = compute_elo_history(combined, config)
    through = pd.to_datetime(combined["date"]).max()
    through_str = through.strftime("%Y-%m-%d") if pd.notna(through) else "unknown"

    meta = {
        "through": through_str,
        "n_games": int(len(combined)),
        "n_api_games": int(len(api)),
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "game.csv + api-web.nhle.com (club-schedule-season)",
    }
    save_ratings(ratings, config, "models/elo_ratings.json", metadata=meta)

    print(f"\nElo ratings updated through {through_str} "
          f"({meta['n_games']} games, {meta['n_api_games']} from API).")
    top = sorted(ratings.items(), key=lambda kv: kv[1], reverse=True)
    print("\nTop 10 teams now:")
    for team, rating in top[:10]:
        print(f"  {team:4s} {rating:7.1f}")
    print("\nBottom 5 teams now:")
    for team, rating in top[-5:]:
        print(f"  {team:4s} {rating:7.1f}")


if __name__ == "__main__":
    main()
