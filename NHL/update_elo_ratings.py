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

import pandas as pd

from utils.elo import EloConfig, compute_elo_state, save_ratings
from utils.game_history import (
    GAME_COLUMNS,
    api_frame,
    combine,
    historical_frame,
    seasons_to_fetch,
)

# Fem fulle sesonger siden 2020/21 gir ~7 500 kamper. Under dette er APIet nede
# eller svarer bare delvis.
MIN_API_GAMES = 1000


def main() -> None:
    config = EloConfig()
    print("Seeding Elo from historical game.csv (2000-2020)...")
    hist = historical_frame()
    print(f"  historical games: {len(hist)}")

    if os.environ.get("NHL_ELO_SKIP_API") == "1":
        api = pd.DataFrame(columns=GAME_COLUMNS)
        print("Skipping NHL API fetch (NHL_ELO_SKIP_API=1).")
    else:
        seasons = seasons_to_fetch()
        print(f"Fetching completed games from NHL API for seasons: {seasons}")
        api = api_frame(seasons)
        print(f"  API games fetched: {len(api)}")
        if len(api) < MIN_API_GAMES:
            # fetch_completed_games svelger feil per lag. Er APIet nede, kommer
            # det tilbake tomt – og da ville vi skrevet 2020-ratings over de
            # ferske. Bedre å feile og la workflowen beholde forrige fil.
            raise SystemExit(
                f"Fikk bare {len(api)} kamper fra NHL-APIet (krever {MIN_API_GAMES}). "
                "Beholder eksisterende ratings."
            )

    combined = combine(hist, api)

    _, ratings, last_season = compute_elo_state(combined, config)
    through = pd.to_datetime(combined["date"]).max()
    through_str = through.strftime("%Y-%m-%d") if pd.notna(through) else "unknown"

    meta = {
        "through": through_str,
        "n_games": int(len(combined)),
        "n_api_games": int(len(api)),
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "game.csv + api-web.nhle.com (club-schedule-season)",
    }
    save_ratings(
        ratings, config, "models/elo_ratings.json", metadata=meta, last_season=last_season
    )

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
