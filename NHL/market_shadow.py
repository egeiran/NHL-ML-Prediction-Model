#!/usr/bin/env python3
"""
Markedslogg og skyggestrategi for «Vinner inkl. overtid».

    python market_shadow.py --job daily     # daglig kjøring (08 UTC)
    python market_shadow.py --job closing   # kveldens closing-kjøringer

Hver kjøring:
  1. Henter alle NHL-kamper hos NT innen horisonten (daglig 48 t, closing 24 t)
     og deres markeder (HUB, ML, OT, DNB, totals, handikap; daglig også
     lagtotaler og korrekt resultat). Skrives til data/odds/nt_YYYY-MM.jsonl.
  2. Henter skarpe odds fra The Odds API (Pinnacle m.fl.) hvis ODDS_API_KEY er
     satt, kvoten tåler det og NT har kamper. Skrives til sharp_YYYY-MM.jsonl.
  3. Legger én rad i data/odds/runs.csv – også når noe feilet, så «ikke
     hentet» kan skilles fra «uendret».
  4. Bare daglig: avregner strategiraden for ferdige kamper og beslutter nye
     (data/strategy_ml.csv). Se strategy_ml.py for regelen.

Endrer aldri bet_history.csv eller bet_shadow.csv – den eksisterende
porteføljen går uendret. Feil per kamp isoleres; manglende nøkkel eller lav
kvote gir exit 0. Exit 1 bare ved et uventet krasj, og workflow-steget har
continue-on-error, så resten av den daglige jobben går uansett.

Miljøvariabler: ODDS_API_KEY, NHL_ODDS_API_RESERVE (60), NHL_ODDS_DIR,
NHL_ML_EV_MIN (0.03), NHL_ML_MAX_ODDS (4.0), NHL_STRATEGY_ML_PATH.
"""
from __future__ import annotations

import argparse
import os
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import strategy_ml
from live import nt_markets, odds_api
from utils import odds_log

JOBS = {
    # horisont i timer, NT-dager å hente, tier, Odds API-markeder
    "daily": {"horizon": 48.0, "days": 2, "tier": nt_markets.TIER_DAILY, "markets": ("h2h", "totals")},
    "closing": {"horizon": 24.0, "days": 1, "tier": nt_markets.TIER_CORE, "markets": ("h2h",)},
}


def _strategy_path() -> Path:
    raw = os.environ.get("NHL_STRATEGY_ML_PATH", "").strip()
    return Path(raw) if raw else strategy_ml.STRATEGY_PATH


def sharp_snapshot(nt_events: List[Dict[str, Any]], now: datetime, job: str,
                   markets, directory: Optional[Path] = None):
    """
    (status, sharp-poster for loggen, NT-key → match, kvote igjen, kvote brukt).
    Ingen kall når NT ikke har kamper, nøkkelen mangler eller kvoten er lav.
    """
    if not nt_events:
        return "no_games", [], {}, None, None
    if not odds_api.api_key():
        return "no_key", [], {}, None, None
    last = odds_log.last_quota_remaining(now, directory)
    if not odds_api.quota_ok(last):
        print(f"  Odds API: hopper over, bare {last} kreditter igjen denne måneden")
        return "low_quota", [], {}, last, None

    result = odds_api.fetch_odds(markets=markets)
    if result.status != "ok":
        print(f"  Odds API: {result.status} {odds_api.scrub(result.note)}")
        return result.status, [], {}, result.remaining, result.used

    sharp = odds_api.parse_events(result.events)
    matches = odds_api.match_to_nt(sharp, nt_events)
    at = now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    by_id = {}
    for key, m in matches.items():
        by_id.setdefault(id(m["sharp"]), (key, m["match"]))
    records = []
    horizon_end = max((e["start"] for e in nt_events), default="")
    for s in sharp:
        key, match = by_id.get(id(s), (None, "none"))
        if key is None and s["start"] > horizon_end:
            continue  # kamper lenger fram enn NT-horisonten trenger vi ikke ennå
        records.append({"v": 1, "at": at, "job": job, "src": "oddsapi", "key": key,
                        "match": match, **s})
    return "ok", records, matches, result.remaining, result.used


def _model_rows() -> Dict[str, Dict[str, Any]]:
    """Elo-modellens 3-veis-sannsynligheter per kamp, fra bet-loggene dagens kjøring skrev."""
    import bet_tracker as bt

    out: Dict[str, Dict[str, Any]] = {}
    for row in bt.load_history() + bt.load_shadow():
        for key in bt._event_keys(row):
            out[key] = row
    return out


def _model_meta() -> Dict[str, Any]:
    try:
        from utils.model_utils import load_model, model_metadata

        return model_metadata(load_model(str(strategy_ml.BASE_DIR / "models" / "nhl_model.pkl")))
    except Exception as exc:
        print(f"  [WARN] modellmetadata utilgjengelig ({type(exc).__name__}); q = basisrate")
        return {}


def _gate(row: Dict[str, Any]) -> Optional[str]:
    """Samme sperrer som porteføljen: bare grunnserie, og nok kamper spilt."""
    import bet_tracker as bt

    if not bt.is_bettable_game_type(row.get("date"), row.get("home_abbr"), row.get("away_abbr")):
        return "game_type"
    if not bt.has_enough_games(row):
        return "early_season"
    return None


def run_strategy(now: datetime, nt_records, matches, directory: Optional[Path] = None) -> Dict[str, int]:
    import bet_tracker as bt

    path = _strategy_path()
    rows = strategy_ml.load(path)
    nt_by_key = odds_log.by_key(odds_log.iter_records("nt", directory))
    sharp_by_key = odds_log.by_key(odds_log.iter_records("sharp", directory))
    settled = strategy_ml.settle(rows, now, bt._lookup_result, nt_by_key, sharp_by_key)
    added = strategy_ml.decide_new(
        rows, nt_records, matches, now,
        model_rows=_model_rows(), model_meta=_model_meta(), gate=_gate,
    )
    strategy_ml.save(rows, path)
    bets = [r for r in added if r.get("status") == "pending"]
    for r in added:
        what = (f"SPILL {r['selection']} @ {r['odds']:.2f} (EV {r['ev'] * 100:+.1f} %)"
                if r in bets else f"ikke spill: {r['skip_reason']}")
        print(f"  {r['game_key']}: {what}")
    summary = strategy_ml.summarize(rows)
    clv = summary["clv_sharp"]
    clv_text = "–" if clv["mean"] is None else f"{clv['mean'] * 100:+.2f} %"
    print(
        f"  Strategi {strategy_ml.STRATEGY}: {summary['bets']} spill totalt, "
        f"CLV mot Pinnacle {clv_text} (n={clv['n']}), "
        f"fremdrift {summary['progress'] * 100:.0f} % av {summary['target_bets']}"
    )
    return {"decided": len(added), "bets": len(bets), "settled": settled}


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--job", choices=sorted(JOBS), required=True)
    args = parser.parse_args(argv)
    cfg = JOBS[args.job]
    now = datetime.now(timezone.utc)
    run: Dict[str, Any] = {"run_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "job": args.job}
    notes = []

    try:
        try:
            events = nt_markets.nhl_events(cfg["days"], now, cfg["horizon"])
            run["nt_status"] = "ok"
        except Exception as exc:
            events = []
            run["nt_status"] = "error"
            notes.append(f"NT: {type(exc).__name__}: {exc}")
            print(f"[FEIL] NT-eventlista: {exc}")
        run["nt_events"] = len(events)
        print(f"NT: {len(events)} NHL-kamper innen {cfg['horizon']:g} t")

        nt_records, stats = nt_markets.snapshot_events(events, now, args.job, cfg["tier"])
        run.update({"nt_markets_ok": stats["ok"], "nt_markets_failed": stats["failed"],
                    "nt_unclassified": stats["unclassified"]})
        odds_log.append("nt", nt_records, now)

        status, sharp_records, matches, remaining, used = sharp_snapshot(
            events, now, args.job, cfg["markets"]
        )
        run.update({"sharp_status": status, "sharp_events": len(sharp_records),
                    "sharp_matched": sum(1 for m in matches.values() if m["match"] == "ok"),
                    "quota_remaining": remaining, "quota_used": used})
        odds_log.append("sharp", sharp_records, now)
        print(f"Odds API: {status}, {run['sharp_matched']} av {len(events)} kamper matchet"
              + (f", {remaining} kreditter igjen" if remaining is not None else ""))

        if args.job == "daily":
            try:
                result = run_strategy(now, nt_records, matches)
                run.update({"strategy_decided": result["decided"], "strategy_bets": result["bets"],
                            "strategy_settled": result["settled"]})
            except Exception as exc:
                notes.append(f"strategi: {type(exc).__name__}: {exc}")
                traceback.print_exc()
                run["note"] = odds_api.scrub("; ".join(notes))[:300]
                odds_log.append_run(run)
                return 1
    except Exception as exc:  # pragma: no cover - uventet
        notes.append(f"{type(exc).__name__}: {exc}")
        traceback.print_exc()
        run["note"] = odds_api.scrub("; ".join(notes))[:300]
        odds_log.append_run(run)
        return 1

    run["note"] = odds_api.scrub("; ".join(notes))[:300]
    odds_log.append_run(run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
