# predict_with_odds.py
from live.nt_odds import get_nhl_matches_range
from live.live_feature_builder import build_live_features
from utils.model_utils import load_model
from utils.feature_engineering import DEFAULT_WINDOWS

MODEL_PATH = "models/nhl_model.pkl"


def implied_probability(odds: float) -> float:
    """Konverterer odds til implisitt sannsynlighet."""
    if odds is None or odds <= 1e-9:
        return None
    return 1 / odds


def normalize_probs(*probs):
    """Sørger for at summen blir 1."""
    clean = [p if p is not None else 0.0 for p in probs]
    total = sum(clean)
    if total <= 0:
        return tuple(0.0 for _ in clean)
    return tuple(p / total for p in clean)


def predict_match(model, home_abbr, away_abbr):
    """
    Lager feature-row og får prediksjon fra ML-modellen.
    Returnerer et dict med sannsynligheter.
    """

    X = build_live_features(away_abbr, home_abbr, windows=DEFAULT_WINDOWS)
    probs = model.predict_proba(X)[0]
    class_probs = dict(zip(model.classes_, probs))

    home_prob = class_probs.get(0, 0.0)
    draw_prob = class_probs.get(1, 0.0)
    away_prob = class_probs.get(2, 0.0)

    home_prob, draw_prob, away_prob = normalize_probs(home_prob, draw_prob, away_prob)

    return {
        "model_home_win_prob": home_prob,
        "model_draw_prob": draw_prob,
        "model_away_win_prob": away_prob,
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

        raw_imp_H = implied_probability(g["odds_home"])
        raw_imp_D = implied_probability(g["odds_draw"])
        raw_imp_A = implied_probability(g["odds_away"])

        # Normalize markedet
        imp_H, imp_D, imp_A = normalize_probs(
            raw_imp_H if raw_imp_H is not None else 0.0,
            raw_imp_D if raw_imp_D is not None else 0.0,
            raw_imp_A if raw_imp_A is not None else 0.0,
        )

        value_H = evaluate_value(pred["model_home_win_prob"], imp_H if raw_imp_H is not None else None)
        value_D = evaluate_value(pred["model_draw_prob"], imp_D if raw_imp_D is not None else None)
        value_A = evaluate_value(pred["model_away_win_prob"], imp_A if raw_imp_A is not None else None)

        game_entry = {
            "match": f"{home_abbr} vs {away_abbr}",
            "start": g["startTime"],

            # odds
            "odds_home": g["odds_home"],
            "odds_draw": g["odds_draw"],
            "odds_away": g["odds_away"],

            # modeled probabilities
            "model_home_win": round(pred["model_home_win_prob"], 3),
            "model_draw": round(pred["model_draw_prob"], 3),
            "model_away_win": round(pred["model_away_win_prob"], 3),

            # implied probabilities
            "implied_home_prob": round(imp_H, 3) if raw_imp_H is not None else None,
            "implied_draw_prob": round(imp_D, 3) if raw_imp_D is not None else None,
            "implied_away_prob": round(imp_A, 3) if raw_imp_A is not None else None,

            # VALUE
            "value_home": round(value_H, 3) if value_H is not None else None,
            "value_draw": round(value_D, 3) if value_D is not None else None,
            "value_away": round(value_A, 3) if value_A is not None else None,
        }

        report.append(game_entry)

    return report


if __name__ == "__main__":
    print("=== NHL Value Betting Report (Next 3 days) ===\n")
    rep = make_report(3)
    if not rep:
        raise SystemExit(0)

    for r in rep:
        print("--------------------------------------------------")
        print(r["match"], "|", r["start"])
        print(f" Odds: H={r['odds_home']}   D={r['odds_draw']}   A={r['odds_away']}")
        print(f" Model: H={r['model_home_win']}   D={r['model_draw']}   A={r['model_away_win']}")
        print(f" Market: H={r['implied_home_prob']}   D={r['implied_draw_prob']}   A={r['implied_away_prob']}")
        print(f" VALUE:  H={r['value_home']}   D={r['value_draw']}   A={r['value_away']}")
    print("--------------------------------------------------")
