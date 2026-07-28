# report_service.py
"""
Delt prediksjons- og rapportlogikk.

Brukes både av FastAPI-et (`api.py`) og av den statiske dataeksporten
(`export_site_data.py`), slik at frontend får identiske payloads uansett om
den snakker med et levende API eller leser forhåndsgenerert JSON.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import pandas as pd

from live.form_engine import compute_stats_from_games, format_recent_games
from live.live_feature_builder import build_live_features
from live.nhl_api import get_team_recent_games
from live.nt_odds import get_nhl_matches_range
from live.team_cache import cache_team_games, get_cached_team_games
from utils.data_loader import load_team_mappings
from utils.feature_engineering import DEFAULT_WINDOWS
from utils.model_utils import load_model
from utils.team_alias import to_canonical, to_display
from utils.value_utils import (
    adjust_three_way_probs,
    expected_value,
    implied_probability,
    odds_complete,
    round_optional,
)

BASE_DIR = Path(__file__).resolve().parent
TEAM_INFO_PATH = BASE_DIR / "data" / "team_info.csv"
MODEL_PATH = BASE_DIR / "models" / "nhl_model.pkl"

LABELS = ["Home Win", "OT / SO", "Away Win"]

# Antall kamper som trengs for det lengste form-vinduet.
FORM_GAMES_NEEDED = max(DEFAULT_WINDOWS)
# /predict viser i tillegg siste 5 kamper.
PREDICT_GAMES_NEEDED = max(FORM_GAMES_NEEDED, 5)

# Cache for å unngå å laste modell/lag-mapping på nytt for hver request.
_cache: Dict[str, Any] = {}


def get_data() -> Dict[str, Any]:
    """Henter og cacher modell + lag-mapping."""
    if "data" not in _cache:
        id_to_abbr, abbr_to_id = load_team_mappings(str(TEAM_INFO_PATH))
        model = load_model(str(MODEL_PATH))

        _cache["data"] = {
            "id_to_abbr": id_to_abbr,
            "abbr_to_id": abbr_to_id,
            "model": model,
        }
    return _cache["data"]


def normalize_probs(*probs: Optional[float]):
    """Sørger for at sannsynlighetene summerer til 1."""
    clean = [p if p is not None else 0.0 for p in probs]
    total = sum(clean)
    if total <= 0:
        return tuple(0.0 for _ in clean)
    return tuple(p / total for p in clean)


def prob_to_decimal_odds(prob: float) -> Optional[float]:
    """Konverterer modell-prob til decimal odds (fair odds)."""
    if prob <= 0:
        return None
    return round(1 / prob, 2)


def list_teams() -> List[Dict[str, str]]:
    """Returnerer liste over alle tilgjengelige lag (uten alias-duplikater)."""
    data = get_data()
    teams: List[Dict[str, str]] = []
    seen = set()
    for abbr in sorted(data["abbr_to_id"].keys()):
        display_abbr = to_display(abbr)
        if display_abbr in seen:
            continue  # unngå duplikater (f.eks. ARI -> UTA)
        seen.add(display_abbr)
        teams.append({
            "abbreviation": display_abbr,
            "id": str(data["abbr_to_id"][abbr]),
        })
    return teams


def fetch_team_games(team_abbr: str, limit: int = PREDICT_GAMES_NEEDED) -> List[Dict]:
    """
    Henter siste kamper for et lag direkte fra NHL-APIet.

    Prøver forkortelsen som er oppgitt først, og faller tilbake på den
    kanoniske (f.eks. UTA -> ARI). Feil fra APIet propageres til kalleren.
    """
    games = get_team_recent_games(team_abbr, limit=limit)
    if games:
        return games
    canonical = to_canonical(team_abbr)
    if canonical != team_abbr:
        return get_team_recent_games(canonical, limit=limit)
    return games


def get_team_games(
    team_abbr: str,
    limit: int = FORM_GAMES_NEEDED,
    memo: Optional[Dict[str, Optional[List[Dict]]]] = None,
) -> Optional[List[Dict]]:
    """
    Henter kamper via minne-/diskcache. Returnerer None hvis henting feiler
    eller ikke gir noen kamper, slik at kallende kode kan hoppe over laget i
    stedet for å regne på tom form.
    """
    cache_key = to_canonical(team_abbr)
    if memo is not None and cache_key in memo:
        return memo[cache_key]

    cached = get_cached_team_games(cache_key)
    if not cached and cache_key != team_abbr:
        cached = get_cached_team_games(team_abbr)
    if cached:
        if memo is not None:
            memo[cache_key] = cached
        return cached

    try:
        games = fetch_team_games(team_abbr, limit=limit) or None
        if games:
            cache_team_games(cache_key, games)
    except Exception as exc:  # pragma: no cover - nettverksfeil
        print(f"Feil ved henting av kamper for {team_abbr}: {exc}")
        games = None

    if memo is not None:
        memo[cache_key] = games
    return games


def predict_rows(features: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Kjører modellen på én eller flere feature-rader og returnerer
    sannsynlighet per utfall + etikett for hver rad.
    """
    model = get_data()["model"]
    classes = list(model.classes_)
    predictions: List[Dict[str, Any]] = []

    for probs in model.predict_proba(features):
        class_prob_map = dict(zip(classes, probs))
        pred_class = classes[int(probs.argmax())]
        try:
            label_idx = int(pred_class)
        except (TypeError, ValueError):
            label_idx = -1

        predictions.append({
            "prob_home_win": round(float(class_prob_map.get(0, 0.0)), 3),
            "prob_ot": round(float(class_prob_map.get(1, 0.0)), 3),
            "prob_away_win": round(float(class_prob_map.get(2, 0.0)), 3),
            "prediction": (
                LABELS[label_idx] if 0 <= label_idx < len(LABELS) else str(pred_class)
            ),
        })

    return predictions


def build_team_summary(team_abbr: str, games: Sequence[Dict]) -> Dict[str, Any]:
    """Siste 5 kamper + nøkkeltall for ett lag, slik frontend viser dem."""
    # Kampene fra NHL-APIet bruker visningsforkortelsen (UTA, ikke ARI), så
    # hjemme-/bortesjekken må gjøres mot samme forkortelse.
    display_abbr = to_display(to_canonical(team_abbr))
    return {
        "last_5": format_recent_games(display_abbr, list(games), limit=5),
        "stats": compute_stats_from_games(display_abbr, list(games)[:5]),
    }


def build_prediction(
    home_abbr: str,
    away_abbr: str,
    home_games: Sequence[Dict],
    away_games: Sequence[Dict],
) -> Dict[str, Any]:
    """
    Bygger en komplett prediksjons-payload (samme form som POST /predict).
    """
    home_canon = to_canonical(home_abbr)
    away_canon = to_canonical(away_abbr)

    feature_row = build_live_features(
        away_canon,
        home_canon,
        windows=DEFAULT_WINDOWS,
        home_games=list(home_games),
        away_games=list(away_games),
    )

    home_summary = build_team_summary(home_canon, home_games)
    away_summary = build_team_summary(away_canon, away_games)

    return {
        "home_team": to_display(home_canon),
        "away_team": to_display(away_canon),
        "home_last_5": home_summary["last_5"],
        "away_last_5": away_summary["last_5"],
        "home_stats": home_summary["stats"],
        "away_stats": away_summary["stats"],
        **predict_rows(feature_row)[0],
    }


def build_value_report(days: int = 3, verbose: bool = False) -> List[Dict[str, Any]]:
    """
    Kamper for de neste `days` dagene med modell-sannsynlighet, markedets odds
    og forventet EV (samme form som GET /value-report).
    """
    days = max(0, min(days, 10))
    model = get_data()["model"]
    games = get_nhl_matches_range(days)

    if verbose:
        print(f"Hentet {len(games)} kamper for value-rapport (days={days})")

    team_games_memo: Dict[str, Optional[List[Dict]]] = {}
    results: List[Dict[str, Any]] = []

    for game in games:
        home_abbr = game.get("home_abbr")
        away_abbr = game.get("away_abbr")

        if not home_abbr or not away_abbr:
            continue  # mangler mapping

        home_games = get_team_games(home_abbr, memo=team_games_memo)
        away_games = get_team_games(away_abbr, memo=team_games_memo)

        if not home_games or not away_games:
            if verbose:
                print(f"  Hopper over {home_abbr} vs {away_abbr} (mangler kampdata)")
            continue

        try:
            feature_row = build_live_features(
                to_canonical(away_abbr),
                to_canonical(home_abbr),
                windows=DEFAULT_WINDOWS,
                home_games=home_games,
                away_games=away_games,
            )
            probs = model.predict_proba(feature_row)[0]
        except Exception as exc:  # pragma: no cover - beskytter kallende kode
            print(f"Skipper kamp {home_abbr} vs {away_abbr}: {exc}")
            continue

        class_prob_map = dict(zip(model.classes_, probs))
        home_prob, draw_prob, away_prob = normalize_probs(
            float(class_prob_map.get(0, 0.0)),
            float(class_prob_map.get(1, 0.0)),
            float(class_prob_map.get(2, 0.0)),
        )
        home_prob, draw_prob, away_prob = adjust_three_way_probs(
            home_prob,
            draw_prob,
            away_prob,
        )

        odds_home = game.get("odds_home")
        odds_draw = game.get("odds_draw")
        odds_away = game.get("odds_away")

        odds_ok = odds_complete(odds_home, odds_draw, odds_away)
        value_home = expected_value(home_prob, odds_home) if odds_ok else None
        value_draw = expected_value(draw_prob, odds_draw) if odds_ok else None
        value_away = expected_value(away_prob, odds_away) if odds_ok else None

        available_values = {
            key: value
            for key, value in (
                ("home", value_home),
                ("draw", value_draw),
                ("away", value_away),
            )
            if value is not None
        }
        best_value = None
        best_value_delta = None
        if available_values and odds_ok:
            best_value, best_value_delta = max(
                available_values.items(), key=lambda kv: kv[1]
            )

        raw_start = game.get("startTime") or ""
        try:
            start_dt = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
            date_str = start_dt.strftime("%Y-%m-%d")
            start_time = start_dt.isoformat()
        except Exception:
            date_str = ""
            start_time = raw_start if isinstance(raw_start, str) else ""

        results.append({
            "event_id": str(
                game.get("eventId") or f"{home_abbr}-{away_abbr}-{start_time}"
            ),
            "date": date_str,
            "start_time": start_time,
            "home": str(game.get("home") or home_abbr or ""),
            "away": str(game.get("away") or away_abbr or ""),
            "home_abbr": to_display(home_abbr) or None,
            "away_abbr": to_display(away_abbr) or None,
            "odds_home": odds_home,
            "odds_draw": odds_draw,
            "odds_away": odds_away,
            "model_home_win": round(home_prob, 3),
            "model_draw": round(draw_prob, 3),
            "model_away_win": round(away_prob, 3),
            "model_home_odds": prob_to_decimal_odds(home_prob),
            "model_draw_odds": prob_to_decimal_odds(draw_prob),
            "model_away_odds": prob_to_decimal_odds(away_prob),
            "implied_home_prob": round_optional(implied_probability(odds_home), 5),
            "implied_draw_prob": round_optional(implied_probability(odds_draw), 5),
            "implied_away_prob": round_optional(implied_probability(odds_away), 5),
            "value_home": round_optional(value_home, 5),
            "value_draw": round_optional(value_draw, 5),
            "value_away": round_optional(value_away, 5),
            "best_value": best_value,
            "best_value_delta": round_optional(best_value_delta, 5),
        })

    if games and not results:
        # Odds-APIet svarte, men vi fikk ikke kampdata for noen av kampene.
        # Da er rapporten verdiløs – la kalleren beholde forrige versjon.
        raise RuntimeError(
            f"Alle {len(games)} kamper ble hoppet over (mangler kampdata)"
        )

    if verbose:
        print(f"Value-rapport ferdig: {len(results)} kamper")

    return results
