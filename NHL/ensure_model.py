#!/usr/bin/env python3
"""
Sørger for at models/nhl_model.pkl er brukbar før den daglige jobben kjører.

Trener på nytt når modellen mangler, er trent med en annen modellversjon eller
et annet feature-sett, eller er eldre enn NHL_MODEL_MAX_AGE_DAYS (default 7).
Tidligere ble artefaktet gjenbrukt for alltid, så modellen så aldri en eneste
kamp etter at den først ble trent.

Feiler treningen (typisk fordi NHL-APIet er nede), beholdes en eksisterende
modell så lenge den er kompatibel – en uke gammel modell er bedre enn ingen.
Exit-kode 1 bare når det ikke finnes noen brukbar modell.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from utils.feature_engineering import get_feature_columns
from utils.model_utils import (
    MODEL_VERSION,
    load_model,
    model_age_days,
    model_is_current,
)

MODEL_PATH = Path(__file__).resolve().parent / "models" / "nhl_model.pkl"


def _load_current():
    """Modellen hvis den finnes og er kompatibel, ellers None."""
    if not MODEL_PATH.is_file():
        print("Ingen modell funnet.")
        return None
    try:
        model = load_model(str(MODEL_PATH))
    except Exception as exc:  # gammel sklearn-versjon, korrupt fil o.l.
        print(f"Kunne ikke laste modellen: {exc}")
        return None
    if not model_is_current(model, get_feature_columns()):
        print(f"Modellen er ikke {MODEL_VERSION} med dagens feature-sett.")
        return None
    return model


def main() -> int:
    max_age = float(os.environ.get("NHL_MODEL_MAX_AGE_DAYS", "7"))
    model = _load_current()
    age = model_age_days(model) if model is not None else None

    if model is not None and age is not None and age <= max_age:
        print(f"Modellen er {age:.1f} dager gammel ({MODEL_VERSION}) – beholdes.")
        return 0

    print("Trener ny modell...")
    import train_model

    if train_model.main() == 0:
        return 0

    if model is not None:
        age_text = f"{age:.1f} dager gammel" if age is not None else "ukjent alder"
        print(f"[WARN] Treningen feilet – beholder eksisterende modell ({age_text}).")
        return 0
    print("[FEIL] Treningen feilet, og det finnes ingen brukbar modell.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
