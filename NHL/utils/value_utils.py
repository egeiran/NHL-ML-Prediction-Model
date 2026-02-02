import os
from typing import Optional, Tuple


_DRAW_PROB_MULTIPLIER = float(os.environ.get("NHL_DRAW_PROB_MULT", "0.9"))


def adjust_three_way_probs(
    home_prob: float,
    draw_prob: float,
    away_prob: float,
    draw_multiplier: Optional[float] = None,
) -> Tuple[float, float, float]:
    """
    Skalerer draw-prob og renormaliserer sannsynligheter.
    Brukes for å redusere draw-bias uten å retrene modellen.
    """
    multiplier = _DRAW_PROB_MULTIPLIER if draw_multiplier is None else draw_multiplier
    draw_prob = draw_prob * multiplier
    total = home_prob + draw_prob + away_prob
    if total <= 0:
        return 0.0, 0.0, 0.0
    return home_prob / total, draw_prob / total, away_prob / total


def implied_probability(odds: Optional[float]) -> Optional[float]:
    if odds is None or odds <= 1e-9:
        return None
    return 1.0 / odds


def expected_value(model_prob: float, odds: Optional[float]) -> Optional[float]:
    if odds is None or odds <= 1e-9:
        return None
    return (model_prob * odds) - 1.0


def odds_complete(*odds: Optional[float]) -> bool:
    return all(o is not None and o > 1e-9 for o in odds)


def round_optional(value: Optional[float], decimals: int = 5) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), decimals)
    except (TypeError, ValueError):
        return None
