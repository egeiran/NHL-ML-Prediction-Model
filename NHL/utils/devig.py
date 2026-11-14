"""
Fjerner bookmakerens margin fra et sett odds (devigging). Kun stdlib.

Alle metodene tar desimalodds for alle utfall i ett marked og returnerer
sannsynligheter som summerer til 1.

  multiplicative  1/o normalisert. Legger marginen proporsjonalt på alle
                  utfall – undervurderer favoritten når boka legger mer
                  margin på longshots (favoritt/longshot-skjevhet).
  power           p_i = (1/o_i)^k med k valgt slik at Σp = 1. Tar mer margin
                  fra longshots enn fra favoritten. Default.
  shin            Shins modell for innsidehandel; samme retning som power.

Med Pinnacles ~2–3 % margin gir metodene nesten samme svar. Med NTs 7–12 %
sprer de seg mer, men NT-devig brukes uansett aldri som spillsignal.
"""
from __future__ import annotations

import math
from typing import List, Sequence

METHODS = ("multiplicative", "power", "shin")
DEFAULT_METHOD = "power"


def _inverse(odds: Sequence[float]) -> List[float]:
    if len(odds) < 2:
        raise ValueError("trenger minst to utfall")
    inv = []
    for o in odds:
        o = float(o)
        if not o > 1.0 or math.isinf(o):
            raise ValueError(f"ugyldig odds: {o}")
        inv.append(1.0 / o)
    return inv


def multiplicative(odds: Sequence[float]) -> List[float]:
    inv = _inverse(odds)
    total = sum(inv)
    return [p / total for p in inv]


def power(odds: Sequence[float], tol: float = 1e-12) -> List[float]:
    """Løser Σ (1/o_i)^k = 1 ved halvering. Σ er synkende i k siden 1/o < 1."""
    inv = _inverse(odds)
    lo, hi = 1e-6, 50.0
    for _ in range(200):
        k = (lo + hi) / 2
        s = sum(p ** k for p in inv)
        if abs(s - 1.0) < tol:
            break
        if s > 1.0:
            lo = k
        else:
            hi = k
    probs = [p ** k for p in inv]
    total = sum(probs)
    return [p / total for p in probs]


def shin(odds: Sequence[float], tol: float = 1e-12) -> List[float]:
    """
    Shin (1993): p_i = (√(z² + 4(1−z)·π_i²/Σπ) − z) / (2(1−z)), z ∈ [0, 1)
    valgt slik at Σp = 1. Uten margin (Σπ ≤ 1) er z = 0 og svaret π/Σπ.
    """
    inv = _inverse(odds)
    total = sum(inv)
    if total <= 1.0:
        return [p / total for p in inv]

    def probs(z: float) -> List[float]:
        return [
            (math.sqrt(z * z + 4 * (1 - z) * p * p / total) - z) / (2 * (1 - z))
            for p in inv
        ]

    lo, hi = 0.0, 0.999
    for _ in range(200):
        z = (lo + hi) / 2
        s = sum(probs(z))
        if abs(s - 1.0) < tol:
            break
        # Σp synker når z øker.
        if s > 1.0:
            lo = z
        else:
            hi = z
    p = probs(z)
    s = sum(p)
    return [x / s for x in p]


def devig(odds: Sequence[float], method: str = DEFAULT_METHOD) -> List[float]:
    if method == "multiplicative":
        return multiplicative(odds)
    if method == "power":
        return power(odds)
    if method == "shin":
        return shin(odds)
    raise ValueError(f"ukjent devig-metode: {method}")
