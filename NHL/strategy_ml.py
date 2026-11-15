"""
Skyggestrategien `ml-sharp-v1`: NTs «Vinner (inkludert overtid/straffer)» mot
Pinnacles margin-frie pris.

Hvorfor dette markedet og denne referansen (se PROBLEMS.md og
docs/market_analysis.md):
  - HUB (1X2) har ~12 % margin hos NT, vinner inkl. OT ~7 %.
  - Elo-modellen er på nivå med NT-markedet, ikke bedre. Den kan ikke finne
    12 % – og knapt 7 % – edge alene.
  - Pinnacle har ~2–3 % margin og er markedets beste anslag. Når NT-oddsen
    ligger over Pinnacles margin-frie pris, er det et spill med positiv
    forventning *uten* at vi må slå markedet med egen modell.

Regelen (låst per kamp ved første daglige kjøring der kampen starter innen
24 timer):
  1. NT ML-odds og en matchet skarp pris (Pinnacle, ellers Betfair-børsen hvis
     marginen er under 4 %) må finnes. Ellers: ikke spill.
  2. p_fair = power-devig av den skarpe prisen.
  3. Avviker p_fair fra NTs egen margin-frie pris med mer enn 12 prosentpoeng,
     er det nesten alltid feil kamp eller byttede lag: ikke spill.
  4. EV = p_fair · NT-odds − 1. Spill beste side hvis EV > NHL_ML_EV_MIN
     (0,03) og odds < NHL_ML_MAX_ODDS (4,0). Flat 100 kr, notionelt.
Elo-modellens ML-sannsynlighet logges ved siden av, men styrer ikke spillene.

Én rad per kamp, også når vi ikke spiller (status "nobet", med grunn i
`skip_reason`), så tersklene kan sveipes i ettertid. Avregningen fyller også
`ml_outcome` og sluttoddsen for nobet-rader.

Målet er CLV, ikke ROI: `clv_sharp` = oddsen vi fikk · Pinnacles margin-frie
sannsynlighet ved kampstart − 1, altså forventet avkastning målt mot
markedets sluttpris. Strategien får ekte innsats først når snitt-CLV er
positiv over minst 150 spill, med nedre grense i et 90 %-bootstrap-intervall
over null.

Kun stdlib. Nettverkskall (resultater, kamptype, antall kamper) sendes inn
som funksjoner fra market_shadow.py, så logikken kan testes offline.
"""
from __future__ import annotations

import csv
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence

from utils import odds_log
from utils.devig import DEFAULT_METHOD, devig
from utils.seasons import season_of
from utils.value_utils import ml_from_three_way, ot_home_share

BASE_DIR = Path(__file__).resolve().parent
STRATEGY_PATH = BASE_DIR / "data" / "strategy_ml.csv"

STRATEGY = "ml-sharp-v1"
EV_MIN = float(os.environ.get("NHL_ML_EV_MIN", "0.03"))
MAX_ODDS = float(os.environ.get("NHL_ML_MAX_ODDS", "4.0"))
STAKE = 100.0
DECISION_HORIZON_HOURS = 24.0
MAX_DEVIATION = 0.12
BETFAIR_MAX_OVERROUND = 1.04
SHARP_SOURCES = ("pinnacle", "betfair_ex_eu")
# Overgangskriteriet til ekte innsats (brukerens beslutning, nov. 2026).
TARGET_BETS = 150
CI_LEVEL = 0.90
# Kamper avregnes tidligst så lenge etter start, og annulleres om de ikke er
# ferdige etter VOID_AFTER_DAYS (utsatt kamp).
SETTLE_AFTER_HOURS = 4.0
VOID_AFTER_DAYS = 3

FIELDS = [
    "season", "date", "game_key", "nt_event_id", "start_time", "home_abbr", "away_abbr",
    "decided_at", "strategy",
    "nt_ml_home", "nt_ml_away", "nt_hub_home", "nt_hub_draw", "nt_hub_away",
    "sharp_source", "sharp_ml_home", "sharp_ml_away", "sharp_overround", "devig_method",
    "p_fair_home", "p_nt_home",
    "p_model_home", "p_model_draw", "p_model_away", "p_model_ml_home",
    "ev_home", "ev_away", "selection", "odds", "ev", "stake", "skip_reason",
    "status", "ml_outcome", "reg_outcome", "payout", "profit",
    "close_at", "close_nt_ml_home", "close_nt_ml_away",
    "close_sharp_ml_home", "close_sharp_ml_away", "p_fair_close_home",
    "clv_nt", "clv_sharp", "settled_at",
]
NUMERIC_FIELDS = {
    "nt_ml_home", "nt_ml_away", "nt_hub_home", "nt_hub_draw", "nt_hub_away",
    "sharp_ml_home", "sharp_ml_away", "sharp_overround",
    "p_fair_home", "p_nt_home", "p_model_home", "p_model_draw", "p_model_away",
    "p_model_ml_home", "ev_home", "ev_away", "odds", "ev", "stake", "payout", "profit",
    "close_nt_ml_home", "close_nt_ml_away", "close_sharp_ml_home", "close_sharp_ml_away",
    "p_fair_close_home", "clv_nt", "clv_sharp",
}


# --- lagring ------------------------------------------------------------------

def load(path: Path = STRATEGY_PATH) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            row: Dict[str, Any] = {}
            for k in FIELDS:
                v = raw.get(k, "")
                if k in NUMERIC_FIELDS:
                    try:
                        row[k] = float(v) if v not in ("", None) else None
                    except ValueError:
                        row[k] = None
                else:
                    row[k] = v or ""
            rows.append(row)
    return rows


def save(rows: Sequence[Dict[str, Any]], path: Path = STRATEGY_PATH) -> None:
    """Skriver alltid header, også for en tom logg (workflowens git add krever fila)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: _fmt(row.get(k)) for k in FIELDS})


def _fmt(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        return round(value, 5)
    return value


# --- hjelpere -----------------------------------------------------------------

def _parse(ts: Any) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _two_way(prices: Any) -> Optional[Dict[str, float]]:
    if not isinstance(prices, dict):
        return None
    try:
        home, away = float(prices["home"]), float(prices["away"])
    except (KeyError, TypeError, ValueError):
        return None
    if home <= 1.0 or away <= 1.0:
        return None
    return {"home": home, "away": away}


def sharp_price(sharp_record: Optional[Dict[str, Any]], source: Optional[str] = None):
    """
    (kilde, ML-odds) fra en skarp post. Pinnacle først; Betfair-børsen bare når
    marginen er lav nok til at prisen er en reell markedspris. Med `source`
    hentes den bestemte kilden (brukes ved sluttodds, så vi måler mot samme bok
    som beslutningen).
    """
    books = (sharp_record or {}).get("books") or {}
    sources = (source,) if source else SHARP_SOURCES
    for name in sources:
        prices = _two_way((books.get(name) or {}).get("ML"))
        if prices is None:
            continue
        if name == "betfair_ex_eu" and not source:
            if 1 / prices["home"] + 1 / prices["away"] >= BETFAIR_MAX_OVERROUND:
                continue
        return name, prices
    return None, None


def _model_probs(model_row: Optional[Dict[str, Any]]):
    if not model_row:
        return None
    try:
        probs = tuple(float(model_row[k]) for k in ("model_home_win", "model_draw", "model_away_win"))
    except (KeyError, TypeError, ValueError):
        return None
    return probs if all(p > 0 for p in probs) else None


# --- beslutning ---------------------------------------------------------------

def decide(
    nt_record: Dict[str, Any],
    match: Optional[Dict[str, Any]],
    now: datetime,
    model_row: Optional[Dict[str, Any]] = None,
    model_meta: Optional[Dict[str, Any]] = None,
    gate: Optional[Callable[[Dict[str, Any]], Optional[str]]] = None,
    ev_min: float = EV_MIN,
    max_odds: float = MAX_ODDS,
) -> Dict[str, Any]:
    """Én låst rad for en kamp. `gate` returnerer en grunn til å hoppe over, eller None."""
    markets = nt_record.get("m") or {}
    date = str(nt_record.get("key", ""))[-10:]
    row: Dict[str, Any] = {k: None for k in FIELDS}
    row.update({
        "season": season_of(date),
        "date": date,
        "game_key": nt_record.get("key"),
        "nt_event_id": nt_record.get("eid"),
        "start_time": nt_record.get("start"),
        "home_abbr": nt_record.get("home"),
        "away_abbr": nt_record.get("away"),
        "decided_at": _utc(now),
        "strategy": STRATEGY,
        "devig_method": DEFAULT_METHOD,
        "stake": 0.0,
        "status": "nobet",
        "skip_reason": "",
        "selection": "",
    })
    hub = markets.get("HUB") or {}
    for side in ("home", "draw", "away"):
        row[f"nt_hub_{side}"] = hub.get(side)

    probs = _model_probs(model_row)
    if probs:
        ph, pd_, pa = probs
        row.update({"p_model_home": ph, "p_model_draw": pd_, "p_model_away": pa})
        row["p_model_ml_home"] = ml_from_three_way(ph, pd_, pa, ot_home_share(ph, pa, model_meta))[0]

    nt_ml = _two_way(markets.get("ML"))
    if nt_ml:
        row["nt_ml_home"], row["nt_ml_away"] = nt_ml["home"], nt_ml["away"]
        row["p_nt_home"] = devig([nt_ml["home"], nt_ml["away"]])[0]

    def skip(reason: str) -> Dict[str, Any]:
        row["skip_reason"] = reason
        return row

    if gate is not None:
        reason = gate(row)
        if reason:
            return skip(reason)
    if not nt_ml:
        return skip("no_nt_ml")
    if not match:
        return skip("no_sharp")
    if match.get("match") != "ok":
        return skip(f"sharp_{match.get('match') or 'unmatched'}")

    source, sharp = sharp_price(match.get("sharp"))
    if not sharp:
        return skip("no_sharp")
    row["sharp_source"] = source
    row["sharp_ml_home"], row["sharp_ml_away"] = sharp["home"], sharp["away"]
    row["sharp_overround"] = 1 / sharp["home"] + 1 / sharp["away"]
    p_home = devig([sharp["home"], sharp["away"]])[0]
    row["p_fair_home"] = p_home

    if abs(p_home - row["p_nt_home"]) > MAX_DEVIATION:
        return skip("mismatch")

    row["ev_home"] = p_home * nt_ml["home"] - 1
    row["ev_away"] = (1 - p_home) * nt_ml["away"] - 1
    side = "home" if row["ev_home"] >= row["ev_away"] else "away"
    ev, odds = row[f"ev_{side}"], nt_ml[side]
    if ev <= ev_min:
        return skip("below_ev")
    if odds >= max_odds:
        return skip("odds_cap")
    row.update({"selection": side, "odds": odds, "ev": ev, "stake": STAKE, "status": "pending"})
    return row


def decide_new(
    rows: List[Dict[str, Any]],
    nt_records: Iterable[Dict[str, Any]],
    matches: Dict[str, Dict[str, Any]],
    now: datetime,
    model_rows: Optional[Dict[str, Dict[str, Any]]] = None,
    model_meta: Optional[Dict[str, Any]] = None,
    gate: Optional[Callable[[Dict[str, Any]], Optional[str]]] = None,
    horizon_hours: float = DECISION_HORIZON_HOURS,
) -> List[Dict[str, Any]]:
    """
    Legger til én rad per kamp som starter innen `horizon_hours` og ikke
    allerede er besluttet. Kamper lenger fram venter på neste kjøring, slik at
    beslutningen tas på oddsen nærmest kampstart vi har med én daglig kjøring.
    """
    existing = {r.get("game_key") for r in rows}
    limit = now + timedelta(hours=horizon_hours)
    added = []
    for rec in nt_records:
        key = rec.get("key")
        start = _parse(rec.get("start"))
        if not key or key in existing or start is None or not now < start <= limit:
            continue
        row = decide(rec, matches.get(key), now, (model_rows or {}).get(key), model_meta, gate)
        rows.append(row)
        existing.add(key)
        added.append(row)
    return added


# --- avregning ----------------------------------------------------------------

def _has_ml(rec: Dict[str, Any]) -> bool:
    return _two_way((rec.get("m") or {}).get("ML")) is not None


def settle(
    rows: List[Dict[str, Any]],
    now: datetime,
    lookup_result: Callable[[str, str, str], Optional[Dict[str, Any]]],
    nt_by_key: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    sharp_by_key: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> int:
    """
    Avregner rader (spill og nobet) for kamper som er ferdige, og fører inn
    sluttoddsen fra snapshot-loggen: siste NT- og skarpe post før kampstart.
    Vinneren inkl. OT/SO leses fra målene (NHL-APIet teller straffevinneren som
    et mål), ordinær-tid-utfallet fra `outcome`. Like mål avregnes ikke.
    """
    nt_by_key = nt_by_key or {}
    sharp_by_key = sharp_by_key or {}
    settled = 0
    for row in rows:
        if row.get("settled_at"):
            continue
        start = _parse(row.get("start_time"))
        if start is None or now < start + timedelta(hours=SETTLE_AFTER_HOURS):
            continue
        res = None
        try:
            res = lookup_result(row["date"], row["home_abbr"], row["away_abbr"])
        except Exception as exc:  # nettverk
            print(f"  [WARN] resultat for {row.get('game_key')}: {type(exc).__name__}: {exc}")
        if not res or not res.get("finished"):
            if now > start + timedelta(days=VOID_AFTER_DAYS):
                if row.get("status") == "pending":
                    row.update({"status": "void", "payout": row.get("stake"), "profit": 0.0})
                row["settled_at"] = _utc(now)
                settled += 1
            continue
        hg, ag = res.get("home_goals"), res.get("away_goals")
        if hg is None or ag is None or hg == ag:
            print(f"  [WARN] {row.get('game_key')}: like mål ({hg}-{ag}), avregnes ikke")
            continue
        row["ml_outcome"] = "home" if hg > ag else "away"
        row["reg_outcome"] = res.get("outcome") or ""
        _closing(row, nt_by_key.get(row.get("game_key"), []), sharp_by_key.get(row.get("game_key"), []))
        if row.get("status") == "pending":
            won = row["ml_outcome"] == row.get("selection")
            stake = float(row.get("stake") or 0)
            row["payout"] = round(stake * float(row["odds"]), 2) if won else 0.0
            row["profit"] = round(row["payout"] - stake, 2)
            row["status"] = "won" if won else "lost"
        row["settled_at"] = _utc(now)
        settled += 1
    return settled


def _closing(row: Dict[str, Any], nt_recs: List[Dict[str, Any]], sharp_recs: List[Dict[str, Any]]) -> None:
    start = row.get("start_time") or ""
    nt_close = odds_log.last_before(nt_recs, start, _has_ml)
    if nt_close:
        ml = _two_way(nt_close["m"]["ML"])
        row["close_nt_ml_home"], row["close_nt_ml_away"] = ml["home"], ml["away"]
        row["close_at"] = nt_close.get("at")
    source = row.get("sharp_source") or None

    def usable(rec: Dict[str, Any]) -> bool:
        return rec.get("match") == "ok" and sharp_price(rec, source)[1] is not None

    sharp_close = odds_log.last_before(sharp_recs, start, usable)
    if sharp_close:
        _, prices = sharp_price(sharp_close, source)
        row["close_sharp_ml_home"], row["close_sharp_ml_away"] = prices["home"], prices["away"]
        row["p_fair_close_home"] = devig([prices["home"], prices["away"]])[0]

    side = row.get("selection")
    if side not in ("home", "away") or not row.get("odds"):
        return
    close_nt = row.get(f"close_nt_ml_{side}")
    if close_nt:
        row["clv_nt"] = float(row["odds"]) / float(close_nt) - 1
    if row.get("p_fair_close_home") is not None:
        p = row["p_fair_close_home"] if side == "home" else 1 - row["p_fair_close_home"]
        row["clv_sharp"] = float(row["odds"]) * p - 1


# --- sammendrag ---------------------------------------------------------------

def bootstrap_mean_ci(values: Sequence[float], level: float = CI_LEVEL,
                      rounds: int = 5000, seed: int = 20261114):
    """(snitt, nedre, øvre) med fast seed, eller None for under to verdier."""
    values = [float(v) for v in values]
    if len(values) < 2:
        return None
    rng = random.Random(seed)
    n = len(values)
    means = sorted(sum(rng.choice(values) for _ in range(n)) / n for _ in range(rounds))
    lo_i = int((1 - level) / 2 * rounds)
    hi_i = int((1 + level) / 2 * rounds) - 1
    return sum(values) / n, means[lo_i], means[hi_i]


def _clv_stats(rows: Sequence[Dict[str, Any]], field: str) -> Dict[str, Any]:
    values = [r[field] for r in rows if r.get(field) is not None]
    ci = bootstrap_mean_ci(values)
    out: Dict[str, Any] = {"n": len(values), "mean": None, "ci_low": None, "ci_high": None,
                           "positive_share": None}
    if values:
        out["mean"] = round(sum(values) / len(values), 5)
        out["positive_share"] = round(sum(1 for v in values if v > 0) / len(values), 4)
    if ci:
        out["ci_low"], out["ci_high"] = round(ci[1], 5), round(ci[2], 5)
    return out


def summarize(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    bets = [r for r in rows if r.get("status") in {"pending", "won", "lost"}]
    settled = [r for r in bets if r.get("status") in {"won", "lost"}]
    staked = sum(float(r.get("stake") or 0) for r in settled)
    profit = sum(float(r.get("profit") or 0) for r in settled)
    clv_sharp = _clv_stats(bets, "clv_sharp")
    with_sharp = [r for r in rows if r.get("p_fair_home") is not None]
    skip_counts: Dict[str, int] = {}
    for r in rows:
        if r.get("status") == "nobet":
            reason = r.get("skip_reason") or "ukjent"
            skip_counts[reason] = skip_counts.get(reason, 0) + 1
    promotable = (
        clv_sharp["n"] >= TARGET_BETS
        and clv_sharp["ci_low"] is not None
        and clv_sharp["ci_low"] > 0
    )
    return {
        "games": len(rows),
        "games_with_sharp": len(with_sharp),
        "bets": len(bets),
        "open": sum(1 for r in bets if r.get("status") == "pending"),
        "settled": len(settled),
        "won": sum(1 for r in settled if r.get("status") == "won"),
        "staked": round(staked, 2),
        "profit": round(profit, 2),
        "roi": round(profit / staked, 5) if staked else None,
        "clv_sharp": clv_sharp,
        "clv_nt": _clv_stats(bets, "clv_nt"),
        "skip_reasons": dict(sorted(skip_counts.items(), key=lambda kv: -kv[1])),
        "target_bets": TARGET_BETS,
        "progress": round(min(1.0, clv_sharp["n"] / TARGET_BETS), 4),
        "promotable": promotable,
    }


# --- eksport til frontend (strategy-ml.json) -----------------------------------

EXPORT_FIELDS = [
    "date", "game_key", "start_time", "home_abbr", "away_abbr", "decided_at", "status",
    "selection", "odds", "ev", "ev_home", "ev_away", "stake", "skip_reason", "nt_ml_home", "nt_ml_away",
    "sharp_source", "sharp_ml_home", "sharp_ml_away", "p_fair_home", "p_nt_home",
    "p_model_ml_home", "ml_outcome", "reg_outcome", "profit", "clv_sharp", "clv_nt",
    "close_nt_ml_home", "close_nt_ml_away", "p_fair_close_home",
]


def _export_value(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, 5)
    return value if value not in ("",) else None


def export_payload(
    rows: Sequence[Dict[str, Any]],
    generated_at: str,
    runs: Sequence[Dict[str, Any]] = (),
    portfolio_same_period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Alt /marked trenger: parametere, sammendrag, siste kjøring og radene
    (nyeste kamp først). Sammenligningen med dagens portefølje regnes av
    kalleren, som har bet-loggene.
    """
    last = dict(runs[-1]) if runs else {}
    last_sharp = next((dict(r) for r in reversed(runs) if r.get("sharp_status")), {})

    def as_int(value: Any) -> Optional[int]:
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None

    ordered = sorted(rows, key=lambda r: (r.get("start_time") or "", r.get("game_key") or ""), reverse=True)
    return {
        "generated_at": generated_at,
        "strategy": STRATEGY,
        "params": {
            "ev_min": EV_MIN,
            "max_odds": MAX_ODDS,
            "stake": STAKE,
            "target_bets": TARGET_BETS,
            "ci_level": CI_LEVEL,
            "devig": DEFAULT_METHOD,
            "sharp_sources": list(SHARP_SOURCES),
            "max_deviation": MAX_DEVIATION,
        },
        "summary": summarize(rows),
        "portfolio_same_period": portfolio_same_period,
        "status": {
            "last_run_at": last.get("run_at") or None,
            "last_job": last.get("job") or None,
            "sharp_status": last_sharp.get("sharp_status") or None,
            "sharp_matched": as_int(last_sharp.get("sharp_matched")),
            "nt_events": as_int(last_sharp.get("nt_events")),
            "quota_remaining": as_int(last_sharp.get("quota_remaining")),
            "first_decision": min((r.get("date") or "" for r in rows), default="") or None,
        },
        "rows": [{k: _export_value(r.get(k)) for k in EXPORT_FIELDS} for r in ordered],
    }
