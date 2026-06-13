#!/usr/bin/env python3
"""
Evaluering av Elo-bidraget til prediksjonsmodellen.

Sammenligner to feature-sett på samme data og splitter:
  - baseline: form (rolling) + team_id
  - +elo:     form + team_id + Elo-features

Rapporterer accuracy, balanced accuracy, macro F1, log loss og multiklasse
Brier-score på BÅDE:
  - tilfeldig splitt (samme metodikk som train_model.py, for sammenlignbarhet), og
  - kronologisk splitt (siste 10 % av kampene som test – lekkasjefri og mest
    realistisk for et betting-scenario).

I tillegg rapporteres en ren Elo-sannsynlighetsmodell (uten ML) som referanse.

Kjøres frittstående:  python evaluate_elo.py
"""
from __future__ import annotations

from typing import Dict, List, Sequence

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    log_loss,
)

from utils.data_loader import load_and_prepare_games
from utils.elo import EloConfig, compute_elo_history, expected_home_score
from utils.feature_engineering import (
    DEFAULT_WINDOWS,
    add_multiwindow_form,
    build_team_long_df,
    get_feature_columns,
    make_game_feature_frame,
)
from utils.model_utils import train_random_forest

CLASSES = [0, 1, 2]  # home win, OT/SO, away win
RANDOM_STATE = 42
TEST_FRACTION = 0.10


def multiclass_brier(y_true: Sequence[int], proba: np.ndarray) -> float:
    """Gjennomsnittlig multiklasse Brier-score (lavere er bedre)."""
    onehot = np.zeros_like(proba)
    for i, label in enumerate(y_true):
        onehot[i, CLASSES.index(label)] = 1.0
    return float(np.mean(np.sum((proba - onehot) ** 2, axis=1)))


def _aligned_proba(model, X: pd.DataFrame) -> np.ndarray:
    """Sannsynligheter ordnet etter CLASSES uansett modellens klasserekkefølge."""
    proba = model.predict_proba(X)
    col = {c: i for i, c in enumerate(model.classes_)}
    return np.column_stack([proba[:, col[c]] for c in CLASSES])


def evaluate_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> Dict[str, float]:
    model = train_random_forest(X_train, y_train)
    preds = model.predict(X_test)
    proba = _aligned_proba(model, X_test)
    return {
        "accuracy": accuracy_score(y_test, preds),
        "balanced_accuracy": balanced_accuracy_score(y_test, preds),
        "macro_f1": f1_score(y_test, preds, average="macro"),
        "log_loss": log_loss(y_test, proba, labels=CLASSES),
        "brier": multiclass_brier(list(y_test), proba),
    }


def elo_only_two_way(merged: pd.DataFrame, test_idx: np.ndarray) -> Dict[str, float]:
    """
    Ren Elo-referanse: bruk elo_expected_home som P(hjemmeseier) i en to-veis
    (hjemme vs borte) vurdering, der faktisk vinner avgjøres av mål.
    Gir en følelse av hvor mye signal som ligger i Elo alene.
    """
    test = merged.iloc[test_idx]
    home_won = (test["home_goals"] > test["away_goals"]).astype(int)
    pred_home = (test["elo_expected_home"] >= 0.5).astype(int)
    p = test["elo_expected_home"].clip(1e-6, 1 - 1e-6)
    ll = -np.mean(home_won * np.log(p) + (1 - home_won) * np.log(1 - p))
    return {
        "accuracy": accuracy_score(home_won, pred_home),
        "log_loss": float(ll),
    }


def _format_table(rows: List[Dict[str, object]], headers: List[str]) -> str:
    widths = {h: len(h) for h in headers}
    for r in rows:
        for h in headers:
            widths[h] = max(widths[h], len(str(r[h])))
    line = "| " + " | ".join(h.ljust(widths[h]) for h in headers) + " |"
    sep = "| " + " | ".join("-" * widths[h] for h in headers) + " |"
    body = [
        "| " + " | ".join(str(r[h]).ljust(widths[h]) for h in headers) + " |"
        for r in rows
    ]
    return "\n".join([line, sep] + body)


def _metric_rows(results: Dict[str, Dict[str, float]]) -> List[Dict[str, object]]:
    rows = []
    for name, m in results.items():
        rows.append(
            {
                "Model": name,
                "Accuracy": f"{m['accuracy']:.3f}",
                "Balanced Acc": f"{m['balanced_accuracy']:.3f}",
                "Macro F1": f"{m['macro_f1']:.3f}",
                "Log Loss": f"{m['log_loss']:.3f}",
                "Brier": f"{m['brier']:.3f}",
            }
        )
    return rows


def main() -> None:
    print("Loading and preparing data...")
    games, _, _ = load_and_prepare_games("data/game.csv", "data/team_info.csv")

    print("Building form features...")
    long_df = add_multiwindow_form(build_team_long_df(games), windows=DEFAULT_WINDOWS)

    print("Computing Elo ratings...")
    elo_config = EloConfig()
    elo_df, _ = compute_elo_history(games, elo_config)

    # Bygg merged én gang med Elo, hent begge feature-settene fra samme frame.
    _, y, merged, _ = make_game_feature_frame(
        games, long_df, windows=DEFAULT_WINDOWS, elo_df=elo_df
    )
    merged = merged.reset_index(drop=True)
    y = merged["outcome_code"]

    base_cols = get_feature_columns(DEFAULT_WINDOWS, include_elo=False)
    elo_cols = get_feature_columns(DEFAULT_WINDOWS, include_elo=True)
    X_base = merged[base_cols]
    X_elo = merged[elo_cols]

    n = len(merged)
    print(f"Games: {n}  |  Features baseline: {len(base_cols)}  |  +Elo: {len(elo_cols)}")

    # --- Tilfeldig splitt (samme metodikk som train_model.py) ---
    rng = np.random.RandomState(RANDOM_STATE)
    perm = rng.permutation(n)
    n_test = int(n * TEST_FRACTION)
    rand_test_idx = perm[:n_test]
    rand_train_idx = perm[n_test:]

    # --- Kronologisk splitt (siste 10 % etter dato) ---
    order = merged.sort_values(["date", "game_id"]).index.to_numpy()
    time_train_idx = order[: n - n_test]
    time_test_idx = order[n - n_test :]

    splits = {
        "Random split (10% test)": (rand_train_idx, rand_test_idx),
        "Chronological split (last 10%)": (time_train_idx, time_test_idx),
    }

    for split_name, (train_idx, test_idx) in splits.items():
        print(f"\n{'=' * 70}\n{split_name}\n{'=' * 70}")
        results = {
            "Baseline (form + team_id)": evaluate_model(
                X_base.iloc[train_idx],
                y.iloc[train_idx],
                X_base.iloc[test_idx],
                y.iloc[test_idx],
            ),
            "+ Elo features": evaluate_model(
                X_elo.iloc[train_idx],
                y.iloc[train_idx],
                X_elo.iloc[test_idx],
                y.iloc[test_idx],
            ),
        }
        print(_format_table(_metric_rows(results), [
            "Model", "Accuracy", "Balanced Acc", "Macro F1", "Log Loss", "Brier",
        ]))

        elo_ref = elo_only_two_way(merged, test_idx)
        print(
            f"\nPure-Elo 2-way reference (home vs away): "
            f"accuracy={elo_ref['accuracy']:.3f}, log_loss={elo_ref['log_loss']:.3f}"
        )

    print("\nDone.")


if __name__ == "__main__":
    main()
