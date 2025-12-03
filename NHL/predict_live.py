# predict_live.py
import argparse
from utils.model_utils import load_model
from live.live_feature_builder import build_live_features


MODEL_PATH = "models/nhl_model.pkl"


def predict_live_match(away_abbr: str, home_abbr: str):
    """
    Lager live features for (away @ home), laster modellen og skriver ut sannsynligheter.
    """

    print(f"\n=== Live prediction: {away_abbr} @ {home_abbr} ===")

    # 1) Bygg feature-row basert på live form
    X = build_live_features(away_abbr, home_abbr)
    print("\nInput-features til modellen:")
    print(X)

    # 2) Last modellen
    model = load_model(MODEL_PATH)

    # 3) Prediker sannsynligheter
    probs = model.predict_proba(X)[0]
    classes = model.classes_

    print("\n=== Modellens sannsynligheter ===")
    for cls, p in zip(classes, probs):
        print(f"Klasse {cls}: {p:.3f}")

    # Mest sannsynlige utfall
    best_idx = probs.argmax()
    best_class = classes[best_idx]
    best_prob = probs[best_idx]

    print("\nMest sannsynlige utfall ifølge modellen:")
    print(f"- Klasse {best_class} med sannsynlighet {best_prob:.3f}")

    # Hvis du vet hva klassene betyr, kan du mappe her, f.eks:
    #   0 = borteseier, 1 = OT/SO, 2 = hjemmeseier
    # Da kan du lage noe slikt:
    label_map = {
        0: "Borteseier",
        1: "Overtid / straffer",
        2: "Hjemmeseier",
    }

    if int(best_class) in label_map:
        nice_label = label_map[int(best_class)]
        print(f"Tolkning: {nice_label}")
    else:
        print("(Usikker klasselabel – sjekk hvordan du kodet 'outcome' i treningen.)")


def main():
    parser = argparse.ArgumentParser(
        description="Live NHL-kampprediksjon basert på nylig form."
    )
    parser.add_argument("away", type=str, help="Bortelagets NHL-kode, f.eks. BOS")
    parser.add_argument("home", type=str, help="Hjemmelagets NHL-kode, f.eks. DET")

    args = parser.parse_args()
    predict_live_match(args.away.upper(), args.home.upper())


if __name__ == "__main__":
    main()
