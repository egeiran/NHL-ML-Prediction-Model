#!/usr/bin/env python3
"""
Henter oddsen hos Norsk Tipping rett før kampstart for åpne spill og
skyggespill, og fører den inn som sluttodds (close_odds_*).

Kjøres av .github/workflows/closing-odds.yml noen ganger i løpet av kvelden
(norsk tid). Hver kjøring oppdaterer rader som starter innen
NHL_CLOSING_WINDOW_HOURS (default 3), så den siste kjøringen før kampstart er
den som står igjen.

Closing line value (CLV) = oddsen vi fikk / sluttoddsen - 1. Med ~200 spill i
sesongen trengs flere sesonger før ROI skiller en kant fra flaks; CLV gir et
signal per spill og er standardmålet på om modellen finner priser markedet
senere retter seg etter.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

from bet_tracker import (
    closing_line_value,
    current_season,
    filter_season,
    load_history,
    load_shadow,
    record_closing_odds,
    save_history,
    save_shadow,
)
from live.nt_odds import get_nhl_matches_range


def summary(label: str, rows) -> str:
    values = [v for v in (closing_line_value(r) for r in rows) if v is not None]
    if not values:
        return f"{label}: ingen spill med sluttodds ennå"
    mean = sum(values) / len(values)
    better = sum(1 for v in values if v > 0)
    return (
        f"{label}: snitt CLV {mean * 100:+.1f} % på {len(values)} spill "
        f"({better} med bedre odds enn sluttoddsen)"
    )


def main() -> int:
    window = float(os.environ.get("NHL_CLOSING_WINDOW_HOURS", "3"))
    now = datetime.now(timezone.utc)
    games = get_nhl_matches_range(1)
    print(f"Hentet {len(games)} kamper fra Norsk Tipping")

    history, shadow = load_history(), load_shadow()
    n_history = record_closing_odds(history, games, now, window)
    n_shadow = record_closing_odds(shadow, games, now, window)
    if n_history:
        save_history(history)
    if n_shadow:
        save_shadow(shadow)
    print(f"Sluttodds ført: {n_history} spill, {n_shadow} skyggespill (vindu {window:g} t)")

    season = current_season()
    print(summary(f"Portefølje {season}", filter_season(history, season)))
    print(summary(f"Skygge {season}", filter_season(shadow, season)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
