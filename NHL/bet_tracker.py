# bet_tracker.py
"""
Daglig oppdatering av verdibets og enkel bankrulle-tracking.

Hovedfunksjoner:
  - update_daily_bets(): henter dagens beste value-bet per dag, lagrer til CSV.
  - settle_pending_bets(): sjekker ferdigspilte kamper og oppdaterer utfall/profit.
  - build_portfolio_payload(): gir data til graf (investert vs verdi).
"""
from __future__ import annotations

import csv
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from live.live_feature_builder import build_live_features
from live.nt_odds import get_nhl_matches_range
from live.nhl_api import get_scoreboard
from utils.feature_engineering import DEFAULT_WINDOWS
from utils.model_utils import load_model

BASE_DIR = Path(__file__).resolve().parent
BET_HISTORY_PATH = BASE_DIR / "data" / "bet_history.csv"
MODEL_PATH = BASE_DIR / "models" / "nhl_model.pkl"
DEFAULT_STAKE = 100.0

BET_FIELDS = [
    "date",
    "event_id",
    "start_time",
    "home_abbr",
    "away_abbr",
    "selection",
    "odds",
    "model_prob",
    "implied_prob",
    "value",
    "stake",
    "status",
    "payout",
    "profit",
    "actual_outcome",
    "created_at",
    "updated_at",
]


def implied_probability(odds: Optional[float]) -> Optional[float]:
    if odds is None or odds <= 1e-9:
        return None
    return 1 / odds


def normalize_probs(*probs: Optional[float]) -> Tuple[float, ...]:
    clean = [p if p is not None else 0.0 for p in probs]
    total = sum(clean)
    if total <= 0:
        return tuple(0.0 for _ in clean)
    return tuple(p / total for p in clean)


def evaluate_value(model_prob: float, implied_prob: Optional[float]) -> Optional[float]:
    if implied_prob is None:
        return None
    return model_prob - implied_prob


def _parse_iso(dt: Optional[str]) -> Optional[datetime]:
    if not dt:
        return None
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    except Exception:
        return None


def normalize_event_id(
    raw_event_id: Any,
    home_abbr: Optional[str],
    away_abbr: Optional[str],
    start_time: Optional[str],
    date_str: Optional[str] = None,
) -> str:
    """
    Sikrer stabil event_id:
      - numeric ids får fjernet .0
      - ellers faller vi tilbake til H-A-YYYY-MM-DD når mulig
    """
    raw_str = str(raw_event_id).strip() if raw_event_id is not None else ""
    if raw_str:
        try:
            as_float = float(raw_str)
            if as_float.is_integer():
                return str(int(as_float))
            # Ikke-heltallige tall-id'er er ustabile -> vi lager vår egen nedenfor
            raw_str = ""
        except Exception:
            return raw_str

    parsed_start = _parse_iso(start_time)
    date_part = (date_str or "")[:10]
    if not date_part and parsed_start:
        date_part = parsed_start.strftime("%Y-%m-%d")

    if home_abbr and away_abbr and date_part:
        return f"{home_abbr}-{away_abbr}-{date_part}"
    if home_abbr and away_abbr and start_time:
        return f"{home_abbr}-{away_abbr}-{start_time}"

    return raw_str or str(raw_event_id or "").strip()


def _read_csv(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            row: Dict[str, Any] = dict(raw)
            row["stake"] = float(row.get("stake") or 0.0)
            row["odds"] = float(row.get("odds") or 0.0)
            row["model_prob"] = float(row.get("model_prob") or 0.0)
            row["implied_prob"] = float(row.get("implied_prob") or 0.0)
            row["value"] = float(row.get("value") or 0.0)
            row["payout"] = float(row.get("payout") or 0.0)
            row["profit"] = float(row.get("profit") or 0.0)
            rows.append(row)
    return rows


def _write_csv(path: Path, rows: Sequence[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=BET_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in BET_FIELDS})


def load_history(path: Path = BET_HISTORY_PATH) -> List[Dict[str, Any]]:
    return _read_csv(path)


def save_history(rows: Sequence[Dict[str, Any]], path: Path = BET_HISTORY_PATH) -> None:
    _write_csv(path, rows)


def _flatten_scoreboard_games(scoreboard: Dict[str, Any]) -> List[Dict[str, Any]]:
    if "gamesByDate" in scoreboard and scoreboard["gamesByDate"]:
        games: List[Dict[str, Any]] = []
        for day in scoreboard["gamesByDate"]:
            games.extend(day.get("games", []))
        return games
    return scoreboard.get("games", []) or []


def _lookup_result(game_date: str, home_abbr: str, away_abbr: str) -> Optional[Dict[str, Any]]:
    sb = get_scoreboard(game_date)
    for game in _flatten_scoreboard_games(sb):
        home = game.get("homeTeam", {}).get("abbrev")
        away = game.get("awayTeam", {}).get("abbrev")
        if home != home_abbr or away != away_abbr:
            continue

        state = (game.get("gameState") or "").upper()
        if state not in {"OFF", "FINAL"}:
            return {"finished": False}

        home_goals = game.get("homeTeam", {}).get("score")
        away_goals = game.get("awayTeam", {}).get("score")
        if home_goals is None or away_goals is None:
            return {"finished": False}

        if home_goals > away_goals:
            outcome = "home"
        elif away_goals > home_goals:
            outcome = "away"
        else:
            outcome = "draw"

        return {
            "finished": True,
            "outcome": outcome,
            "home_goals": home_goals,
            "away_goals": away_goals,
        }
    return None


def _choose_best_per_day(
    games: Sequence[Dict[str, Any]],
    min_value: float = 0.0,
) -> List[Dict[str, Any]]:
    best: Dict[str, Dict[str, Any]] = {}
    for g in games:
        delta = g.get("best_value_delta")
        if delta is None or delta < min_value:
            continue
        date_key = g.get("date") or g.get("start_time", "")[:10]
        if not date_key:
            continue

        existing = best.get(date_key)
        if existing is None or (delta > existing.get("best_value_delta", -1)):
            best[date_key] = g
    return list(best.values())


def _build_value_report(days: int = 1) -> List[Dict[str, Any]]:
    """
    Lager et value-report tilsvarende /value-report endepunktet.
    Returnerer liste med dicts for enkel serialisering.
    """
    model = load_model(str(MODEL_PATH))
    games = get_nhl_matches_range(days)
    report: List[Dict[str, Any]] = []

    for game in games:
        home_abbr = game.get("home_abbr")
        away_abbr = game.get("away_abbr")
        if not home_abbr or not away_abbr:
            continue

        feature_row = build_live_features(
            away_abbr,
            home_abbr,
            windows=DEFAULT_WINDOWS,
        )
        probs = model.predict_proba(feature_row)[0]
        class_prob_map = dict(zip(model.classes_, probs))

        home_prob, draw_prob, away_prob = normalize_probs(
            float(class_prob_map.get(0, 0.0)),
            float(class_prob_map.get(1, 0.0)),
            float(class_prob_map.get(2, 0.0)),
        )

        raw_imp_home = implied_probability(game.get("odds_home"))
        raw_imp_draw = implied_probability(game.get("odds_draw"))
        raw_imp_away = implied_probability(game.get("odds_away"))

        imp_home, imp_draw, imp_away = normalize_probs(
            raw_imp_home if raw_imp_home is not None else 0.0,
            raw_imp_draw if raw_imp_draw is not None else 0.0,
            raw_imp_away if raw_imp_away is not None else 0.0,
        )

        value_home = evaluate_value(home_prob, imp_home if raw_imp_home is not None else None)
        value_draw = evaluate_value(draw_prob, imp_draw if raw_imp_draw is not None else None)
        value_away = evaluate_value(away_prob, imp_away if raw_imp_away is not None else None)

        available = {
            "home": value_home,
            "draw": value_draw,
            "away": value_away,
        }
        available = {k: v for k, v in available.items() if v is not None}

        best_value = None
        best_value_delta = None
        if available:
            best_value, best_value_delta = max(available.items(), key=lambda kv: kv[1])

        raw_start = game.get("startTime") or ""
        start_dt = _parse_iso(raw_start)
        date_str = start_dt.strftime("%Y-%m-%d") if start_dt else ""

        event_id = normalize_event_id(
            game.get("eventId"),
            home_abbr,
            away_abbr,
            raw_start,
            date_str,
        )

        report.append({
            "event_id": event_id,
            "date": date_str,
            "start_time": start_dt.isoformat() if start_dt else raw_start,
            "home": game.get("home"),
            "away": game.get("away"),
            "home_abbr": home_abbr,
            "away_abbr": away_abbr,
            "odds_home": game.get("odds_home"),
            "odds_draw": game.get("odds_draw"),
            "odds_away": game.get("odds_away"),
            "model_home_win": round(home_prob, 3),
            "model_draw": round(draw_prob, 3),
            "model_away_win": round(away_prob, 3),
            "implied_home_prob": round(imp_home, 3) if raw_imp_home is not None else None,
            "implied_draw_prob": round(imp_draw, 3) if raw_imp_draw is not None else None,
            "implied_away_prob": round(imp_away, 3) if raw_imp_away is not None else None,
            "value_home": round(value_home, 3) if value_home is not None else None,
            "value_draw": round(value_draw, 3) if value_draw is not None else None,
            "value_away": round(value_away, 3) if value_away is not None else None,
            "best_value": best_value,
            "best_value_delta": round(best_value_delta, 3) if best_value_delta is not None else None,
        })

    return report


def _build_bet_entry(game: Dict[str, Any], stake: float) -> Optional[Dict[str, Any]]:
    selection = game.get("best_value") or game.get("selection")
    if not selection:
        return None

    raw_start = game.get("start_time") or ""
    start_dt = _parse_iso(raw_start)
    start_time = start_dt.isoformat() if start_dt else (raw_start if isinstance(raw_start, str) else "")

    date_str = game.get("date") or ""
    if not date_str and start_dt:
        date_str = start_dt.strftime("%Y-%m-%d")
    elif not date_str and isinstance(raw_start, str) and len(raw_start) >= 10:
        date_str = raw_start[:10]

    home_abbr = (game.get("home_abbr") or game.get("home") or "") or None
    away_abbr = (game.get("away_abbr") or game.get("away") or "") or None
    if isinstance(home_abbr, str) and home_abbr:
        home_abbr = home_abbr.upper()
    if isinstance(away_abbr, str) and away_abbr:
        away_abbr = away_abbr.upper()

    event_id = normalize_event_id(game.get("event_id"), home_abbr, away_abbr, start_time, date_str)

    odds_lookup = {
        "home": game.get("odds_home"),
        "draw": game.get("odds_draw"),
        "away": game.get("odds_away"),
    }
    model_lookup = {
        "home": game.get("model_home_win"),
        "draw": game.get("model_draw"),
        "away": game.get("model_away_win"),
    }
    implied_lookup = {
        "home": game.get("implied_home_prob"),
        "draw": game.get("implied_draw_prob"),
        "away": game.get("implied_away_prob"),
    }
    value_lookup = {
        "home": game.get("value_home"),
        "draw": game.get("value_draw"),
        "away": game.get("value_away"),
    }

    odds = odds_lookup.get(selection)
    if odds is None:
        return None

    now_iso = datetime.utcnow().isoformat()
    return {
        "date": date_str,
        "event_id": event_id,
        "start_time": start_time,
        "home_abbr": home_abbr,
        "away_abbr": away_abbr,
        "selection": selection,
        "odds": float(odds),
        "model_prob": float(model_lookup.get(selection) or 0.0),
        "implied_prob": float(implied_lookup.get(selection) or 0.0),
        "value": float(value_lookup.get(selection) or 0.0),
        "stake": float(stake),
        "status": "pending",
        "payout": 0.0,
        "profit": 0.0,
        "actual_outcome": "",
        "created_at": now_iso,
        "updated_at": now_iso,
    }


def settle_pending_bets(history: List[Dict[str, Any]]) -> int:
    """
    Oppdaterer resultater for alle bets som har gått ferdig.
    Returnerer antall oppdaterte rader.
    """
    today = date.today()
    updated = 0

    for row in history:
        if row.get("status") != "pending":
            continue

        game_date_str = row.get("date")
        try:
            game_date = datetime.strptime(game_date_str, "%Y-%m-%d").date()
        except Exception:
            continue

        if game_date > today:
            continue  # kamp ikke spilt ennå

        res = _lookup_result(game_date_str, row.get("home_abbr"), row.get("away_abbr"))
        if not res or not res.get("finished"):
            continue

        outcome = res.get("outcome")
        row["actual_outcome"] = outcome

        won = outcome == row.get("selection")
        if won:
            row["payout"] = round(row["stake"] * row["odds"], 2)
            row["profit"] = round(row["payout"] - row["stake"], 2)
            row["status"] = "won"
        else:
            row["payout"] = 0.0
            row["profit"] = -row["stake"]
            row["status"] = "lost"

        row["updated_at"] = datetime.utcnow().isoformat()
        updated += 1

    return updated


def _existing_keys(history: Sequence[Dict[str, Any]]) -> set:
    keys = set()
    for row in history:
        selection = row.get("selection")
        raw_event_id = row.get("event_id")
        keys.add(f"{raw_event_id}|{selection}")
        norm_event_id = normalize_event_id(
            raw_event_id,
            row.get("home_abbr"),
            row.get("away_abbr"),
            row.get("start_time"),
            row.get("date"),
        )
        keys.add(f"{norm_event_id}|{selection}")
    return keys


def record_new_bets(
    history: List[Dict[str, Any]],
    days_ahead: int = 1,
    stake_per_bet: float = DEFAULT_STAKE,
    min_value: float = 0.0,
    prefetched_report: Optional[List[Dict[str, Any]]] = None,
    take_all_prefetched: bool = True,
) -> int:
    """
    Legger til nye spill. Default: beste per dag. Hvis take_all_prefetched=True brukes alle fra prefetched_report.
    """
    report = prefetched_report if prefetched_report is not None else _build_value_report(days_ahead)
    if take_all_prefetched and prefetched_report is not None:
        candidates = report
    else:
        candidates = _choose_best_per_day(report, min_value=min_value)

    existing_keys = _existing_keys(history)
    created = 0

    for game in candidates:
        entry = _build_bet_entry(game, stake_per_bet)
        if not entry:
            continue

        key = f"{entry['event_id']}|{entry['selection']}"
        if key in existing_keys:
            continue

        history.append(entry)
        existing_keys.add(key)
        created += 1

    return created


def update_daily_bets(
    history_path: Path = BET_HISTORY_PATH,
    days_ahead: int = 3,
    stake_per_bet: float = DEFAULT_STAKE,
    min_value: float = 0.01,
    prefetched_report: Optional[List[Dict[str, Any]]] = None,
    take_all_prefetched: bool = False,
) -> Dict[str, Any]:
    """
    Hovedinngangen som kan kjøres i cron/GitHub Actions.
    """
    history = load_history(history_path)
    settled = settle_pending_bets(history)
    created = record_new_bets(
        history,
        days_ahead=days_ahead,
        stake_per_bet=stake_per_bet,
        min_value=min_value,
        prefetched_report=prefetched_report,
        take_all_prefetched=take_all_prefetched,
    )
    save_history(history, history_path)
    portfolio = build_portfolio_payload(history)

    return {
        "created": created,
        "settled": settled,
        "history": history,
        "portfolio": portfolio,
    }


def _group_by_date(history: Sequence[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in history:
        grouped.setdefault(row.get("date", ""), []).append(row)
    return grouped


def build_portfolio_payload(history: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Lager time series med investert og verdi til bruk i graf.
    """
    grouped = _group_by_date(history)

    # Sett opp tidslinje både for innsats og for avregningstidspunkt
    settlement_map: Dict[str, List[Dict[str, Any]]] = {}
    for row in history:
        if row.get("status") == "pending":
            continue
        settled_day = (row.get("updated_at") or "")[:10]
        if settled_day:
            settlement_map.setdefault(settled_day, []).append(row)

    all_dates = sorted(
        {d for d in grouped.keys() if d} | {d for d in settlement_map.keys() if d}
    )

    total_staked = 0.0
    settled_return = 0.0
    series: List[Dict[str, Any]] = []

    for d in all_dates:
        day_bets = grouped.get(d, [])
        day_stake = sum(b.get("stake", 0.0) for b in day_bets)
        day_settled = sum(
            b.get("payout", 0.0) for b in settlement_map.get(d, [])
        )

        total_staked += day_stake
        settled_return += day_settled

        open_stake = sum(
            b.get("stake", 0.0)
            for b in history
            if b.get("status") == "pending" and (b.get("date") or "") <= d
        )
        current_value = settled_return + open_stake

        series.append({
            "date": d,
            "invested": round(total_staked, 2),
            "value": round(current_value, 2),
            "settled_return": round(settled_return, 2),
            "open_stake": round(open_stake, 2),
            "open_bets": sum(
                1
                for b in history
                if b.get("status") == "pending" and (b.get("date") or "") <= d
            ),
        })

    pending_count = sum(1 for b in history if b.get("status") == "pending")
    profit_now = series[-1]["value"] - series[-1]["invested"] if series else 0.0
    roi = (profit_now / series[-1]["invested"]) if series and series[-1]["invested"] else 0.0

    return {
        "timeseries": series,
        "summary": {
            "total_bets": len(history),
            "open_bets": pending_count,
            "total_staked": round(total_staked, 2),
            "settled_return": round(settled_return, 2),
            "current_value": round(series[-1]["value"], 2) if series else 0.0,
            "profit": round(profit_now, 2),
            "roi": round(roi, 3),
        },
        "bets": history,
    }


if __name__ == "__main__":
    result = update_daily_bets()
    print(
        f"Oppdatert: {result['created']} nye bets, {result['settled']} avregnet."
    )
    print("Siste status:")
    for ts in result["portfolio"]["timeseries"][-3:]:
        print(ts)
