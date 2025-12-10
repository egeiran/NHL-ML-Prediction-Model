"""
Alias-håndtering for lagforkortelser.

- to_canonical: brukes til modell/feature-beregninger (f.eks. UTA -> ARI).
- to_display: brukes til visning i API/frontend (f.eks. ARI -> UTA).
"""
from __future__ import annotations

from typing import Dict

# Abbrevs som skal mappes til trenings-/modellforkortelsen.
CANONICAL_MAP: Dict[str, str] = {
    "UTA": "ARI",
    "UTAH": "ARI",
    "UTAHMAMMOTH": "ARI",
}

# Abbrevs som bør vises annerledes ut mot bruker/frontend.
DISPLAY_MAP: Dict[str, str] = {
    "ARI": "UTA",
}


def to_canonical(abbr: str) -> str:
    """Returner modellens canonical forkortelse (default: abbr.upper())."""
    if not isinstance(abbr, str):
        return abbr
    upper = abbr.upper()
    return CANONICAL_MAP.get(upper, upper)


def to_display(abbr: str) -> str:
    """Returner visningsalias (default: abbr.upper())."""
    if not isinstance(abbr, str):
        return abbr
    upper = abbr.upper()
    return DISPLAY_MAP.get(upper, upper)
