# predict_cache.py
"""
Bruker data.csv + .team_cache til å bygge oppdaterte Elo- og form-features
og beregner sannsynligheter for kamper (pending i bet_history.csv eller manuelt oppgitt).

Eksempel:
    python -m live.predict_cache
    python -m live.predict_cache --match "TOR@MTL"
    python -m live.predict_cache --regular-only --model models/nhl_model_elo.pkl
"""
import argparse
import sys
from pathlib import Path
from typing import List, Tuple

import pandas as pd

# Sørg for at prosjektroten er på sys.path når skriptet kjøres direkte (python live/predict_cache.py)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from utils.inference_utils import ELO_HOME_ADV, build_feature_row, load_context
from utils.model_utils import load_model


def parse_matches(match_args: List[str]) -> List[Tuple[str, str]]:
    """
    Tar inn liste som 'TOR@MTL' eller 'TOR MTL' og returnerer [(away, home), ...].
    """
    matches = []
    for m in match_args:
        if "@" in m:
            away, home = m.split("@", 1)
        else:
            parts = m.split()
            if len(parts) != 2:
                raise ValueError(f"Ugyldig match-format: {m}")
            away, home = parts
        matches.append((away.strip().upper(), home.strip().upper()))
    return matches


def load_pending_bets(path: str) -> List[Tuple[str, str, str]]:
    """Returnerer liste av (start_time, away_abbr, home_abbr) for pending bets."""
    bets = pd.read_csv(path)
    pending = bets[bets["status"] == "pending"]
    res = []
    for _, row in pending.iterrows():
        res.append((row.get("start_time", ""), row["away_abbr"], row["home_abbr"]))
    return res


def main():
    parser = argparse.ArgumentParser(
        description="Predict probabilities using data.csv + .team_cache and Elo."
    )
    parser.add_argument(
        "--model",
        default="models/nhl_model_elo.pkl",
        help="Sti til modell (forventet å støtte Elo-features).",
    )
    parser.add_argument(
        "--bet-history",
        default="data/bet_history.csv",
        help="CSV for pending bets (brukes hvis ingen --match oppgis).",
    )
    parser.add_argument(
        "--match",
        action="append",
        help="Spesifiser kamp som 'TOR@MTL' (kan gjentas).",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=2010,
        help="Første sesongår som tas med fra data.csv",
    )
    parser.add_argument(
        "--regular-only",
        action="store_true",
        help="Ekskluder playoffs fra historikken.",
    )
    args = parser.parse_args()

    # Finn hvilke matcher vi skal predikere
    if args.match:
        matchups = [(None, a, h) for a, h in parse_matches(args.match)]
    else:
        pending = load_pending_bets(args.bet_history)
        if not pending:
            print("Fant ingen pending bets og ingen --match oppgitt.")
            return
        matchups = pending

    print(f"Laster historikk + cache (fra {args.start_year}, playoffs inkludert={not args.regular_only}) ...")
    ctx = load_context(
        start_year=args.start_year,
        include_playoffs=not args.regular_only,
        data_path="data/data.csv",
        team_path="data/team_info.csv",
        cache_dir="data/.team_cache",
    )
    feature_cols = ctx["feature_cols"]

    # Bygg feature-matrise
    feat_rows = []
    meta_rows = []
    for start_time, away, home in matchups:
        feat_rows.append(
            build_feature_row(
                home=home,
                away=away,
                long_df=ctx["long_df"],
                ratings=ctx["ratings"],
                abbr_to_id=ctx["abbr_to_id"],
            )
        )
        meta_rows.append((start_time, away, home))

    X = pd.DataFrame(
        feat_rows,
        columns=feature_cols + ["elo_prob_home", "elo_prob_away", "elo_rating_diff"],
    )

    model = load_model(args.model)
    probs = model.predict_proba(X)

    # Print resultater
    for (start_time, away, home), p in zip(meta_rows, probs):
        when = start_time if start_time else "(ingen starttid oppgitt)"
        print(f"{when} {away} @ {home}")
        print(f"  Hjemmeseier: {p[0]:.3f}")
        print(f"  OT/SO:       {p[1]:.3f}")
        print(f"  Borteseier:  {p[2]:.3f}")


if __name__ == "__main__":
    main()
