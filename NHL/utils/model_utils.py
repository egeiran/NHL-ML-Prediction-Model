# nhl/model_utils.py
import os
import pickle
from typing import List

from sklearn.ensemble import RandomForestClassifier


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
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(model, f)


def load_model(path: str = "models/nhl_model.pkl"):
    """
    Laster en tidligere trent modell.
    """
    with open(path, "rb") as f:
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
