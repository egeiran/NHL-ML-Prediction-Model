# nhl/model_utils.py
import os
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# Bumpes når modelltype eller feature-sett endres. Et lagret artefakt med en
# annen versjon er inkompatibelt og trenes på nytt (se ensure_model.py).
MODEL_VERSION = "logreg-elo-b2b-v1"

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"


def _resolve_model_path(path: str) -> Path:
    """
    Returnerer en absolutt sti til modellfilen.
    Prøver først gitt sti, deretter BASE_DIR/models/<filnavn>.
    """
    p = Path(path)
    if p.is_file():
        return p
    fallback = MODELS_DIR / p.name
    if fallback.is_file():
        return fallback
    return p


def train_outcome_model(X_train, y_train, metadata: Optional[Dict[str, Any]] = None) -> Pipeline:
    """
    Multinomisk logistisk regresjon på standardiserte features.

    Erstatter Random Forest-en. På kronologisk test (trent t.o.m. 2016/17,
    testet på 2017–2020) slo én Elo-variabel i logistisk regresjon skogen
    tydelig på log loss (1,052 mot 1,064), og sannsynlighetene er kalibrerte
    uten justering. Skogen var overkonfident i halene – nettopp der
    value-spillene plukkes fra.
    """
    model = Pipeline(
        [
            ("scale", StandardScaler()),
            ("logreg", LogisticRegression(max_iter=2000)),
        ]
    )
    model.fit(X_train, y_train)
    model.nhl_meta_ = {
        "version": MODEL_VERSION,
        "feature_columns": list(X_train.columns),
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        **(metadata or {}),
    }
    return model


def model_metadata(model) -> Dict[str, Any]:
    """Metadata lagret på modellen ved trening, eller tom dict for eldre artefakter."""
    return dict(getattr(model, "nhl_meta_", {}) or {})


def model_is_current(model, feature_columns: List[str]) -> bool:
    """Om et lagret artefakt er trent med dagens modellversjon og feature-sett."""
    meta = model_metadata(model)
    return (
        meta.get("version") == MODEL_VERSION
        and list(meta.get("feature_columns") or []) == list(feature_columns)
    )


def model_age_days(model) -> Optional[float]:
    """Dager siden modellen ble trent, eller None hvis det ikke er kjent."""
    trained_at = model_metadata(model).get("trained_at")
    if not trained_at:
        return None
    try:
        then = datetime.strptime(trained_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - then).total_seconds() / 86400


def train_random_forest(X_train, y_train) -> RandomForestClassifier:
    """
    Den gamle Random Forest-modellen (form + lag-id + Elo). Brukes ikke i
    produksjon lenger, bare til sammenligning i evaluate_elo.py.
    """
    model = RandomForestClassifier(
        n_estimators=500,
        max_depth=18,
        min_samples_leaf=2,
        max_features="sqrt",
        random_state=42,
        class_weight={0: 1.0, 1: 0.95, 2: 1.0},  # juster for ubalanserte klasser
        n_jobs=-1,  # bruk alle CPU-kjerner
    )
    model.fit(X_train, y_train)
    return model


def save_model(model, path: str = "models/nhl_model.pkl") -> None:
    """
    Lagrer modellen til disk med pickle.
    """
    resolved = _resolve_model_path(path)
    os.makedirs(resolved.parent, exist_ok=True)
    with open(resolved, "wb") as f:
        pickle.dump(model, f)


def load_model(path: str = "models/nhl_model.pkl"):
    """
    Laster en tidligere trent modell.
    """
    resolved = _resolve_model_path(path)
    with open(resolved, "rb") as f:
        return pickle.load(f)


def get_feature_importances(model, feature_names: List[str]):
    """
    Returnerer feature importance som liste av (feature, importance),
    sortert synkende. For logistisk regresjon: største absolutte koeffisient
    over klassene, på standardiserte features.
    """
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    else:
        coef = model.named_steps["logreg"].coef_
        importances = abs(coef).max(axis=0)
    return sorted(
        zip(feature_names, importances), key=lambda x: x[1], reverse=True
    )
