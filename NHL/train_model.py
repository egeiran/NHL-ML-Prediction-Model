# train_model.py
"""
Trener produksjonsmodellen: multinomisk logistisk regresjon på Elo-differanse
og back-to-back, på grunnseriekamper fra 2005/06 og fram til i dag.

Data: game.csv (2000–2020) skjøtet med ferdigspilte grunnseriekamper fra
NHL-APIet (2020/21 og framover). Elo bygges over hele historikken fra 2000, så
ratingene er innkjørt når treningsvinduet starter. Treningen starter i 2005/06:
før det fantes uavgjort, og OT/SO-klassen betydde noe annet.

Først rapporteres en ærlig kronologisk test – trent på alt før siste komplette
sesong, testet på den. Deretter trenes den endelige modellen på alt og lagres
sammen med ferske Elo-ratings.

Miljøvariabler:
  NHL_TRAIN_SKIP_API=1     bare game.csv (lokal test uten nettverk). Elo-ratingene
                           skrives da ikke, siden de ville stått på 2020.
  NHL_TRAIN_UNTIL_SEASON   siste sesong som tas med, f.eks. 20242025 når
                           2025/26 skal backtestes uten lekkasje.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import numpy as np
from sklearn.metrics import log_loss

from utils.elo import EloConfig, save_ratings
from utils.feature_engineering import get_feature_columns
from utils.game_history import build_feature_history, load_games
from utils.model_utils import (
    get_feature_importances,
    save_model,
    train_outcome_model,
)

FIRST_TRAIN_SEASON = 20052006
# Fem fulle sesonger siden 2020/21 gir ~7 500 kamper. Får vi under dette, er
# APIet nede, og da skal vi ikke stille trene på 2020-data.
MIN_API_GAMES = 1000
LABELS = ["Hjemmeseier", "OT/SO", "Borteseier"]


def chronological_report(frame, feature_cols) -> dict:
    """Trener på alt før siste komplette sesong og tester på den."""
    # En komplett sesong har 1 230–1 312 kamper (868 i koronasesongen). Den
    # pågående sesongen har færre og hoppes over som test.
    counts = frame["season"].value_counts()
    complete = sorted(int(s) for s, n in counts.items() if n >= 800)
    if len(complete) < 2:
        print("For få sesonger til en kronologisk test.")
        return {}
    test_season = complete[-1]
    train = frame[frame["season"] < test_season]
    test = frame[frame["season"] == test_season]

    model = train_outcome_model(train[feature_cols], train["outcome_code"])
    proba = model.predict_proba(test[feature_cols])
    base = np.bincount(train["outcome_code"], minlength=3) / len(train)
    base_proba = np.tile(base, (len(test), 1))

    ll_model = log_loss(test["outcome_code"], proba, labels=[0, 1, 2])
    ll_base = log_loss(test["outcome_code"], base_proba, labels=[0, 1, 2])

    print(f"\n=== Kronologisk test: trent t.o.m. {train['season'].max()}, testet på {test_season} ===")
    print(f"Kamper: {len(train)} trening, {len(test)} test")
    print(f"Log loss modell:     {ll_model:.4f}")
    print(f"Log loss basisrater: {ll_base:.4f}  (gevinst {ll_base - ll_model:+.4f})")
    print("Kalibrering (snitt predikert vs faktisk):")
    y = test["outcome_code"].to_numpy()
    for cls, label in enumerate(LABELS):
        print(f"  {label:12s} {proba[:, cls].mean():.3f} vs {(y == cls).mean():.3f}")
    return {
        "test_season": int(test_season),
        "test_log_loss": round(float(ll_model), 4),
        "test_base_log_loss": round(float(ll_base), 4),
    }


def main() -> int:
    skip_api = os.environ.get("NHL_TRAIN_SKIP_API") == "1"
    until_raw = os.environ.get("NHL_TRAIN_UNTIL_SEASON", "").strip()
    until_season = int(until_raw) if until_raw else None

    print("Loading games (game.csv + NHL API)...")
    try:
        games, n_api = load_games(
            include_api=not skip_api,
            until_season=until_season,
            min_api_games=0 if skip_api else MIN_API_GAMES,
        )
    except RuntimeError as exc:
        print(f"[FEIL] {exc}")
        return 1

    print("Computing Elo + back-to-back (chronological, no leakage)...")
    elo_config = EloConfig()
    frame, ratings, last_season = build_feature_history(games, elo_config)
    frame = frame[frame["season"] >= FIRST_TRAIN_SEASON].reset_index(drop=True)
    feature_cols = get_feature_columns()
    print(
        f"Training rows: {len(frame)} "
        f"({frame['season'].min()}–{frame['season'].max()}), features: {feature_cols}"
    )

    report = chronological_report(frame, feature_cols)

    print("\nTraining final model on all seasons...")
    model = train_outcome_model(
        frame[feature_cols],
        frame["outcome_code"],
        metadata={
            "n_games": int(len(frame)),
            "n_api_games": int(n_api),
            "first_season": int(frame["season"].min()),
            "last_season": int(frame["season"].max()),
            "through": frame["date"].max().strftime("%Y-%m-%d"),
            **report,
        },
    )

    print("\nKoeffisient-størrelse (standardiserte features):")
    for feat, imp in get_feature_importances(model, feature_cols):
        print(f"  {feat:12s} {imp:.3f}")

    print("\nSaving the trained model to 'models/nhl_model.pkl'...")
    save_model(model, "models/nhl_model.pkl")

    if skip_api or until_season is not None:
        print("Elo-ratingene skrives ikke (uten API eller med NHL_TRAIN_UNTIL_SEASON).")
    else:
        through = games["date"].max().strftime("%Y-%m-%d")
        save_ratings(
            ratings,
            elo_config,
            "models/elo_ratings.json",
            metadata={
                "through": through,
                "n_games": int(len(games)),
                "n_api_games": int(n_api),
                "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": "game.csv + api-web.nhle.com (club-schedule-season)",
            },
            last_season=last_season,
        )
        print(f"Saved Elo ratings through {through} to 'models/elo_ratings.json'.")
    print("Training complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
