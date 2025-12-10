# train_model.py
import argparse
import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, log_loss

from utils.feature_engineering import make_game_feature_frame
from utils.inference_utils import load_context
from utils.model_utils import get_feature_importances, save_model, train_random_forest


def multi_brier(y_true, probs):
    """Multi-class Brier score."""
    y_true = np.asarray(y_true, dtype=int)
    num_classes = probs.shape[1]
    one_hot = np.zeros((len(y_true), num_classes))
    one_hot[np.arange(len(y_true)), y_true] = 1.0
    return np.mean((probs - one_hot) ** 2)


def chronological_split(df, test_frac=0.2):
    """Splitt kronologisk for å unngå fremtidslekkasje."""
    df_sorted = df.sort_values("date").reset_index(drop=True)
    split_idx = int(len(df_sorted) * (1 - test_frac))
    train_df = df_sorted.iloc[:split_idx]
    test_df = df_sorted.iloc[split_idx:]
    return train_df, test_df


def main():
    parser = argparse.ArgumentParser(
        description="Train Elo-augmented model on data.csv + cache with chronological split."
    )
    parser.add_argument("--start-year", type=int, default=2010, help="Første år som tas med")
    parser.add_argument(
        "--regular-only",
        action="store_true",
        help="Ekskluder playoffs (default inkluderer playoffs)",
    )
    parser.add_argument(
        "--test-frac",
        type=float,
        default=0.2,
        help="Andel test-sett for eval (kronologisk).",
    )
    parser.add_argument(
        "--model-path",
        default="models/nhl_model_elo.pkl",
        help="Filsti for å lagre modellen.",
    )
    args = parser.parse_args()

    print(f"Laster data.csv + cache (fra {args.start_year}, playoffs inkludert={not args.regular_only}) ...")
    ctx = load_context(
        start_year=args.start_year,
        include_playoffs=not args.regular_only,
        data_path="data/data.csv",
        team_path="data/team_info.csv",
        cache_dir="data/.team_cache",
    )

    games = ctx["games"]

    # Bygg form-features på game-level
    _, _, merged, feature_cols = make_game_feature_frame(games, ctx["long_df"])
    elo_cols = ["elo_prob_home", "elo_prob_away", "elo_rating_diff"]

    train_df, test_df = chronological_split(merged, test_frac=args.test_frac)

    print(f"Train size: {len(train_df)}, Test size: {len(test_df)}")

    model = train_random_forest(
        train_df[feature_cols + elo_cols], train_df["outcome_code"]
    )

    preds = model.predict(test_df[feature_cols + elo_cols])
    probs = model.predict_proba(test_df[feature_cols + elo_cols])

    acc = accuracy_score(test_df["outcome_code"], preds)
    bal_acc = balanced_accuracy_score(test_df["outcome_code"], preds)
    macro_f1 = f1_score(test_df["outcome_code"], preds, average="macro")
    ll = log_loss(test_df["outcome_code"], probs)
    brier = multi_brier(test_df["outcome_code"].values, probs)

    print("\n=== Evaluating Model (chronological split) ===")
    print(f"Accuracy:           {acc:.3f}")
    print(f"Balanced Accuracy:  {bal_acc:.3f}")
    print(f"Macro F1:           {macro_f1:.3f}")
    print(f"Log loss:           {ll:.3f}")
    print(f"Brier:              {brier:.3f}")

    print("\nTop feature importances:")
    for feat, imp in get_feature_importances(model, feature_cols + elo_cols)[:15]:
        print(f"{feat:30s} {imp:.3f}")

    print(f"\nLagrer modellen til '{args.model_path}' ...")
    save_model(model, args.model_path)
    print("Training complete.")


if __name__ == "__main__":
    main()
