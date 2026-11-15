import math
import os
from typing import Optional, Tuple


# 1.0 = ingen justering. 0.95 var et plaster på Random Forest-ens draw-prob;
# den logistiske modellen er kalibrert per utfall uten hjelp. Overstyr med
# NHL_DRAW_PROB_MULT om en ny kalibrering skulle vise noe annet.
_DRAW_PROB_MULTIPLIER = float(os.environ.get("NHL_DRAW_PROB_MULT", "1.0"))


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


# --- Vinner inkl. overtid (ML) fra 3-veis-modellen ---------------------------
#
# P(hjemme vinner inkl. OT) = P(hjemme ordinær tid) + P(OT/SO) · q, der q er
# sjansen for at hjemmelaget vinner en kamp som går til OT/SO. q trenes i
# train_model.py (logistisk på den relative styrken s = logit(pH / (pH + pA))
# fra 3-veis-modellen, OT/SO-kamper fra 2015/16, 3-mot-3-æraen) og lagres i
# modellmetadata under "ot_home". Eldre artefakter uten feltet faller tilbake
# på basisraten: hjemmelaget vinner 50,7 % av OT/SO-kampene i game.csv.
OT_HOME_BASE_RATE = 0.507


def ot_home_share(p_home: float, p_away: float, meta: Optional[dict] = None) -> float:
    """q: P(hjemmelaget vinner | kampen går til OT/SO)."""
    params = (meta or {}).get("ot_home") if isinstance(meta, dict) else None
    if not params or p_home is None or p_away is None or p_home <= 0 or p_away <= 0:
        return OT_HOME_BASE_RATE
    try:
        s = math.log(p_home / p_away)
        z = float(params["intercept"]) + float(params["slope"]) * s
    except (KeyError, TypeError, ValueError):
        return OT_HOME_BASE_RATE
    return 1.0 / (1.0 + math.exp(-z))


def ml_from_three_way(
    p_home: float, p_draw: float, p_away: float, q_home: float = OT_HOME_BASE_RATE
) -> Tuple[float, float]:
    """(P(hjemme inkl. OT), P(borte inkl. OT)) fra 3-veis-sannsynligheter."""
    total = p_home + p_draw + p_away
    if total <= 0:
        return 0.5, 0.5
    p_home, p_draw = p_home / total, p_draw / total
    ml_home = p_home + p_draw * q_home
    return ml_home, 1.0 - ml_home
