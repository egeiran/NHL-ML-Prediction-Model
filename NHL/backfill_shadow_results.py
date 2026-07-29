#!/usr/bin/env python3
"""
Etterfyller resultater i under-terskel-loggen (engangsjobb, kjøres manuelt).

`data/bet_below_threshold.csv` har historisk blitt skrevet med status
"below_threshold" og innsats 0, og ble derfor aldri avregnet – `actual_outcome`
står tom i alle gamle rader. Da kan vi ikke svare på om EV-terskelen ligger
riktig. Nye rader skrives nå som vanlige "pending"-spill med notionell innsats
og avregnes automatisk; dette scriptet migrerer og avregner de gamle.

Kjøres manuelt fordi det slår opp resultatet for hver kamp mot NHL-APIet – det
tar tid og bør ikke ligge i den daglige jobben.

    cd NHL
    python backfill_shadow_results.py --dry-run   # vis hva som vil skje
    python backfill_shadow_results.py             # gjør det

Kan også kjøres mot skyggeloggen med --path data/bet_shadow.csv.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List

from bet_tracker import (
    BET_BELOW_THRESHOLD_PATH,
    NOTIONAL_STAKE,
    _read_csv,
    _write_csv,
    season_of,
    settle_pending_bets,
)

LEGACY_STATUS = "below_threshold"


def migrate(rows: List[Dict[str, Any]], stake: float) -> int:
    """Gjør gamle rader avregnbare: vanlig status og notionell innsats."""
    migrated = 0
    for row in rows:
        if row.get("status") != LEGACY_STATUS:
            continue
        row["status"] = "pending"
        row["stake"] = stake
        row["payout"] = 0.0
        row["profit"] = 0.0
        if not row.get("season"):
            row["season"] = season_of(row.get("date"))
        migrated += 1
    return migrated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--path",
        type=Path,
        default=BET_BELOW_THRESHOLD_PATH,
        help="CSV-fil som skal etterfylles (default: data/bet_below_threshold.csv)",
    )
    parser.add_argument(
        "--stake",
        type=float,
        default=NOTIONAL_STAKE,
        help=f"Notionell innsats per spill (default: {NOTIONAL_STAKE:.0f})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Vis hva som ville blitt gjort, uten å skrive eller kalle APIet.",
    )
    args = parser.parse_args()

    rows = _read_csv(args.path)
    if not rows:
        print(f"Ingen rader i {args.path}")
        return 0

    legacy = sum(1 for r in rows if r.get("status") == LEGACY_STATUS)
    pending = sum(1 for r in rows if r.get("status") == "pending")
    print(f"{args.path.name}: {len(rows)} rader ({legacy} gamle, {pending} pending)")

    if args.dry_run:
        print(f"[dry-run] ville migrert {legacy} rader til pending "
              f"med innsats {args.stake:.0f} og deretter avregnet dem.")
        return 0

    migrated = migrate(rows, args.stake)
    print(f"Migrerte {migrated} rader. Slår opp resultater mot NHL-APIet ...")

    settled = settle_pending_bets(rows)
    _write_csv(args.path, rows)

    won = sum(1 for r in rows if r.get("status") == "won")
    lost = sum(1 for r in rows if r.get("status") == "lost")
    profit = sum(float(r.get("profit") or 0.0) for r in rows if r.get("status") in {"won", "lost"})
    staked = sum(float(r.get("stake") or 0.0) for r in rows if r.get("status") in {"won", "lost"})

    print(f"Avregnet {settled} spill. Totalt {won} vunnet / {lost} tapt.")
    if staked:
        print(f"Hypotetisk resultat: {profit:+.0f} kr på {staked:.0f} kr innsats "
              f"(ROI {100 * profit / staked:+.1f} %)")
    remaining = sum(1 for r in rows if r.get("status") == "pending")
    if remaining:
        print(f"{remaining} spill kunne ikke avregnes (kamp ikke funnet eller ikke ferdig).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
