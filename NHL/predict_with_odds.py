# predict_with_odds.py
import pandas as pd
from live.nt_odds import get_nhl_matches_range
from live.live_feature_builder import build_live_features
from utils.model_utils import load_model
from pprint import pprint
import numpy as np

MODEL_PATH = "models/nhl_model.pkl"


def implied_probability(odds: float) -> float:
    """Konverterer odds til implisitt sannsynlighet."""
    if odds is None or odds <= 1e-9:
        return None
    return 1 / odds


def normalize_probs(p1, p2, p3=None):
    """Sørger for at summen blir 1."""
    if p3 is None:
        total = p1 + p2
        return p1 / total, p2 / total
    total = p1 + p2 + p3
    return p1 / total, p2 / total, p3 / total


def predict_match(model, home_abbr, away_abbr):
    """
    Lager feature-row og får prediksjon fra ML-modellen.
    Returnerer et dict med sannsynligheter.
    """

    X = build_live_features(away_abbr, home_abbr)
    probs = model.predict_proba(X)[0]

    # RANDOM FOREST output: [P(Home tap), P(Home win)]
    p_loss = probs[0]
    p_win = probs[1]

    p_win, p_loss = normalize_probs(p_win, p_loss)

    return {
        "model_home_win_prob": p_win,
        "model_home_loss_prob": p_loss,
    }


def evaluate_value(model_prob, implied_prob):
    """VALUE = hvor mye vi mener oddsen er feilprisett."""
    if implied_prob is None:
        return None
    return model_prob - implied_prob


def make_report(days=3):
    model = load_model(MODEL_PATH)

    games = get_nhl_matches_range(days)
    if not games:
        print("Ingen NHL-kamper funnet.")
        return

    report = []

    for g in games:
        home = g["home"]
        away = g["away"]
        home_abbr = g["home_abbr"]
        away_abbr = g["away_abbr"]

        if home_abbr is None or away_abbr is None:
            # fallback i tilfelle mapping failer (skal ikke skje)
            print(f"[ADVARSEL] Mangler mapping for {home} eller {away}")
            continue

        pred = predict_match(model, home_abbr, away_abbr)

        imp_H = implied_probability(g["odds_home"])
        imp_D = implied_probability(g["odds_draw"])
        imp_A = implied_probability(g["odds_away"])

        # Normalize markedet
        if imp_D is None:
            imp_H, imp_A = normalize_probs(imp_H, imp_A)
        else:
            imp_H, imp_D, imp_A = normalize_probs(imp_H, imp_D, imp_A)

        value_H = evaluate_value(pred["model_home_win_prob"], imp_H)
        value_A = evaluate_value(pred["model_home_loss_prob"], imp_A)

        # draw modelleres ikke, så den hopper vi
        game_entry = {
            "match": f"{home_abbr} vs {away_abbr}",
            "start": g["startTime"],

            # odds
            "odds_home": g["odds_home"],
            "odds_draw": g["odds_draw"],
            "odds_away": g["odds_away"],

            # modeled probabilities
            "model_home_win": round(pred["model_home_win_prob"], 3),
            "model_away_win": round(pred["model_home_loss_prob"], 3),

            # implied probabilities
            "implied_home_prob": round(imp_H, 3),
            "implied_away_prob": round(imp_A, 3),

            # VALUE
            "value_home": round(value_H, 3),
            "value_away": round(value_A, 3),
        }

        report.append(game_entry)

    return report


if __name__ == "__main__":
    print("=== NHL Value Betting Report (Next 3 days) ===\n")
    rep = make_report(3)

    for r in rep:
        print("--------------------------------------------------")
        print(r["match"], "|", r["start"])
        print(f" Odds: H={r['odds_home']}   A={r['odds_away']}")
        print(f" Model: H={r['model_home_win']}   A={r['model_away_win']}")
        print(f" Market: H={r['implied_home_prob']}   A={r['implied_away_prob']}")
        print(f" VALUE:  H={r['value_home']}   A={r['value_away']}")
    print("--------------------------------------------------")
