#!/usr/bin/env python3
"""
Kalibrerer modellens OT/SO-sannsynlighet mot faktisk frekvens.

Den gamle Random Forest-modellen overvurderte sjansen for OT/SO. Siden
EV = sannsynlighet * odds - 1, ga det "value" som ikke fantes, og uavgjort-bets
var den største tapsposten i bet-historikken.

`utils/value_utils.adjust_three_way_probs` skalerer draw-proben med
NHL_DRAW_PROB_MULT (default 1.0, altså ingen justering) og renormaliserer.
Dette scriptet sjekker hvilken multiplikator som kalibrerer produksjonsmodellen,
målt på en kronologisk splitt (trener på tidlige sesonger, evaluerer på de
siste) slik at tallene er lekkasjefrie. Bruker bare game.csv, ikke nettverk.

Kjøres fra NHL-mappa: `python calibrate_draw.py`
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss

from utils.elo import EloConfig
from utils.feature_engineering import get_feature_columns
from utils.game_history import build_feature_history, historical_frame
from utils.model_utils import train_outcome_model
from utils.value_utils import _DRAW_PROB_MULTIPLIER, adjust_three_way_probs

# Samme treningsvindu som train_model.py.
FIRST_TRAIN_SEASON = 20052006

DRAW_CLASS = 1
# Kandidatmultiplikatorer å søke over.
MULTIPLIERS = np.round(np.arange(0.40, 1.31, 0.05), 2)


def chronological_split(merged: pd.DataFrame, X: pd.DataFrame, y: pd.Series, test_frac=0.2):
    """Deler på dato: eldste kamper til trening, nyeste til test."""
    order = merged["date"].argsort(kind="stable")
    X, y = X.iloc[order], y.iloc[order]
    cut = int(len(X) * (1 - test_frac))
    return X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:]


def apply_multiplier(probs: np.ndarray, multiplier: float) -> np.ndarray:
    """Kjører modellens sannsynligheter gjennom produksjonsjusteringen."""
    adjusted = [
        adjust_three_way_probs(p[0], p[1], p[2], draw_multiplier=multiplier)
        for p in probs
    ]
    return np.array(adjusted)


def summarise(name: str, probs: np.ndarray, y_true: np.ndarray) -> dict:
    draw_actual = (y_true == DRAW_CLASS).astype(int)
    draw_pred = probs[:, DRAW_CLASS]
    return {
        "variant": name,
        "snitt_pred_OT": draw_pred.mean(),
        "faktisk_OT": draw_actual.mean(),
        "bias": draw_pred.mean() / draw_actual.mean(),
        "brier_OT": brier_score_loss(draw_actual, draw_pred),
        "log_loss": log_loss(y_true, probs, labels=[0, 1, 2]),
    }


def main() -> int:
    print("Laster data ...")
    frame, _, _ = build_feature_history(historical_frame(), EloConfig())
    merged = frame[frame["season"] >= FIRST_TRAIN_SEASON].reset_index(drop=True)
    X = merged[get_feature_columns()]
    y = merged["outcome_code"]

    X_train, X_test, y_train, y_test = chronological_split(merged, X, y)
    print(f"Trener på {len(X_train)} kamper, tester på {len(X_test)} (kronologisk splitt)")

    model = train_outcome_model(X_train, y_train)
    raw = model.predict_proba(X_test)
    y_true = y_test.to_numpy()

    print("\n=== Rå modell vs. faktisk OT/SO-frekvens ===")
    base = summarise("rå modell", raw, y_true)
    print(
        f"Modellen anslår i snitt {base['snitt_pred_OT']*100:.1f}% OT/SO, "
        f"faktisk {base['faktisk_OT']*100:.1f}% "
        f"(overvurdering: {base['bias']:.2f}x)"
    )

    print("\n=== Søk etter multiplikator ===")
    print(f"{'mult':>5} {'snitt pred':>11} {'bias':>6} {'Brier(OT)':>10} {'log loss':>9}")
    rows = []
    for m in MULTIPLIERS:
        row = summarise(f"mult={m}", apply_multiplier(raw, m), y_true)
        rows.append((m, row))
        print(
            f"{m:5.2f} {row['snitt_pred_OT']*100:10.1f}% {row['bias']:6.2f} "
            f"{row['brier_OT']:10.4f} {row['log_loss']:9.4f}"
        )

    best_bias = min(rows, key=lambda r: abs(r[1]["bias"] - 1.0))
    best_brier = min(rows, key=lambda r: r[1]["brier_OT"])
    best_ll = min(rows, key=lambda r: r[1]["log_loss"])

    print("\n=== Anbefaling ===")
    print(f"Best kalibrert frekvens (bias ~ 1.0): NHL_DRAW_PROB_MULT={best_bias[0]}")
    print(f"Best Brier-score for OT/SO:           NHL_DRAW_PROB_MULT={best_brier[0]}")
    print(f"Best log loss (alle utfall):          NHL_DRAW_PROB_MULT={best_ll[0]}")

    # Hva multiplikatoren betyr for bet-seleksjonen: en EV-terskel på 0.15 med
    # odds rundt 3.9 krever ~29.5% modell-prob. Vis hvor mange test-kamper som
    # ville passert terskelen før og etter.
    print("\n=== Effekt på bet-seleksjon (odds 3.90, EV-terskel 0.15) ===")
    threshold = 1.15 / 3.90
    for label, probs in ((f"i dag ({_DRAW_PROB_MULTIPLIER})", apply_multiplier(raw, _DRAW_PROB_MULTIPLIER)),
                         (f"anbefalt ({best_bias[0]})", apply_multiplier(raw, best_bias[0]))):
        picks = probs[:, DRAW_CLASS] >= threshold
        if not picks.any():
            print(f"{label:18}     0 kamper over terskel")
            continue
        hit = (y_true[picks] == DRAW_CLASS).mean()
        roi = (hit * 3.90 - 1) * 100
        print(
            f"{label:18} {picks.sum():5} kamper over terskel "
            f"({picks.mean()*100:4.1f}%), treffrate {hit*100:4.1f}% -> ROI {roi:+6.1f}%"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
