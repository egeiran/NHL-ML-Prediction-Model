#!/usr/bin/env python3
"""
Lekkasjefri sammenligning av modellvarianter på game.csv.

Kronologisk splitt: trener på sesongene t.o.m. 2016/17 og tester på
2017/18–2019/20. Sammenligner:
  - basisrater (samme sannsynlighet for alle kamper)
  - den gamle Random Forest-en (form + lag-id + Elo, 18 features)
  - logistisk regresjon på bare Elo-differansen
  - logistisk regresjon på Elo-differanse + back-to-back (produksjonsmodellen)

Rapporterer log loss, multiklasse Brier og accuracy, kalibrering per utfall,
og hvor mye produksjonsmodellen slår basisratene tidlig i sesongen (grunnlaget
for NHL_MIN_GAMES_PLAYED i bet_tracker).

Bruker bare game.csv, så tallene er reproduserbare uten nettverk.
Kjøres frittstående:  python evaluate_elo.py
"""
from __future__ import annotations

from typing import Dict, Sequence

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss

from utils.data_loader import load_and_prepare_games
from utils.elo import EloConfig, compute_elo_history
from utils.feature_engineering import (
    DEFAULT_WINDOWS,
    add_multiwindow_form,
    build_team_long_df,
    get_feature_columns,
    make_game_feature_frame,
)
from utils.game_history import build_feature_history, historical_frame
from utils.model_utils import train_outcome_model, train_random_forest

CLASSES = [0, 1, 2]  # home win, OT/SO, away win
LAST_TRAIN_SEASON = 20162017
FIRST_TRAIN_SEASON = 20052006  # samme vindu som train_model.py


def multiclass_brier(y_true: Sequence[int], proba: np.ndarray) -> float:
    """Gjennomsnittlig multiklasse Brier-score (lavere er bedre)."""
    onehot = np.eye(3)[np.asarray(y_true)]
    return float(np.mean(np.sum((proba - onehot) ** 2, axis=1)))


def _aligned_proba(model, X: pd.DataFrame) -> np.ndarray:
    """Sannsynligheter ordnet etter CLASSES uansett modellens klasserekkefølge."""
    proba = model.predict_proba(X)
    col = {c: i for i, c in enumerate(model.classes_)}
    return np.column_stack([proba[:, col[c]] for c in CLASSES])


def _metrics(y: Sequence[int], proba: np.ndarray) -> Dict[str, float]:
    return {
        "log_loss": log_loss(y, proba, labels=CLASSES),
        "brier": multiclass_brier(y, proba),
        "accuracy": accuracy_score(y, proba.argmax(axis=1)),
    }


def legacy_random_forest(test_ids: set) -> pd.DataFrame:
    """Den gamle skogen, trent på samme sesonger, med sannsynligheter per game_id."""
    games, _, _ = load_and_prepare_games("data/game.csv", "data/team_info.csv")
    long_df = add_multiwindow_form(build_team_long_df(games), windows=DEFAULT_WINDOWS)
    elo_df, _ = compute_elo_history(games, EloConfig())
    X, y, merged, _ = make_game_feature_frame(
        games, long_df, windows=DEFAULT_WINDOWS, elo_df=elo_df
    )
    season = merged["season"].astype(int)
    train = season <= LAST_TRAIN_SEASON
    test = merged["game_id"].isin(test_ids)
    model = train_random_forest(X[train], y[train])
    proba = _aligned_proba(model, X[test])
    return pd.DataFrame(proba, columns=CLASSES).assign(game_id=merged.loc[test, "game_id"].to_numpy())


def games_played_in_season(frame: pd.DataFrame) -> pd.Series:
    """Minste antall grunnseriekamper de to lagene har spilt i sesongen før kampen."""
    rows = pd.concat(
        [
            frame[["game_id", "season", "date", "home_team"]].rename(columns={"home_team": "team"}),
            frame[["game_id", "season", "date", "away_team"]].rename(columns={"away_team": "team"}),
        ]
    ).sort_values(["team", "date", "game_id"])
    rows["gp"] = rows.groupby(["team", "season"]).cumcount()
    return rows.groupby("game_id")["gp"].min()


def main() -> None:
    print("Building point-in-time features from game.csv...")
    frame, _, _ = build_feature_history(historical_frame(), EloConfig())
    frame = frame[frame["season"] >= FIRST_TRAIN_SEASON].reset_index(drop=True)
    train = frame[frame["season"] <= LAST_TRAIN_SEASON]
    test = frame[frame["season"] > LAST_TRAIN_SEASON].reset_index(drop=True)
    y_test = test["outcome_code"].to_numpy()
    print(f"Train: {len(train)} games ({FIRST_TRAIN_SEASON}–{LAST_TRAIN_SEASON}), test: {len(test)}")

    base = np.bincount(train["outcome_code"], minlength=3) / len(train)
    results = {"Basisrater": np.tile(base, (len(test), 1))}

    print("Training legacy Random Forest (form + team_id + Elo)...")
    rf = legacy_random_forest(set(test["game_id"]))
    rf = test[["game_id"]].merge(rf, on="game_id", how="left")
    results["Random Forest (gammel)"] = rf[CLASSES].to_numpy()

    for name, cols in (
        ("Logistisk, elo_diff", ["elo_diff"]),
        ("Logistisk, elo_diff + b2b (prod)", get_feature_columns()),
    ):
        model = train_outcome_model(train[cols], train["outcome_code"])
        results[name] = _aligned_proba(model, test[cols])

    print(f"\n{'Modell':34s} {'Log loss':>9s} {'Brier':>7s} {'Acc':>6s} {'|pH-pA|':>8s}")
    for name, proba in results.items():
        m = _metrics(y_test, proba)
        spread = np.abs(proba[:, 0] - proba[:, 2]).mean()
        print(f"{name:34s} {m['log_loss']:9.4f} {m['brier']:7.4f} {m['accuracy']:6.3f} {spread:8.3f}")

    prod = results["Logistisk, elo_diff + b2b (prod)"]
    print("\nKalibrering, produksjonsmodellen (snitt predikert vs faktisk):")
    for c, label in zip(CLASSES, ("Hjemmeseier", "OT/SO", "Borteseier")):
        print(f"  {label:12s} {prod[:, c].mean():.3f} vs {(y_test == c).mean():.3f}")

    print("\nTidlig i sesongen (min. kamper spilt av de to lagene):")
    gp = test["game_id"].map(games_played_in_season(frame)).to_numpy()
    for lo, hi in ((0, 4), (5, 9), (10, 19), (20, 90)):
        mask = (gp >= lo) & (gp <= hi)
        if not mask.any():
            continue
        gain = log_loss(y_test[mask], results["Basisrater"][mask], labels=CLASSES) - log_loss(
            y_test[mask], prod[mask], labels=CLASSES
        )
        print(f"  {lo:2d}–{hi:2d} kamper: n={int(mask.sum()):4d}  gevinst mot basisrater {gain:+.4f}")

    print("\nDone.")


if __name__ == "__main__":
    main()
