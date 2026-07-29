#!/usr/bin/env python3
"""
Teoretisk analyse: hva hadde skjedd om innsatsen ble skalert etter forventet
avkastning (EV) i stedet for flat 100 kr?

Kjører rent på den ferdig avregnede historikken i data/bet_history.csv – ingen
nettverk, ingen modellkjøring, ingenting skrives til loggene. Hver rad har både
odds, modellsannsynlighet og faktisk utfall, så vi kan regne om resultatet under
en vilkårlig innsatsregel uten å endre hvilke spill som ble tatt.

To spørsmål besvares:

  1. Er EV i det hele tatt informativ om realisert avkastning? (bøtte-tabellen +
     regresjonen). Uten det er all innsatsskalering på EV bare varians.
  2. Hva ville hvert innsatsregime gitt i kroner og ROI? Alle regimer normaliseres
     til samme totale omsetning som flat innsats, ellers sammenligner vi
     risikonivå og ikke regel.

Kjør:
    cd NHL && python analyze_stake_sizing.py
    NHL_STAKE_ANALYSIS_JSON=out.json python analyze_stake_sizing.py   # dumper tall
"""
from __future__ import annotations

import csv
import json
import math
import os
import random
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

BASE_DIR = Path(__file__).resolve().parent
BET_HISTORY_PATH = BASE_DIR / "data" / "bet_history.csv"
FLAT_STAKE = 100.0
BOOTSTRAP_ROUNDS = 20_000
BOOTSTRAP_SEED = 20260729

# Kalibreringsfaktoren fra PROBLEMS.md: modellen forventet 85,5 treff der 68
# skjedde. Vi bruker den til å teste et "krympet" Kelly-regime.
SHRINK_TOWARD_MARKET = 0.5


# --------------------------------------------------------------------------- #
# Data
# --------------------------------------------------------------------------- #
def load_settled_bets(path: Path = BET_HISTORY_PATH) -> List[Dict]:
    """Avregnede spill fra historikken. Pending-rader har ikke noe utfall å måle."""
    rows: List[Dict] = []
    with open(path, newline="", encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            if raw.get("status") not in {"won", "lost"}:
                continue
            rows.append({
                "date": raw["date"],
                "selection": raw["selection"],
                "odds": float(raw["odds"]),
                "model_prob": float(raw["model_prob"]),
                "implied_prob": float(raw["implied_prob"]),
                "value": float(raw["value"]),
                "won": raw["status"] == "won",
                "home_abbr": raw.get("home_abbr", ""),
                "away_abbr": raw.get("away_abbr", ""),
            })
    rows.sort(key=lambda r: (r["date"], r["home_abbr"], r["away_abbr"]))
    return rows


def profit_per_krone(bet: Dict) -> float:
    """Resultat per krone satset: odds-1 ved treff, -1 ellers."""
    return (bet["odds"] - 1.0) if bet["won"] else -1.0


# --------------------------------------------------------------------------- #
# Innsatsregler. Hver returnerer en *vekt* – normaliseres til lik omsetning.
# --------------------------------------------------------------------------- #
def w_flat(bet: Dict) -> float:
    return 1.0


def w_linear_ev(bet: Dict) -> float:
    return max(bet["value"], 0.0)


def w_ev_squared(bet: Dict) -> float:
    return max(bet["value"], 0.0) ** 2


def w_inverse_ev(bet: Dict) -> float:
    """Kontrarisk: mest på de *laveste* EV-ene. Med en overkonfident modell er
    dette ikke et stråmannsregime – det er hypotesen om at høy EV er støy."""
    return 1.0 / max(bet["value"], 1e-6)


def _kelly_fraction(prob: float, odds: float) -> float:
    """f* = (p*o - 1) / (o - 1). Negativ edge -> ingen innsats."""
    if odds <= 1.0:
        return 0.0
    return max((prob * odds - 1.0) / (odds - 1.0), 0.0)


def w_kelly(bet: Dict) -> float:
    return _kelly_fraction(bet["model_prob"], bet["odds"])


def w_kelly_shrunk(bet: Dict) -> float:
    """
    Kelly på en sannsynlighet krympet lineært mot markedet, siden modellen er
    systematisk overkonfident (se PROBLEMS.md).

    Merk: dette endrer *ikke* rangeringen mellom spill. Siden implied_prob er
    nøyaktig 1/odds gir λ·(1/o) + (1-λ)·p at p_krympet·o - 1 = (1-λ)·(p·o - 1),
    så Kelly-brøken blir bare skalert med (1-λ). Lineær krymping mot markedet
    *er* fraksjonell Kelly. Regelen står igjen for å vise nettopp det.
    """
    p = (
        SHRINK_TOWARD_MARKET * bet["implied_prob"]
        + (1.0 - SHRINK_TOWARD_MARKET) * bet["model_prob"]
    )
    return _kelly_fraction(p, bet["odds"])


def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1.0 - 1e-6)
    return math.log(p / (1.0 - p))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def fit_platt(bets: Sequence[Dict], iterations: int = 5_000, lr: float = 0.05) -> tuple[float, float]:
    """
    Platt-skalering: p_kal = σ(a·logit(p) + b), fittet på log-loss mot faktisk
    utfall. To parametere trengs – ren temperaturskalering (b = 0) kan ikke nå
    ned til den observerte treffraten, siden λ → 0 låser alt på 50 %.

    Fittet er in-sample og dermed optimistisk: dette er en øvre grense for hva
    kalibrering kunne gitt, ikke et resultat man kan forvente ut-av-utvalg.
    """
    if not bets:
        return 1.0, 0.0
    xs = [_logit(b["model_prob"]) for b in bets]
    ys = [1.0 if b["won"] else 0.0 for b in bets]
    n = len(bets)
    a, b = 1.0, 0.0
    for _ in range(iterations):
        ga = gb = 0.0
        for x, y in zip(xs, ys):
            err = _sigmoid(a * x + b) - y
            ga += err * x
            gb += err
        a -= lr * ga / n
        b -= lr * gb / n
    return a, b


_PLATT: tuple[float, float] = (1.0, 0.0)  # settes av report() før reglene brukes


def calibrated_prob(bet: Dict) -> float:
    a, b = _PLATT
    return _sigmoid(a * _logit(bet["model_prob"]) + b)


def w_kelly_calibrated(bet: Dict) -> float:
    """Kelly på Platt-kalibrert sannsynlighet – endrer rangeringen, ikke bare nivået."""
    return _kelly_fraction(calibrated_prob(bet), bet["odds"])


WALK_FORWARD_MIN_SAMPLE = 40


def attach_walk_forward_calibration(bets: List[Dict]) -> int:
    """
    Kalibrerer kronologisk: for hvert spill fittes Platt kun på spill som var
    ferdigspilt før den datoen. Dette er den eneste varianten som kunne vært
    brukt i praksis – in-sample-fittet over ser framover og er derfor ubrukelig
    som anslag. Før vi har `WALK_FORWARD_MIN_SAMPLE` avregnede spill finnes det
    ikke noe å kalibrere på, og vi faller tilbake til ukalibrert sannsynlighet.

    Returnerer antall spill som faktisk fikk en kalibrert sannsynlighet.
    """
    ordered = sorted(bets, key=lambda b: b["date"])
    calibrated = 0
    for i, bet in enumerate(ordered):
        history = [h for h in ordered[:i] if h["date"] < bet["date"]]
        if len(history) < WALK_FORWARD_MIN_SAMPLE:
            bet["wf_prob"] = bet["model_prob"]
            continue
        a, b = fit_platt(history, iterations=1_500)
        bet["wf_prob"] = _sigmoid(a * _logit(bet["model_prob"]) + b)
        calibrated += 1
    return calibrated


def w_kelly_walk_forward(bet: Dict) -> float:
    """Kelly på kronologisk kalibrert sannsynlighet – ingen framoverskuing."""
    return _kelly_fraction(bet.get("wf_prob", bet["model_prob"]), bet["odds"])


def w_inverse_odds(bet: Dict) -> float:
    """
    Ignorerer EV helt og satser omvendt proporsjonalt med (odds-1), altså med
    utfallets varians. Kelly gjør dette *i tillegg til* å vekte på EV, så
    forskjellen mellom denne og Kelly viser hvor mye EV-leddet faktisk bidrar.
    """
    return 1.0 / max(bet["odds"] - 1.0, 1e-6)


def w_tiered(bet: Dict) -> float:
    """Grov trappetrinnsmodell – det folk flest mener med «litt mer på de beste»."""
    v = bet["value"]
    if v < 0.20:
        return 0.5
    if v < 0.30:
        return 1.0
    if v < 0.45:
        return 1.5
    return 2.0


def w_capped_ev(bet: Dict) -> float:
    """Lineær i EV, men taket på 2x flat innsats – demper halen."""
    return min(max(bet["value"], 0.0) / 0.30, 2.0)


SCHEMES: List[tuple[str, Callable[[Dict], float]]] = [
    ("Flat (dagens)", w_flat),
    ("Lineær i EV", w_linear_ev),
    ("EV i annen (aggressiv)", w_ev_squared),
    ("Kelly (rå modellprob)", w_kelly),
    ("Kelly (krympet 50% mot marked)", w_kelly_shrunk),
    ("Kelly (Platt, in-sample*)", w_kelly_calibrated),
    ("Kelly (Platt, walk-forward)", w_kelly_walk_forward),
    ("Trappetrinn 0.5/1/1.5/2x", w_tiered),
    ("Lineær i EV, tak 2x", w_capped_ev),
    ("Invers EV (kontrarisk)", w_inverse_ev),
    ("Kun 1/(odds-1), ignorer EV", w_inverse_odds),
]


def apply_scheme(
    bets: Sequence[Dict],
    weight_fn: Callable[[Dict], float],
    budget: Optional[float] = None,
) -> Dict:
    """
    Normaliserer vektene slik at total omsetning blir `budget` (default: samme
    som flat innsats på hele utvalget). Da måler vi regelen, ikke risikonivået.
    """
    if not bets:
        return {"n": 0, "staked": 0.0, "profit": 0.0, "roi": 0.0, "stakes": []}

    budget = budget if budget is not None else FLAT_STAKE * len(bets)
    weights = [max(weight_fn(b), 0.0) for b in bets]
    total_w = sum(weights)
    if total_w <= 0:
        return {"n": len(bets), "staked": 0.0, "profit": 0.0, "roi": 0.0, "stakes": []}

    stakes = [budget * w / total_w for w in weights]
    profit = sum(s * profit_per_krone(b) for s, b in zip(stakes, bets))
    staked = sum(stakes)
    return {
        "n": len(bets),
        "staked": staked,
        "profit": profit,
        "roi": profit / staked if staked else 0.0,
        "stakes": stakes,
        "max_stake": max(stakes),
        "min_stake": min(stakes),
    }


# --------------------------------------------------------------------------- #
# Diagnostikk: er EV informativ i det hele tatt?
# --------------------------------------------------------------------------- #
def ev_buckets(
    bets: Sequence[Dict],
    n_buckets: int = 4,
    key: str = "value",
) -> List[Dict]:
    """Deler spillene i like store bøtter etter `key` og måler faktisk avkastning."""
    if not bets:
        return []
    ordered = sorted(bets, key=lambda b: b[key])
    out: List[Dict] = []
    for i in range(n_buckets):
        chunk = ordered[i * len(ordered) // n_buckets : (i + 1) * len(ordered) // n_buckets]
        if not chunk:
            continue
        hits = sum(1 for b in chunk if b["won"])
        pnl = sum(profit_per_krone(b) for b in chunk)
        out.append({
            "ev_lo": chunk[0][key],
            "ev_hi": chunk[-1][key],
            "n": len(chunk),
            "hits": hits,
            "hit_rate": hits / len(chunk),
            "model_expected": sum(b["model_prob"] for b in chunk),
            "market_expected": sum(b["implied_prob"] for b in chunk),
            "roi": pnl / len(chunk),
            "profit_flat": pnl * FLAT_STAKE,
        })
    return out


def ev_return_correlation(bets: Sequence[Dict], key: str = "value") -> Dict:
    """
    Pearson-korrelasjon mellom `key` og realisert avkastning per krone, med
    permutasjonstest. Er den ikke signifikant positiv, finnes det ikke noe
    signal å skalere innsatsen etter.
    """
    n = len(bets)
    if n < 3:
        return {"n": n, "r": 0.0, "p_value": 1.0, "slope": 0.0}

    xs = [b[key] for b in bets]
    ys = [profit_per_krone(b) for b in bets]
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    r = sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0
    slope = sxy / sxx if sxx > 0 else 0.0

    rng = random.Random(BOOTSTRAP_SEED)
    shuffled = list(ys)
    extreme = 0
    rounds = 10_000
    for _ in range(rounds):
        rng.shuffle(shuffled)
        s = sum((x - mx) * (y - my) for x, y in zip(xs, shuffled))
        if abs(s) >= abs(sxy):
            extreme += 1
    return {"n": n, "r": r, "slope": slope, "p_value": (extreme + 1) / (rounds + 1)}


def bootstrap_difference(
    bets: Sequence[Dict],
    weight_fn: Callable[[Dict], float],
    rounds: int = BOOTSTRAP_ROUNDS,
) -> Dict:
    """
    Trekker spill med tilbakelegging og måler differansen i resultat mellom
    regelen og flat innsats ved lik omsetning. Gir et anslag på hvor mye av
    forskjellen som er varians.
    """
    if not bets:
        return {"mean": 0.0, "lo": 0.0, "hi": 0.0, "p_better": 0.0}

    rng = random.Random(BOOTSTRAP_SEED)
    budget = FLAT_STAKE * len(bets)
    pk = [profit_per_krone(b) for b in bets]
    w = [max(weight_fn(b), 0.0) for b in bets]

    diffs: List[float] = []
    better = 0
    idx_range = range(len(bets))
    for _ in range(rounds):
        idx = [rng.randrange(len(bets)) for _ in idx_range]
        tw = sum(w[i] for i in idx)
        if tw <= 0:
            continue
        scheme_profit = sum(budget * w[i] / tw * pk[i] for i in idx)
        flat_profit = sum(FLAT_STAKE * pk[i] for i in idx)
        d = scheme_profit - flat_profit
        diffs.append(d)
        if d > 0:
            better += 1

    diffs.sort()
    if not diffs:
        return {"mean": 0.0, "lo": 0.0, "hi": 0.0, "p_better": 0.0}
    return {
        "mean": sum(diffs) / len(diffs),
        "lo": diffs[int(0.025 * len(diffs))],
        "hi": diffs[int(0.975 * len(diffs)) - 1],
        "p_better": better / len(diffs),
    }


def compound_bankroll(
    bets: Sequence[Dict],
    weight_fn: Callable[[Dict], float],
    start_bankroll: float = 20_000.0,
    scale: float = 1.0,
    max_fraction: float = 0.25,
) -> Dict:
    """
    Ekte Kelly er multiplikativ: innsats er en andel av *nåværende* bankrull.
    Spill samme dag avgjøres samtidig, så de deler bankrullen ved dagens start.
    """
    bankroll = start_bankroll
    lowest = start_bankroll
    by_date: Dict[str, List[Dict]] = {}
    for b in bets:
        by_date.setdefault(b["date"], []).append(b)

    path: List[Dict] = []
    for day in sorted(by_date):
        day_bets = by_date[day]
        fractions = [min(max(weight_fn(b), 0.0) * scale, max_fraction) for b in day_bets]
        total_fraction = sum(fractions)
        if total_fraction > max_fraction:  # ikke risiker mer enn taket på én dag
            fractions = [f * max_fraction / total_fraction for f in fractions]
        day_pnl = sum(bankroll * f * profit_per_krone(b) for f, b in zip(fractions, day_bets))
        bankroll += day_pnl
        lowest = min(lowest, bankroll)
        path.append({"date": day, "bankroll": bankroll})
        if bankroll <= 0:
            break

    return {
        "start": start_bankroll,
        "end": bankroll,
        "growth": bankroll / start_bankroll - 1.0,
        "lowest": lowest,
        "max_drawdown": 1.0 - lowest / start_bankroll,
        "path": path,
    }


# --------------------------------------------------------------------------- #
# Rapport
# --------------------------------------------------------------------------- #
def _fmt_pct(x: float) -> str:
    return f"{x * 100:+.1f} %"


def report(bets: List[Dict], label: str) -> Dict:
    global _PLATT

    print("=" * 78)
    print(f"{label}  —  {len(bets)} avregnede spill")
    print("=" * 78)

    if not bets:
        print("Ingen spill i utvalget.\n")
        return {}

    _PLATT = fit_platt(bets)
    hits = sum(1 for b in bets if b["won"])
    print(
        f"Treff {hits}/{len(bets)} ({hits / len(bets):.1%}) · "
        f"modellen forventet {sum(b['model_prob'] for b in bets):.1f} · "
        f"markedet forventet {sum(b['implied_prob'] for b in bets):.1f}"
    )

    print("\n1) Gir høyere EV faktisk høyere avkastning?")
    print(f"{'EV-bøtte':>14} {'n':>4} {'treff':>7} {'modell':>8} {'marked':>8} {'ROI':>9} {'kr (flat)':>11}")
    buckets = ev_buckets(bets)
    for b in buckets:
        print(
            f"{b['ev_lo']:.2f}–{b['ev_hi']:.2f}".rjust(14)
            + f" {b['n']:>4}"
            + f" {b['hit_rate']:>6.1%}"
            + f" {b['model_expected']:>8.1f}"
            + f" {b['market_expected']:>8.1f}"
            + f" {_fmt_pct(b['roi']):>9}"
            + f" {b['profit_flat']:>+11.0f}"
        )

    corr = ev_return_correlation(bets)
    print(
        f"\n   Korrelasjon EV ↔ avkastning per krone: r = {corr['r']:+.3f} "
        f"(permutasjonstest p = {corr['p_value']:.3f})"
    )
    if corr["p_value"] > 0.05:
        print("   → ingen målbar sammenheng. Innsatsskalering på EV har ikke noe å ta tak i.")

    print("\n   Til sammenligning, samme tabell etter odds (ikke EV):")
    print(f"{'Odds-bøtte':>14} {'n':>4} {'treff':>7} {'modell':>8} {'marked':>8} {'ROI':>9} {'kr (flat)':>11}")
    odds_rows = ev_buckets(bets, key="odds")
    for b in odds_rows:
        print(
            f"{b['ev_lo']:.2f}–{b['ev_hi']:.2f}".rjust(14)
            + f" {b['n']:>4}"
            + f" {b['hit_rate']:>6.1%}"
            + f" {b['model_expected']:>8.1f}"
            + f" {b['market_expected']:>8.1f}"
            + f" {_fmt_pct(b['roi']):>9}"
            + f" {b['profit_flat']:>+11.0f}"
        )

    odds_corr = ev_return_correlation(bets, key="odds")
    print(
        f"   Korrelasjon odds ↔ avkastning per krone: r = {odds_corr['r']:+.3f} "
        f"(permutasjonstest p = {odds_corr['p_value']:.3f})"
    )

    survivors = sum(1 for b in bets if calibrated_prob(b) * b["odds"] > 1.0)
    wf_count = attach_walk_forward_calibration(bets)
    print(
        f"\n   Platt-kalibrering (in-sample): p_kal = σ({_PLATT[0]:.3f}·logit(p) {_PLATT[1]:+.3f}). "
        f"Etter kalibrering har {survivors} av {len(bets)} spill fortsatt positiv EV."
    )
    print(
        f"   Walk-forward-kalibrering rakk å dekke {wf_count} av {len(bets)} spill "
        f"(krever {WALK_FORWARD_MIN_SAMPLE} avregnede spill før første fit)."
    )

    print("\n2) Resultat per innsatsregel (lik total omsetning som flat innsats)")
    print("   * in-sample-raden er fittet på de samme utfallene den måles på – ikke et anslag.")
    print(
        "   Normaliseringen bruker summen av vekter over hele utvalget, altså litt "
        "framoverskuing i nivået (ikke i rangeringen). Seksjon 4 er fri for det."
    )
    baseline = apply_scheme(bets, w_flat)
    print(
        f"{'Regel':<32} {'omsetning':>11} {'resultat':>10} {'ROI':>9} "
        f"{'vs flat':>10} {'innsats min–maks':>20}"
    )
    scheme_rows: List[Dict] = []
    for name, fn in SCHEMES:
        res = apply_scheme(bets, fn)
        delta = res["profit"] - baseline["profit"]
        print(
            f"{name:<32} {res['staked']:>11,.0f} {res['profit']:>+10,.0f} "
            f"{_fmt_pct(res['roi']):>9} {delta:>+10,.0f} "
            + f"{res['min_stake']:.0f}–{res['max_stake']:.0f} kr".rjust(20)
        )
        scheme_rows.append({
            "name": name,
            "staked": res["staked"],
            "profit": res["profit"],
            "roi": res["roi"],
            "delta_vs_flat": delta,
            "min_stake": res["min_stake"],
            "max_stake": res["max_stake"],
        })

    print("\n3) Hvor mye av forskjellen er varians? (bootstrap, 95 %-intervall for kr vs flat)")
    boots: Dict[str, Dict] = {}
    for name, fn in SCHEMES:
        if name == "Flat (dagens)":
            continue
        bs = bootstrap_difference(bets, fn)
        boots[name] = bs
        print(
            f"{name:<32} snitt {bs['mean']:>+8,.0f} kr  "
            f"[{bs['lo']:>+8,.0f}, {bs['hi']:>+8,.0f}]  "
            f"bedre enn flat i {bs['p_better']:.0%} av trekningene"
        )

    print("\n4) Ekte Kelly med sammensatt bankrull (start 20 000 kr, tak 25 % per dag)")
    print(f"{'Regel':<32} {'slutt':>11} {'vekst':>10} {'bunn':>11} {'maks fall':>10}")
    compounds: Dict[str, Dict] = {}
    kelly_variants = [
        ("Full Kelly (rå prob)", w_kelly, 1.0),
        ("Halv Kelly (rå prob)", w_kelly, 0.5),
        ("Kvart Kelly (rå prob)", w_kelly, 0.25),
        ("Halv Kelly (krympet prob)", w_kelly_shrunk, 0.5),
        ("Flat 100 kr (referanse)", None, 0.0),
    ]
    for name, fn, scale in kelly_variants:
        if fn is None:
            flat_end = 20_000.0 + baseline["profit"]
            compounds[name] = {
                "end": flat_end,
                "growth": flat_end / 20_000.0 - 1.0,
                "lowest": flat_end,
                "max_drawdown": 0.0,
            }
            print(
                f"{name:<32} {flat_end:>11,.0f} {_fmt_pct(flat_end / 20_000 - 1):>10} "
                f"{'–':>11} {'–':>10}"
            )
            continue
        res = compound_bankroll(bets, fn, scale=scale)
        compounds[name] = {k: v for k, v in res.items() if k != "path"}
        print(
            f"{name:<32} {res['end']:>11,.0f} {_fmt_pct(res['growth']):>10} "
            f"{res['lowest']:>11,.0f} {_fmt_pct(-res['max_drawdown']):>10}"
        )

    print()
    return {
        "label": label,
        "n": len(bets),
        "hits": hits,
        "buckets": buckets,
        "odds_buckets": odds_rows,
        "correlation": corr,
        "odds_correlation": odds_corr,
        "platt": {"a": _PLATT[0], "b": _PLATT[1], "positive_ev_after": survivors},
        "schemes": scheme_rows,
        "bootstrap": boots,
        "compound": compounds,
    }


def main() -> None:
    bets = load_settled_bets()
    no_draw = [b for b in bets if b["selection"] != "draw"]

    print()
    out = {
        "all": report(bets, "Hele historikken (inkl. OT/SO-spill vi ikke tar lenger)"),
        "no_draw": report(no_draw, "Uten OT/SO – regimet vi faktisk spiller i dag"),
    }

    dest = os.environ.get("NHL_STAKE_ANALYSIS_JSON")
    if dest:
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        print(f"Skrev tall til {dest}")


if __name__ == "__main__":
    main()
