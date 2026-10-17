#!/usr/bin/env python3
"""
Walk-forward backtest av produksjonsmodellen mot en hel NHL-sesong.

Henter faktiske kampresultater fra NHL-APIet (api-web.nhle.com) og bygger
features punkt-i-tid, nøyaktig som i treningen:

  - Elo rulles kamp for kamp gjennom hele historikken (game.csv + APIet), med
    sesongregresjon, så hver kamp får ratingene lagene hadde før den.
  - Back-to-back leses av lagenes egne kampdatoer.
  - Modellen trenes på sesongene FØR backtest-sesongen og testes på den, så
    ingenting fra sesongen lekker inn.
  - Prediksjoner scores først fra og med EVAL_START, slik at Elo har fått en
    oppvarmingsperiode.

Ingenting i data/game.csv endres. Skriptet er ment å kjøres i GitHub Actions
der NHL-APIet er tilgjengelig (lokalt blokkerer ofte egress det).

Konfig via miljøvariabler:
  NHL_BACKTEST_SEASON     (default "20252026")
  NHL_BACKTEST_EVAL_START (default "2026-01-01")
"""
from __future__ import annotations

import json
import os
from typing import Dict, List

import numpy as np
import pandas as pd

from utils.elo import EloConfig
from utils.feature_engineering import get_feature_columns
from utils.game_history import build_feature_history, load_games
from utils.model_utils import train_outcome_model

SEASON = os.environ.get("NHL_BACKTEST_SEASON", "20252026")
EVAL_START = os.environ.get("NHL_BACKTEST_EVAL_START", "2026-01-01")
FIRST_TRAIN_SEASON = 20052006

CLASSES = [0, 1, 2]  # home win, OT/SO, away win
LABELS = {0: "Home win", 1: "OT/SO", 2: "Away win"}


def _aligned_proba(model, X: pd.DataFrame) -> np.ndarray:
    proba = model.predict_proba(X)
    col = {c: i for i, c in enumerate(model.classes_)}
    return np.column_stack([proba[:, col[c]] for c in CLASSES])


def main() -> None:
    season = int(SEASON)
    print(f"Season: {SEASON} | Eval from: {EVAL_START}")
    games, n_api = load_games(include_api=True, until_season=season, min_api_games=1)
    print(f"Games loaded: {len(games)} ({n_api} from API)")

    frame, _, _ = build_feature_history(games, EloConfig())
    cols = get_feature_columns()
    train = frame[(frame["season"] >= FIRST_TRAIN_SEASON) & (frame["season"] < season)]
    test = frame[
        (frame["season"] == season)
        & (frame["local_date"] >= pd.Timestamp(EVAL_START))
    ]
    print(f"Training on {len(train)} games ({train['season'].min()}–{train['season'].max()})")

    model = train_outcome_model(train[cols], train["outcome_code"])
    base = np.bincount(train["outcome_code"], minlength=3) / len(train)

    proba_rows = list(_aligned_proba(model, test[cols])) if len(test) else []
    eval_games: List[Dict] = test[["home_goals", "away_goals"]].to_dict("records")
    report_metrics(list(test["outcome_code"]), proba_rows, eval_games, base)


def report_metrics(
    y_true: List[int],
    proba_rows: List[np.ndarray],
    eval_games: List[Dict],
    base_rates: np.ndarray,
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
    ll_base = log_loss(yt, np.tile(base_rates, (n, 1)), labels=CLASSES)

    # Hjemmebane-baseline (gjett alltid hjemmeseier).
    home_base = accuracy_score(yt, np.zeros_like(yt))

    # To-veis "hvem vinner" (ignorer OT-klassen): modellens valg hjemme vs borte.
    model_home = proba[:, 0] >= proba[:, 2]
    actual_home_win = np.array([g["home_goals"] > g["away_goals"] for g in eval_games])
    two_way_acc = accuracy_score(actual_home_win, model_home)

    print(f"Games evaluated:        {n}")
    print(f"Accuracy (3-way):       {acc:.3f}")
    print(f"Balanced accuracy:      {bal:.3f}")
    print(f"Macro F1:               {mf1:.3f}")
    print(f"Log loss:               {ll:.4f}")
    print(f"Log loss (base rates):  {ll_base:.4f}  (gain {ll_base - ll:+.4f})")
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

    print("\nCalibration (mean predicted vs actual):")
    for c in CLASSES:
        print(f"  {LABELS[c]:9s} {proba[:, c].mean():.3f} vs {(yt == c).mean():.3f}")

    # Uten markedsodds gir en flat-bet-simulering ingen P&L, så vi rapporterer
    # kun treffrate og log loss her.
    report = {
        "season": SEASON,
        "eval_start": EVAL_START,
        "games_evaluated": n,
        "accuracy": round(acc, 4),
        "balanced_accuracy": round(bal, 4),
        "macro_f1": round(mf1, 4),
        "log_loss": round(ll, 4),
        "log_loss_base_rates": round(ll_base, 4),
        "home_baseline_accuracy": round(home_base, 4),
        "two_way_winner_accuracy": round(two_way_acc, 4),
    }
    out = os.path.join(os.path.dirname(__file__), "backtest_result.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
