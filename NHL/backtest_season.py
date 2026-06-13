#!/usr/bin/env python3
"""
Walk-forward backtest av den ferdige modellen mot en hel NHL-sesong.

Henter faktiske kampresultater fra NHL-APIet (api-web.nhle.com) for en gitt
sesong, og kjører den FROSNE modellen (trent på 2000-2020) kronologisk:

  - Elo-ratingene lastes fra models/elo_ratings.json (slutt 2020),
    regresseres mot snittet for ny sesong, og rulles deretter framover med
    faktiske resultater gjennom sesongen (slik et Elo-system gjør i produksjon).
  - Form-features bygges punkt-i-tid fra lagets tidligere kamper i sesongen.
  - Prediksjoner scores først fra og med EVAL_START, slik at Elo/form har fått
    en oppvarmingsperiode.

Ingenting i data/game.csv endres. Skriptet er ment å kjøres i GitHub Actions
der NHL-APIet er tilgjengelig (lokalt blokkerer ofte egress det).

Konfig via miljøvariabler:
  NHL_BACKTEST_SEASON   (default "20252026")
  NHL_BACKTEST_EVAL_START (default "2026-01-01")
  NHL_BACKTEST_INCLUDE_PLAYOFFS ("1" for å ta med sluttspill, default av)
"""
from __future__ import annotations

import json
import os
from collections import defaultdict
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from live.nhl_results import fetch_completed_games
from utils.data_loader import load_team_mappings
from utils.elo import (
    EloConfig,
    build_elo_feature_values,
    load_ratings,
    regress_to_mean,
    update_ratings,
)
from utils.feature_engineering import DEFAULT_WINDOWS as WINDOWS
from utils.feature_engineering import get_feature_columns
from live.form_engine import compute_team_form_from_games
from utils.model_utils import load_model
from utils.team_alias import to_canonical, to_display

SEASON = os.environ.get("NHL_BACKTEST_SEASON", "20252026")
EVAL_START = os.environ.get("NHL_BACKTEST_EVAL_START", "2026-01-01")
INCLUDE_PLAYOFFS = os.environ.get("NHL_BACKTEST_INCLUDE_PLAYOFFS", "0") == "1"

CLASSES = [0, 1, 2]  # home win, OT/SO, away win
LABELS = {0: "Home win", 1: "OT/SO", 2: "Away win"}


def build_feature_row(
    home_c: str,
    away_c: str,
    home_hist: List[Dict],
    away_hist: List[Dict],
    abbr_to_id: Dict[str, int],
    ratings: Dict[str, float],
    elo_config: EloConfig,
) -> Optional[pd.DataFrame]:
    """Bygger samme feature-rad som live-prediksjonen, punkt-i-tid."""
    if home_c not in abbr_to_id or away_c not in abbr_to_id:
        return None

    home_form = compute_team_form_from_games(home_c, home_hist, windows=WINDOWS)
    away_form = compute_team_form_from_games(away_c, away_hist, windows=WINDOWS)

    row: Dict[str, float] = {}
    for w in WINDOWS:
        row[f"home_form_goals_for_w{w}"] = home_form[f"form_goals_for_w{w}"]
        row[f"home_form_goals_against_w{w}"] = home_form[f"form_goals_against_w{w}"]
        row[f"home_form_win_rate_w{w}"] = home_form[f"form_win_rate_w{w}"]
        row[f"away_form_goals_for_w{w}"] = away_form[f"form_goals_for_w{w}"]
        row[f"away_form_goals_against_w{w}"] = away_form[f"form_goals_against_w{w}"]
        row[f"away_form_win_rate_w{w}"] = away_form[f"form_win_rate_w{w}"]
    row["home_team_id"] = abbr_to_id[home_c]
    row["away_team_id"] = abbr_to_id[away_c]
    row.update(build_elo_feature_values(home_c, away_c, ratings, elo_config))

    return pd.DataFrame([row], columns=get_feature_columns(WINDOWS))


def _aligned_proba(model, X: pd.DataFrame) -> np.ndarray:
    proba = model.predict_proba(X)[0]
    col = {c: i for i, c in enumerate(model.classes_)}
    return np.array([proba[col[c]] for c in CLASSES])


def main() -> None:
    print(f"Season: {SEASON} | Eval from: {EVAL_START} | Playoffs: {INCLUDE_PLAYOFFS}")
    print("Loading model + Elo ratings...")
    model = load_model("models/nhl_model.pkl")
    _, abbr_to_id = load_team_mappings("data/team_info.csv")
    ratings, elo_config = load_ratings("models/elo_ratings.json")
    if not ratings:
        print("[WARN] Ingen lagrede Elo-ratings funnet – alle lag starter på base.")
    # Ny sesong: regresser ratingene mot snittet én gang.
    ratings = regress_to_mean(ratings, elo_config)

    print("Fetching season schedule from NHL API...")
    games = fetch_completed_games([SEASON], include_playoffs=INCLUDE_PLAYOFFS)
    print(f"Completed games fetched: {len(games)}")

    team_history: Dict[str, List[Dict]] = defaultdict(list)
    y_true: List[int] = []
    proba_rows: List[np.ndarray] = []
    eval_games: List[Dict] = []
    skipped_unmapped = 0

    for g in games:
        home_c = to_canonical(g["home"])
        away_c = to_canonical(g["away"])
        in_eval = g["date"] >= EVAL_START

        if in_eval:
            X = build_feature_row(
                home_c, away_c,
                list(team_history[home_c]),
                list(team_history[away_c]),
                abbr_to_id, ratings, elo_config,
            )
            if X is None:
                skipped_unmapped += 1
            else:
                proba = _aligned_proba(model, X)
                proba_rows.append(proba)
                y_true.append(g["outcome_code"])
                eval_games.append(g)

        # Oppdater Elo + form-historikk ETTER eventuell prediksjon.
        update_ratings(
            ratings, home_c, away_c, g["home_goals"], g["away_goals"], g["is_ot"], elo_config
        )
        game_record = {
            "home": home_c, "away": away_c,
            "home_goals": g["home_goals"], "away_goals": g["away_goals"],
            "date": g["date"], "id": g["id"],
        }
        team_history[home_c].append(game_record)
        team_history[away_c].append(game_record)

    report_metrics(y_true, proba_rows, eval_games, skipped_unmapped)


def report_metrics(
    y_true: List[int],
    proba_rows: List[np.ndarray],
    eval_games: List[Dict],
    skipped_unmapped: int,
) -> None:
    from sklearn.metrics import (
        accuracy_score, balanced_accuracy_score, f1_score, log_loss, confusion_matrix,
    )

    n = len(y_true)
    print("\n" + "=" * 70)
    print(f"BACKTEST RESULTS — {SEASON} (eval from {EVAL_START})")
    print("=" * 70)
    if n == 0:
        print("Ingen kamper å evaluere (tom respons fra API eller før eval-start).")
        return

    proba = np.vstack(proba_rows)
    preds = np.array([CLASSES[i] for i in proba.argmax(axis=1)])
    yt = np.array(y_true)

    acc = accuracy_score(yt, preds)
    bal = balanced_accuracy_score(yt, preds)
    mf1 = f1_score(yt, preds, average="macro")
    ll = log_loss(yt, proba, labels=CLASSES)

    # Hjemmebane-baseline (gjett alltid hjemmeseier).
    home_base = accuracy_score(yt, np.zeros_like(yt))

    # To-veis "hvem vinner" (ignorer OT-klassen): modellens valg hjemme vs borte.
    model_home = proba[:, 0] >= proba[:, 2]
    actual_home_win = np.array([g["home_goals"] > g["away_goals"] for g in eval_games])
    two_way_acc = accuracy_score(actual_home_win, model_home)

    print(f"Games evaluated:        {n}  (skipped unmapped: {skipped_unmapped})")
    print(f"Accuracy (3-way):       {acc:.3f}")
    print(f"Balanced accuracy:      {bal:.3f}")
    print(f"Macro F1:               {mf1:.3f}")
    print(f"Log loss:               {ll:.3f}")
    print(f"Home-pick baseline acc: {home_base:.3f}")
    print(f"2-way winner accuracy:  {two_way_acc:.3f}  (home vs away, OT ignored)")

    print("\nConfusion matrix (rows=true, cols=pred) [0=Home,1=OT,2=Away]:")
    print(confusion_matrix(yt, preds, labels=CLASSES))

    print("\nPer-class hit rate:")
    for c in CLASSES:
        mask = yt == c
        if mask.sum():
            hit = (preds[mask] == c).mean()
            print(f"  {LABELS[c]:9s} n={int(mask.sum()):4d}  recall={hit:.3f}")

    # Enkel flat-bet simulering MOT modellens eget 'fair odds' gir ingen P&L
    # uten markedsodds, så vi rapporterer kun treffrate her.
    report = {
        "season": SEASON,
        "eval_start": EVAL_START,
        "games_evaluated": n,
        "accuracy": round(acc, 4),
        "balanced_accuracy": round(bal, 4),
        "macro_f1": round(mf1, 4),
        "log_loss": round(ll, 4),
        "home_baseline_accuracy": round(home_base, 4),
        "two_way_winner_accuracy": round(two_way_acc, 4),
    }
    out = os.path.join(os.path.dirname(__file__), "backtest_result.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
