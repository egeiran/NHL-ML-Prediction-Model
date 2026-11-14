#!/usr/bin/env python3
"""
Markedsdiagnose: hvor står modellen mot NT-markedet, og hvor kan edge finnes?

Kun stdlib, så den kjører lokalt uten pandas og i CI uten pip install.

    python analyze_market.py            # skriver ../docs/market_analysis.md
    NHL_MARKET_ANALYSIS_MD=... python analyze_market.py

Seksjoner:
  A. Bet-loggene (bet_history ∪ bet_shadow), kamper med full 3-veis NT-odds:
     margin, log loss marked/modell/basisrater (før/etter modellbyttet
     18.10.2026), parret bootstrap, geometrisk blanding, linjebevegelse,
     ROI per oddsbøtte og kalibrering.
  B. Snapshot-loggen (data/odds/): margin per NT-marked, NT-ML mot Pinnacle,
     linjebevegelse morgen → kveld, og tidspunkt-analysen som avgjør om den
     daglige kjøringen bør flyttes.
  C. Skyggestrategien ml-sharp-v1 (data/strategy_ml.csv).

Definisjoner:
  - Marked (HUB) = 1/odds normalisert til sum 1 (multiplikativ devig).
  - Log loss = −ln(p for faktisk utfall), snitt per kamp. Lavere er bedre.
  - Bootstrap: 10 000 trekninger, fast seed, 95 %-intervall på snittdiffen.
  - Seksjoner med for lite data skriver «ikke nok data ennå (n=…)».
"""
from __future__ import annotations

import csv
import math
import os
import random
import statistics as st
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import strategy_ml  # noqa: E402  (kun stdlib)
from utils import odds_log  # noqa: E402
from utils.devig import devig  # noqa: E402

DATA_DIR = BASE_DIR / "data"
DEFAULT_OUT = BASE_DIR.parent / "docs" / "market_analysis.md"
# Første daglige kjøring med logistisk regresjon (commit 6179fab, 17.10.2026).
MODEL_SWITCH = "2026-10-18"
OUTCOMES = ("home", "draw", "away")
MODEL_COLS = {"home": "model_home_win", "draw": "model_draw", "away": "model_away_win"}
SEED = 20261114
BOOT_ROUNDS = 10_000
MIN_N = 30
# Regel for å flytte den daglige kjøringen (beslutning 3).
TIMING_MIN_GAMES = 300


# --- felles -------------------------------------------------------------------

def _f(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _read(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def bootstrap_ci(values: Sequence[float], rounds: int = BOOT_ROUNDS, level: float = 0.95,
                 seed: int = SEED) -> Tuple[float, float]:
    rng = random.Random(seed)
    n = len(values)
    means = sorted(sum(rng.choice(values) for _ in range(n)) / n for _ in range(rounds))
    return means[int((1 - level) / 2 * rounds)], means[int((1 + level) / 2 * rounds) - 1]


def pct(x: Optional[float], digits: int = 1, sign: bool = True) -> str:
    if x is None:
        return "–"
    return f"{x * 100:{'+' if sign else ''}.{digits}f} %".replace(".", ",")


def num(x: Optional[float], digits: int = 4) -> str:
    return "–" if x is None else f"{x:.{digits}f}".replace(".", ",")


def not_enough(n: int, need: int = MIN_N) -> str:
    return f"_Ikke nok data ennå (n={n}, trenger {need})._"


def base_rates(path: Path = DATA_DIR / "game.csv") -> Dict[str, float]:
    """Grunnseriekamper 2005/06–2019/20 i game.csv (duplikater fjernet)."""
    seen = {}
    for r in _read(path):
        if r.get("type") == "R" and 20052006 <= int(r.get("season") or 0) <= 20192020:
            seen[r["game_id"]] = r["outcome"]
    counts = {"home": 0, "draw": 0, "away": 0}
    for outcome in seen.values():
        if "tbc" in outcome:
            continue
        if outcome.endswith(("OT", "SO")):
            counts["draw"] += 1
        elif outcome.startswith("home"):
            counts["home"] += 1
        else:
            counts["away"] += 1
    total = sum(counts.values()) or 1
    return {k: v / total for k, v in counts.items()}


# --- A: bet-loggene -----------------------------------------------------------

def ledger_games() -> List[Dict[str, Any]]:
    """Avgjorte kamper med full 3-veis NT-odds fra begge loggene (én rad per kamp)."""
    rows = {}
    for name in ("bet_history.csv", "bet_shadow.csv"):
        for r in _read(DATA_DIR / name):
            rows.setdefault(r["event_id"], r)
    out = []
    for r in rows.values():
        odds = {k: _f(r.get(f"odds_{k}")) for k in OUTCOMES}
        model = {k: _f(r.get(MODEL_COLS[k])) for k in OUTCOMES}
        y = r.get("actual_outcome")
        if y not in OUTCOMES or not all(odds.values()) or not all(model.values()):
            continue
        inv = {k: 1 / odds[k] for k in OUTCOMES}
        total_inv = sum(inv.values())
        model_total = sum(model.values())
        close = {k: _f(r.get(f"close_odds_{k}")) for k in OUTCOMES}
        out.append({
            "key": r["event_id"], "y": y, "odds": odds, "created": r.get("created_at") or "",
            "start": r.get("start_time") or "", "overround": total_inv,
            "market": {k: inv[k] / total_inv for k in OUTCOMES},
            "model": {k: model[k] / model_total for k in OUTCOMES},
            "close": close if all(close.values()) else None,
        })
    return out


def _ll(p: Dict[str, float], y: str) -> float:
    return -math.log(max(p[y], 1e-12))


def section_ledgers(games: List[Dict[str, Any]], base: Dict[str, float]) -> List[str]:
    lines = ["## A. Modellen mot NT-markedet (HUB, bet-loggene)", ""]
    if len(games) < MIN_N:
        return lines + [not_enough(len(games)), ""]
    over = [g["overround"] for g in games]
    lines += [
        f"{len(games)} avgjorte kamper med full 3-veis NT-odds "
        f"({min(g['created'][:10] for g in games)} – {max(g['created'][:10] for g in games)}).",
        "",
        f"**NT-margin på HUB:** snitt {pct(mean(over) - 1, sign=False)}, median "
        f"{pct(st.median(over) - 1, sign=False)}. Spiller man alt flatt, er det marginen man taper.",
        "",
        "### Log loss (lavere er bedre)",
        "",
        "| Utvalg | n | Basisrater | NT-marked | Modell | Modell − marked (95 % CI) |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    splits = [
        ("Alle", games),
        (f"Før {MODEL_SWITCH} (Random Forest)", [g for g in games if g["created"][:10] < MODEL_SWITCH]),
        (f"Fra {MODEL_SWITCH} (logistisk, dagens)", [g for g in games if g["created"][:10] >= MODEL_SWITCH]),
    ]
    for label, subset in splits:
        if len(subset) < MIN_N:
            lines.append(f"| {label} | {len(subset)} | – | – | – | for få kamper |")
            continue
        diffs = [_ll(g["model"], g["y"]) - _ll(g["market"], g["y"]) for g in subset]
        lo, hi = bootstrap_ci(diffs)
        verdict = "modellen dårligere" if lo > 0 else "modellen bedre" if hi < 0 else "ikke signifikant"
        lines.append(
            f"| {label} | {len(subset)} | {num(mean([_ll(base, g['y']) for g in subset]))} | "
            f"{num(mean([_ll(g['market'], g['y']) for g in subset]))} | "
            f"{num(mean([_ll(g['model'], g['y']) for g in subset]))} | "
            f"{num(mean(diffs))} [{num(lo)}, {num(hi)}] – {verdict} |"
        )

    lines += ["", "### Blanding: p ∝ marked^(1−w) · modell^w (i utvalget, ikke ut-av-utvalg)", "",
              "| w | Log loss |", "| ---: | ---: |"]
    best = None
    for w in (0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0):
        lls = []
        for g in games:
            mix = {k: g["market"][k] ** (1 - w) * g["model"][k] ** w for k in OUTCOMES}
            t = sum(mix.values())
            lls.append(-math.log(mix[g["y"]] / t))
        v = mean(lls)
        best = (w, v) if best is None or v < best[1] else best
        lines.append(f"| {num(w, 1)} | {num(v)} |")
    lines += ["", f"Beste vekt på modellen: **w = {num(best[0], 1)}**. "
              + ("Markedet alene er best – modellen tilfører ikke informasjon utover oddsen."
                 if best[0] == 0 else "Modellen tilfører noe utover markedet i dette utvalget."), ""]

    moved = [g for g in games if g["close"]]
    lines += ["### Linjebevegelse fra beslutning til sluttodds (HUB)", ""]
    if len(moved) < MIN_N:
        lines += [not_enough(len(moved)), ""]
    else:
        dp, agree = [], []
        for g in moved:
            inv = {k: 1 / g["close"][k] for k in OUTCOMES}
            t = sum(inv.values())
            close_home = inv["home"] / t
            dp.append(close_home - g["market"]["home"])
            agree.append(g["model"]["home"] - g["market"]["home"])
        corr = _corr(agree, dp)
        lines += [
            f"{len(moved)} kamper med sluttodds. Snitt |Δp(hjemme)| = {pct(mean([abs(x) for x in dp]), 2, False)}. "
            f"Korrelasjon mellom modellens uenighet med markedet og retningen markedet beveger seg: "
            f"**{num(corr, 3)}**. Nær null betyr at markedet ikke beveger seg mot modellen.",
            "",
        ]

    lines += ["### ROI ved å spille alle utfall flatt, per oddsbøtte", "",
              "| Odds | n | ROI |", "| --- | ---: | ---: |"]
    buckets: Dict[str, List[float]] = defaultdict(list)
    order = ["< 1,70", "1,70–2,10", "2,10–2,60", "2,60–3,30", "≥ 3,30", "Uavgjort"]
    for g in games:
        for k in OUTCOMES:
            o = g["odds"][k]
            if k == "draw":
                b = "Uavgjort"
            else:
                b = ("< 1,70" if o < 1.7 else "1,70–2,10" if o < 2.1 else "2,10–2,60" if o < 2.6
                     else "2,60–3,30" if o < 3.3 else "≥ 3,30")
            buckets[b].append((o if g["y"] == k else 0.0) - 1)
    for b in order:
        if buckets.get(b):
            lines.append(f"| {b} | {len(buckets[b])} | {pct(mean(buckets[b]))} |")
    lines += ["", "Favoritt/longshot-skjevhet: NT tar mer margin på underdogs enn på favoritter.", ""]

    lines += ["### Kalibrering, hjemmeseier (snitt predikert vs. faktisk per tredjedel)", "",
              "| Kilde | Lav | Midt | Høy |", "| --- | --- | --- | --- |"]
    for label, src in (("NT-marked", "market"), ("Modell", "model")):
        ordered = sorted(games, key=lambda g: g[src]["home"])
        n = len(ordered)
        cells = []
        for i in range(3):
            part = ordered[i * n // 3:(i + 1) * n // 3]
            pred = mean([g[src]["home"] for g in part])
            act = mean([1.0 if g["y"] == "home" else 0.0 for g in part])
            cells.append(f"{pct(pred, sign=False)} / {pct(act, sign=False)}")
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    lines.append("")
    return lines


def _corr(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    if len(a) < 3:
        return None
    ma, mb = mean(a), mean(b)
    num_ = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return num_ / den if den else None


# --- B: snapshot-loggen -------------------------------------------------------

def _slot(rec: Dict[str, Any]) -> str:
    """Kjøringen en post kom fra, som klokkeslett i UTC (08, 16, 19, 22, 01)."""
    at = rec.get("at") or ""
    return "08" if rec.get("job") == "daily" else at[11:13]


def _two(prices: Any) -> Optional[Tuple[float, float]]:
    try:
        h, a = float(prices["home"]), float(prices["away"])
    except (KeyError, TypeError, ValueError):
        return None
    return (h, a) if h > 1 and a > 1 else None


def section_snapshots(directory: Optional[Path] = None) -> List[str]:
    lines = ["## B. Snapshot-loggen (alle NT-markeder + Pinnacle)", ""]
    nt = list(odds_log.iter_records("nt", directory))
    sharp = list(odds_log.iter_records("sharp", directory))
    runs = odds_log.read_runs(directory)
    lines.append(f"{len(runs)} kjøringer, {len(nt)} NT-snapshots, {len(sharp)} skarpe snapshots.")
    lines.append("")
    if not nt:
        return lines + [not_enough(0, 1), ""]

    # Margin per marked, fra siste snapshot per kamp.
    latest = {k: v[-1] for k, v in odds_log.by_key(nt).items()}
    margins: Dict[str, List[float]] = defaultdict(list)
    for rec in latest.values():
        for code, content in (rec.get("m") or {}).items():
            if code in {"CS", "HCP", "TT_HOME", "TT_AWAY"}:
                continue
            groups = content.items() if code == "TOTAL" else [("", content)]
            for line, prices in groups:
                vals = [v for v in prices.values() if isinstance(v, (int, float)) and v > 1]
                if len(vals) >= 2:
                    label = f"{code} {line}".strip()
                    margins[label].append(sum(1 / v for v in vals) - 1)
    lines += ["### NT-margin per marked (siste snapshot per kamp)", "",
              "| Marked | Kamper | Snittmargin |", "| --- | ---: | ---: |"]
    names = {"HUB": "HUB (1X2)", "ML": "Vinner inkl. OT", "OT": "Blir det overtid?",
             "DNB": "Uavgjort tilbakebetales"}
    for label in sorted(margins, key=lambda s: (s.split()[0] != "HUB", s.split()[0] != "ML", s)):
        code = label.split()[0]
        pretty = names.get(code, label.replace("TOTAL", "Over/under"))
        lines.append(f"| {pretty} | {len(margins[label])} | {pct(mean(margins[label]), sign=False)} |")
    lines.append("")

    # NT ML: morgen → siste før start.
    nt_by_key = odds_log.by_key(nt)
    moves = []
    for key, recs in nt_by_key.items():
        start = recs[0].get("start") or ""
        morning = next((r for r in recs if r.get("job") == "daily" and _two((r.get("m") or {}).get("ML"))), None)
        close = odds_log.last_before(recs, start, lambda r: _two((r.get("m") or {}).get("ML")) is not None)
        if morning and close and close is not morning:
            p0 = devig(list(_two(morning["m"]["ML"])))[0]
            p1 = devig(list(_two(close["m"]["ML"])))[0]
            moves.append(p1 - p0)
    lines += ["### NT vinner inkl. OT: bevegelse fra morgen (08 UTC) til siste snapshot før start", ""]
    if len(moves) < MIN_N:
        lines += [not_enough(len(moves)), ""]
    else:
        lines += [f"{len(moves)} kamper. Snitt |Δp(hjemme)| = {pct(mean([abs(x) for x in moves]), 2, False)}, "
                  f"andel kamper som flyttet seg > 1 pp: {pct(sum(abs(x) > 0.01 for x in moves) / len(moves), 0, False)}.", ""]

    lines += _sharp_comparison(nt_by_key, sharp)
    lines += _timing(nt_by_key, sharp)
    return lines


def _pin(rec: Optional[Dict[str, Any]]) -> Optional[Tuple[float, float]]:
    if not rec or rec.get("match") != "ok":
        return None
    return _two(((rec.get("books") or {}).get("pinnacle") or {}).get("ML"))


def _sharp_comparison(nt_by_key, sharp) -> List[str]:
    lines = ["### NT vinner inkl. OT mot Pinnacle (samme kjøring)", ""]
    sharp_by_key = odds_log.by_key(sharp)
    diffs, beats, pin_margin = [], [], []
    for key, srecs in sharp_by_key.items():
        for s in srecs:
            pin = _pin(s)
            if not pin:
                continue
            nt_rec = next((r for r in nt_by_key.get(key, []) if r.get("at") == s.get("at")), None)
            ml = _two(((nt_rec or {}).get("m") or {}).get("ML"))
            if not ml:
                continue
            p_fair = devig(list(pin))[0]
            diffs.append(devig(list(ml))[0] - p_fair)
            best_ev = max(p_fair * ml[0] - 1, (1 - p_fair) * ml[1] - 1)
            beats.append(best_ev)
            pin_margin.append(1 / pin[0] + 1 / pin[1] - 1)
    if len(diffs) < MIN_N:
        return lines + [not_enough(len(diffs)), ""]
    return lines + [
        f"{len(diffs)} parvise snapshots. Pinnacles margin: {pct(mean(pin_margin), sign=False)}. "
        f"NT − Pinnacle i margin-fri P(hjemme): snitt {pct(mean(diffs), 2)}, sd {pct(st.pstdev(diffs), 2, False)}.",
        "",
        f"Beste side hos NT har EV > 0 mot Pinnacle i **{pct(sum(b > 0 for b in beats) / len(beats), 1, False)}** "
        f"av tilfellene, EV > 3 % i {pct(sum(b > 0.03 for b in beats) / len(beats), 1, False)}. "
        f"Snitt beste-EV: {pct(mean(beats))}.",
        "",
    ]


def _timing(nt_by_key, sharp) -> List[str]:
    """
    Beslutning 3: lønner det seg å flytte den ene daglige kjøringen senere?
    For hver kamp og hvert kjøretidspunkt: hvilket spill ville strategien tatt
    (EV mot Pinnacle *da* > 3 %), og hva var det verdt mot Pinnacle *ved start*.
    """
    lines = ["### Når bør den daglige kjøringen gå? (beslutning 3)", ""]
    sharp_by_key = odds_log.by_key(sharp)
    # slot → kamp → (EV mot close for spillet strategien ville tatt, 0 uten spill; om det ble spill)
    per_slot: Dict[str, Dict[str, Tuple[float, bool]]] = defaultdict(dict)
    for key, srecs in sharp_by_key.items():
        nt_recs = nt_by_key.get(key, [])
        if not nt_recs:
            continue
        start = nt_recs[0].get("start") or ""
        close = odds_log.last_before(srecs, start, lambda r: _pin(r) is not None)
        if not close:
            continue
        p_close = devig(list(_pin(close)))[0]
        for s in srecs:
            pin = _pin(s)
            if not pin or (s.get("at") or "") >= start:
                continue
            nt_rec = next((r for r in nt_recs if r.get("at") == s.get("at")), None)
            ml = _two(((nt_rec or {}).get("m") or {}).get("ML"))
            if not ml:
                continue
            p_now = devig(list(pin))[0]
            # Samme regel som strategien: beste side etter EV *nå*, så terskel og oddstak.
            sides = ((0, p_now, p_close), (1, 1 - p_now, 1 - p_close))
            i, p_side_now, p_side_close = max(sides, key=lambda t: t[1] * ml[t[0]])
            bet = p_side_now * ml[i] - 1 > strategy_ml.EV_MIN and ml[i] < strategy_ml.MAX_ODDS
            per_slot[_slot(s)][key] = ((p_side_close * ml[i] - 1) if bet else 0.0, bet)
    morning = per_slot.get("08", {})
    if len(morning) < MIN_N:
        return lines + [not_enough(len(morning), TIMING_MIN_GAMES) + " Regelen: flytt bare hvis et senere "
                        f"tidspunkt gir høyere EV mot Pinnacle-close, med 95 %-CI som utelukker 0, "
                        f"på minst {TIMING_MIN_GAMES} kamper.", ""]
    lines += ["| Tidspunkt (UTC) | Kamper | Spill | Snitt EV mot close per kamp | Senere − 08 (95 % CI) |",
              "| --- | ---: | ---: | ---: | --- |"]
    verdicts = []
    morning_ev = {k: v for k, (v, _) in morning.items()}
    for slot in sorted(per_slot, key=lambda s: (s != "08", (int(s) - 8) % 24)):
        cells = per_slot[slot]
        vals = {k: v for k, (v, _) in cells.items()}
        bets = sum(1 for _, b in cells.values() if b)
        cell = "–"
        if slot != "08":
            common = [k for k in vals if k in morning_ev]
            if len(common) >= MIN_N:
                d = [vals[k] - morning_ev[k] for k in common]
                lo, hi = bootstrap_ci(d)
                cell = f"{pct(mean(d), 2)} [{pct(lo, 2)}, {pct(hi, 2)}] (n={len(common)})"
                if len(common) >= TIMING_MIN_GAMES and lo > 0:
                    verdicts.append(slot)
        lines.append(f"| {slot}:xx | {len(vals)} | {bets} | {pct(mean(list(vals.values())), 2)} | {cell} |")
    lines.append("")
    if verdicts:
        lines.append(f"**Flytt kjøringen:** {', '.join(v + ':xx' for v in verdicts)} UTC slår 08 signifikant.")
    else:
        lines.append(f"Ingen senere kjøring slår 08 UTC signifikant på ≥ {TIMING_MIN_GAMES} kamper ennå – behold 08.")
    return lines + [""]


# --- C: strategien ------------------------------------------------------------

def section_strategy(path: Path = strategy_ml.STRATEGY_PATH) -> List[str]:
    rows = strategy_ml.load(path)
    lines = [f"## C. Skyggestrategien {strategy_ml.STRATEGY} (vinner inkl. OT mot Pinnacle)", ""]
    if not rows:
        return lines + ["_Ingen kamper vurdert ennå._", ""]
    s = strategy_ml.summarize(rows)
    clv = s["clv_sharp"]
    lines += [
        f"{s['games']} kamper vurdert, {s['games_with_sharp']} med Pinnacle-pris. "
        f"{s['bets']} spill ({s['open']} åpne), {s['won']} av {s['settled']} avgjorte vunnet, "
        f"resultat {s['profit']:+.0f} kr (ROI {pct(s['roi'])}).",
        "",
        f"**CLV mot Pinnacle-close:** snitt {pct(clv['mean'], 2)} på {clv['n']} spill, 90 %-CI "
        f"[{pct(clv['ci_low'], 2)}, {pct(clv['ci_high'], 2)}]. Fremdrift mot {s['target_bets']} spill: "
        f"{pct(s['progress'], 0, False)}. "
        + ("**Kriteriet for ekte innsats er oppfylt.**" if s["promotable"] else "Kriteriet er ikke oppfylt ennå."),
        "",
    ]
    if s["skip_reasons"]:
        lines += ["Grunner til å la være: " + ", ".join(f"{k} {v}" for k, v in s["skip_reasons"].items()) + ".", ""]
    return lines


def build_report(directory: Optional[Path] = None, strategy_path: Optional[Path] = None) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    base = base_rates()
    lines = [
        "# Markedsanalyse",
        "",
        f"_Generert {now} av `NHL/analyze_market.py`. Kun stdlib; tallene kan gjenskapes lokalt._",
        "",
        f"Basisrater (grunnserie 2005/06–2019/20): hjemme {pct(base['home'], sign=False)}, "
        f"OT/SO {pct(base['draw'], sign=False)}, borte {pct(base['away'], sign=False)}.",
        "",
    ]
    lines += section_ledgers(ledger_games(), base)
    lines += section_snapshots(directory)
    lines += section_strategy(strategy_path or strategy_ml.STRATEGY_PATH)
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    out = Path(os.environ.get("NHL_MARKET_ANALYSIS_MD") or DEFAULT_OUT)
    report = build_report()
    print(report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(report)
    print(f"Skrev {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
