from typing import Optional


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
