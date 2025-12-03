# nhl/model_utils.py
import os
import pickle
from pathlib import Path
from typing import List

from sklearn.ensemble import RandomForestClassifier

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


def train_random_forest(X_train, y_train) -> RandomForestClassifier:
    """
    Trener en RandomForest-modell med fornuftige standardparametre.
    """
    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=15,
        random_state=42,
        class_weight="balanced",
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
    sortert synkende.
    """
    importances = model.feature_importances_
    return sorted(
        zip(feature_names, importances), key=lambda x: x[1], reverse=True
    )
