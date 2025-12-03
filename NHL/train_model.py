# train_model.py
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    classification_report,
)

from nhl.data_loader import load_and_prepare_games
from nhl.feature_engineering import (
    build_team_long_df,
    add_rolling_form,
    make_game_feature_frame,
)
from nhl.model_utils import train_random_forest, save_model, get_feature_importances


def main():
    print("Loading and preparing data...")
    games, id_to_abbr, abbr_to_id = load_and_prepare_games(
        "data/game.csv", "data/team_info.csv"
    )

    print("Building long team-level dataframe...")
    long_df = build_team_long_df(games)
    long_df = add_rolling_form(long_df, window=5)

    print("Creating game-level features...")
    X, y, merged, feature_cols = make_game_feature_frame(games, long_df)

    print("Splitting into train and test...")
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    print("Training Random Forest model...")
    model = train_random_forest(X_train, y_train)

    print("\n=== Evaluating Model ===")
    preds = model.predict(X_test)
    acc = accuracy_score(y_test, preds)
    print(f"Accuracy: {acc:.3f}\n")

    print("Confusion Matrix:")
    print(confusion_matrix(y_test, preds))
    print("\nClassification Report:")
    print(classification_report(y_test, preds))

    print("\nTop feature importances:")
    for feat, imp in get_feature_importances(model, feature_cols):
        print(f"{feat:30s} {imp:.3f}")

    print("\nSaving the trained model to 'models/nhl_model.pkl'...")
    save_model(model, "models/nhl_model.pkl")
    print("Training complete.")


if __name__ == "__main__":
    main()
