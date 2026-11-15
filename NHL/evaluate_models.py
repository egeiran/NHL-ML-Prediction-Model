#!/usr/bin/env python3
"""
ML-eksperimenter: kan noen modell slå dagens Elo + back-to-back?

Walk-forward per sesong (utvidende vindu fra 2005/06): for hver testsesong
trenes alt på sesongene før, og testes på sesongen. Ingen tuning på
testsesongene – Elo-parametrene velges på valideringssesongene 2010/11–2014/15
(også walk-forward), og testen starter 2015/16.

To mål:
  reg3  utfall etter ordinær tid (hjemme / OT-SO / borte) – NTs HUB-marked
  ml2   vinner inkl. overtid (hjemme / borte) – NTs «Vinner inkl. OT», der
        skyggestrategien spiller

Kandidater:
  M0  basisrater
  M1  dagens modell: logistisk på elo_diff + b2b; ml2 via q (som i prod)
  M2  binær logistisk direkte på ml2, samme features
  M3  tunet Elo (K, hjemmefordel, regresjon, OT-score, margin of victory)
  M4  M3 + hvile/reise (hviledager, 3-på-4, bortetur, hjemmestrekk, tidssoner)
  M5  M4 + MoneyPuck (rullerende 5v5 xGF %, skudd, keeper-GSAx) – bare med
      --moneypuck PATH (all_teams.csv fra moneypuck.com, ikke-kommersiell
      bruk med kreditering)
  M6  HistGradientBoosting på M4-/M5-featurene
  M7  Poisson-målmodell på ordinære mål (gir også totals)

Lekkasjevern: alle features er pre-kamp (Elo før kampen, hvile fra tidligere
datoer, rullerende snitt med shift(1)). Hard feil hvis en testkamp finnes i
treningssettet. 2020/21 (uten publikum) er med, men merket i rapporten.

    python evaluate_models.py                 # game.csv (2000–2020), uten nett
    python evaluate_models.py --with-api      # + NHL-APIet 2020/21 →
    python evaluate_models.py --moneypuck all_teams.csv

Skriver docs/model_eval.md (eller --out).
"""
from __future__ import annotations

import argparse
import contextlib
import io
import itertools
import math
import os
import sys
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from utils.elo import EloConfig, compute_elo_state
from utils.game_history import add_back_to_back, historical_frame, load_games

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_OUT = BASE_DIR.parent / "docs" / "model_eval.md"

FIRST_TRAIN = 20052006
VALID_SEASONS = [20102011, 20112012, 20122013, 20132014, 20142015]
FIRST_TEST = 20152016
FIRST_OT_SEASON = 20152016  # 3-mot-3, samme som train_model.py
COVID_SEASON = 20202021
SEED = 20261114

BASE_FEATURES = ["elo_diff", "home_b2b", "away_b2b"]
REST_FEATURES = [
    "rest_home", "rest_away", "rest_diff", "home_3in4", "away_3in4",
    "away_trip", "home_stand", "tz_shift_home", "tz_shift_away",
]

# Tidssone (UTC-offset, normaltid) per kanonisk lag, for reiseavstand østover/vestover.
TEAM_TZ = {
    "BOS": -5, "BUF": -5, "CAR": -5, "CBJ": -5, "DET": -5, "FLA": -5, "MTL": -5, "NJD": -5,
    "NYI": -5, "NYR": -5, "OTT": -5, "PHI": -5, "PIT": -5, "TBL": -5, "TOR": -5, "WSH": -5,
    "ATL": -5, "CHI": -6, "DAL": -6, "MIN": -6, "NSH": -6, "STL": -6, "WPG": -6,
    "ARI": -7, "PHX": -7, "COL": -7, "CGY": -7, "EDM": -7, "UTA": -7,
    "ANA": -8, "LAK": -8, "SJS": -8, "VAN": -8, "VGK": -8, "SEA": -8,
}


# --- Elo (rask variant for tuning) -------------------------------------------

@dataclass(frozen=True)
class TuneConfig:
    k_factor: float = 6.0
    home_advantage: float = 50.0
    season_regression: float = 0.70
    ot_win_score: float = 0.6
    mov_scale: float = 0.0  # 0 = som prod; >0 skalerer K med målforskjellen
    base_rating: float = 1500.0
    scale: float = 400.0


def fast_elo_diff(ordered: pd.DataFrame, cfg: TuneConfig) -> np.ndarray:
    """
    Pre-kamp elo_diff per rad i `ordered` (sortert og uten duplikater, som
    compute_elo_state). Med mov_scale = 0 er dette nøyaktig prod-Elo – det
    sjekkes i main() før tuningen brukes.
    """
    home = ordered["home_team"].to_numpy()
    away = ordered["away_team"].to_numpy()
    season = ordered["season"].to_numpy()
    hg = ordered["home_goals"].to_numpy(dtype=float)
    ag = ordered["away_goals"].to_numpy(dtype=float)
    ot = ordered["outcome_code"].to_numpy() == 1
    ratings: Dict[str, float] = {}
    last: Dict[str, int] = {}
    out = np.empty(len(ordered))
    base, reg = cfg.base_rating, cfg.season_regression
    for i in range(len(ordered)):
        h, a, s = home[i], away[i], season[i]
        for t in (h, a):
            r = ratings.get(t, base)
            if t in last and last[t] != s:
                r = base + reg * (r - base)
            ratings[t] = r
            last[t] = s
        rh, ra = ratings[h], ratings[a]
        out[i] = rh - ra
        exp = 1.0 / (1.0 + 10.0 ** (-((rh + cfg.home_advantage) - ra) / cfg.scale))
        home_won = hg[i] > ag[i]
        if ot[i]:
            actual = cfg.ot_win_score if home_won else 1.0 - cfg.ot_win_score
        else:
            actual = 1.0 if home_won else 0.0
        k = cfg.k_factor
        if cfg.mov_scale:
            gd = min(abs(hg[i] - ag[i]), 4.0)
            winner_adv = (rh + cfg.home_advantage - ra) * (1 if home_won else -1)
            k *= (1 + cfg.mov_scale * (math.log1p(gd) - math.log(2))) * 2.2 / (winner_adv * 0.001 + 2.2)
        delta = k * (actual - exp)
        ratings[h] = rh + delta
        ratings[a] = ra - delta
    return out


# --- features ----------------------------------------------------------------

def add_rest_travel(games: pd.DataFrame) -> pd.DataFrame:
    """Hvile og reise per lag, bare fra tidligere kamper (punkt-i-tid)."""
    rows = pd.concat(
        [
            games[["game_id", "home_team", "local_date", "season"]].rename(columns={"home_team": "team"})
            .assign(is_home=1, venue=games["home_team"].to_numpy()),
            games[["game_id", "away_team", "local_date", "season"]].rename(columns={"away_team": "team"})
            .assign(is_home=0, venue=games["home_team"].to_numpy()),
        ],
        ignore_index=True,
    ).sort_values(["team", "local_date", "game_id"])
    g = rows.groupby("team")
    prev = g["local_date"].shift(1)
    prev2 = g["local_date"].shift(2)
    same_season = g["season"].shift(1) == rows["season"]
    rest = (rows["local_date"] - prev).dt.days
    rows["rest"] = np.where(same_season, rest.clip(upper=4), 4).astype(float)
    rows["three_in_four"] = (((rows["local_date"] - prev2).dt.days <= 3) & same_season).astype(int)
    tz = rows["venue"].map(TEAM_TZ).fillna(-6)
    prev_tz = g["venue"].shift(1).map(TEAM_TZ).fillna(-6)
    rows["tz_shift"] = np.where(same_season, (tz - prev_tz).abs(), 0.0)
    # Lengde på pågående bortetur / hjemmestrekk, inkludert denne kampen.
    streak = []
    for _, grp in rows.groupby("team", sort=False):
        run, last_home, last_season = 0, None, None
        for is_home, season in zip(grp["is_home"], grp["season"]):
            run = run + 1 if (is_home == last_home and season == last_season) else 1
            streak.append(min(run, 6))
            last_home, last_season = is_home, season
    rows["streak"] = streak
    home = rows[rows["is_home"] == 1].set_index("game_id")
    away = rows[rows["is_home"] == 0].set_index("game_id")
    out = games.set_index("game_id")
    out["rest_home"] = home["rest"]
    out["rest_away"] = away["rest"]
    out["rest_diff"] = out["rest_home"] - out["rest_away"]
    out["home_3in4"] = home["three_in_four"]
    out["away_3in4"] = away["three_in_four"]
    out["home_stand"] = home["streak"]
    out["away_trip"] = away["streak"]
    out["tz_shift_home"] = home["tz_shift"]
    out["tz_shift_away"] = away["tz_shift"]
    return out.reset_index()


def add_moneypuck(frame: pd.DataFrame, path: Path, span: int = 20) -> Tuple[pd.DataFrame, List[str]]:
    """
    Rullerende (EWMA over ~`span` kamper, kun tidligere kamper) 5v5 xGF %,
    skuddandel og keeper-prestasjon (xGA − GA per kamp) per lag, fra
    MoneyPuck all_teams.csv. Kobles på (dato, lag); ukjente blir NaN → 0.
    """
    mp = pd.read_csv(path, low_memory=False)
    mp = mp[(mp["situation"] == "5on5") & (mp["playoffGame"] == 0)].copy()
    mp["date"] = pd.to_datetime(mp["gameDate"].astype(str), format="%Y%m%d")
    alias = {"T.B": "TBL", "N.J": "NJD", "L.A": "LAK", "S.J": "SJS", "UTA": "ARI"}
    mp["team"] = mp["team"].replace(alias)
    mp = mp.sort_values(["team", "date"]).drop_duplicates(["team", "date"])
    mp["xgf_share"] = mp["xGoalsFor"] / (mp["xGoalsFor"] + mp["xGoalsAgainst"]).replace(0, np.nan)
    mp["sf_share"] = mp["shotsOnGoalFor"] / (mp["shotsOnGoalFor"] + mp["shotsOnGoalAgainst"]).replace(0, np.nan)
    mp["gsax"] = mp["xGoalsAgainst"] - mp["goalsAgainst"]
    cols = ["xgf_share", "sf_share", "gsax"]
    grp = mp.groupby("team")
    for c in cols:
        mp[f"{c}_ewm"] = grp[c].transform(lambda s: s.shift(1).ewm(span=span, min_periods=5).mean())
    keep = mp[["team", "date"] + [f"{c}_ewm" for c in cols]]
    frame = frame.copy()
    frame["_d"] = frame["local_date"].dt.normalize()
    # MoneyPuck fører Phoenix som ARI hele veien; game.csv har PHX før 2014/15.
    for side in ("home", "away"):
        frame[f"_{side}_mp"] = frame[f"{side}_team"].replace({"PHX": "ARI"})
    feats = []
    for side in ("home", "away"):
        renamed = keep.rename(columns={"team": f"_{side}_mp", "date": "_d",
                                       **{f"{c}_ewm": f"{side}_{c}" for c in cols}})
        frame = frame.merge(renamed, on=["_d", f"_{side}_mp"], how="left")
    for c in cols:
        frame[f"{c}_diff"] = frame[f"home_{c}"] - frame[f"away_{c}"]
        feats.append(f"{c}_diff")
    coverage = frame[feats[0]].notna().mean()
    frame[feats] = frame[feats].fillna(0.0)
    print(f"MoneyPuck: dekning {coverage:.1%} av kampene")
    return frame.drop(columns=["_d", "_home_mp", "_away_mp"]), feats


def build_frame(games: pd.DataFrame, cfg: TuneConfig) -> pd.DataFrame:
    ordered = games.sort_values(["date", "game_id"]).drop_duplicates("game_id").reset_index(drop=True)
    ordered["elo_diff"] = fast_elo_diff(ordered, cfg)
    frame = add_back_to_back(ordered)
    frame = add_rest_travel(frame)
    frame["ml2"] = (frame["home_goals"] > frame["away_goals"]).astype(int)
    tie = frame["outcome_code"] == 1
    low = frame[["home_goals", "away_goals"]].min(axis=1)
    frame["reg_home"] = np.where(tie, low, frame["home_goals"])
    frame["reg_away"] = np.where(tie, low, frame["away_goals"])
    gp = pd.concat([
        frame[["game_id", "season", "date", "home_team"]].rename(columns={"home_team": "team"}),
        frame[["game_id", "season", "date", "away_team"]].rename(columns={"away_team": "team"}),
    ]).sort_values(["team", "date", "game_id"])
    gp["gp"] = gp.groupby(["team", "season"]).cumcount()
    frame["min_gp"] = frame["game_id"].map(gp.groupby("game_id")["gp"].min())
    return frame[frame["season"] >= FIRST_TRAIN].reset_index(drop=True)


# --- modeller ----------------------------------------------------------------

def _logreg() -> Pipeline:
    return Pipeline([("scale", StandardScaler()), ("logreg", LogisticRegression(max_iter=3000))])


def _proba3(model, X) -> np.ndarray:
    p = model.predict_proba(X)
    idx = {c: i for i, c in enumerate(model.classes_)}
    return np.column_stack([p[:, idx[c]] for c in (0, 1, 2)])


def _q_model(train: pd.DataFrame, p3_train: np.ndarray):
    """q = P(hjemme vinner | OT/SO) som funksjon av log(pH/pA), som i train_model.py."""
    mask = ((train["outcome_code"] == 1) & (train["season"] >= FIRST_OT_SEASON)).to_numpy()
    if mask.sum() < 200:
        rate = 0.507
        return lambda p3: np.full(len(p3), rate)
    s = np.log(p3_train[mask, 0] / p3_train[mask, 2]).reshape(-1, 1)
    fit = LogisticRegression(C=1e6, max_iter=1000).fit(s, train["ml2"].to_numpy()[mask])
    return lambda p3: fit.predict_proba(np.log(p3[:, 0] / p3[:, 2]).reshape(-1, 1))[:, 1]


def three_way_model(features: Sequence[str], kind: str = "logreg"):
    def fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        if kind == "hgb":
            model = HistGradientBoostingClassifier(
                max_iter=250, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=80,
                l2_regularization=1.0, random_state=SEED,
            )
        else:
            model = _logreg()
        model.fit(train[list(features)], train["outcome_code"])
        p3_train = _proba3(model, train[list(features)])
        p3 = _proba3(model, test[list(features)])
        q = _q_model(train, p3_train)(p3)
        return p3, p3[:, 0] + p3[:, 1] * q
    return fit_predict


def binary_ml_model(features: Sequence[str]):
    def fit_predict(train, test):
        model = _logreg().fit(train[list(features)], train["ml2"])
        return None, model.predict_proba(test[list(features)])[:, 1]
    return fit_predict


def base_rate_model(train, test):
    p = np.bincount(train["outcome_code"], minlength=3) / len(train)
    return np.tile(p, (len(test), 1)), np.full(len(test), train["ml2"].mean())


def poisson_model(features: Sequence[str]):
    """
    To Poisson-regresjoner (hjemme- og bortemål i ordinær tid) → uavhengig
    Poisson-fordeling over sluttresultatet. Uavhengighet underpredikerer
    uavgjort, så P(uavgjort) skaleres med en faktor tilpasset treningssettet.
    """
    goals = np.arange(13)
    from scipy.stats import poisson  # scipy følger med scikit-learn

    def dist(lh, la, draw_mult):
        ph = poisson.pmf(goals[None, :], lh[:, None])
        pa = poisson.pmf(goals[None, :], la[:, None])
        joint = ph[:, :, None] * pa[:, None, :]
        home = np.tril(np.ones((13, 13)), -1)
        p_home = (joint * home[None]).sum(axis=(1, 2))
        p_draw = np.trace(joint, axis1=1, axis2=2) * draw_mult
        p_away = (joint * home.T[None]).sum(axis=(1, 2))
        p3 = np.column_stack([p_home, p_draw, p_away])
        return p3 / p3.sum(axis=1, keepdims=True)

    def fit_predict(train, test):
        X, Xt = train[list(features)], test[list(features)]
        mh = Pipeline([("s", StandardScaler()), ("p", PoissonRegressor(alpha=1e-4, max_iter=1000))]).fit(X, train["reg_home"])
        ma = Pipeline([("s", StandardScaler()), ("p", PoissonRegressor(alpha=1e-4, max_iter=1000))]).fit(X, train["reg_away"])
        raw = dist(mh.predict(X), ma.predict(X), 1.0)
        draw_mult = (train["outcome_code"] == 1).mean() / raw[:, 1].mean()
        p3_train = dist(mh.predict(X), ma.predict(X), draw_mult)
        p3 = dist(mh.predict(Xt), ma.predict(Xt), draw_mult)
        q = _q_model(train, p3_train)(p3)
        return p3, p3[:, 0] + p3[:, 1] * q
    return fit_predict


# --- evaluering --------------------------------------------------------------

def ll3(p3: np.ndarray, y: np.ndarray) -> np.ndarray:
    return -np.log(np.clip(p3[np.arange(len(y)), y], 1e-12, 1))


def ll2(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def walk_forward(frame: pd.DataFrame, fit_predict, seasons: Sequence[int]) -> pd.DataFrame:
    parts = []
    for season in seasons:
        train = frame[frame["season"] < season]
        test = frame[frame["season"] == season]
        if test.empty:
            continue
        assert not set(test["game_id"]) & set(train["game_id"]), "lekkasje: testkamp i trening"
        with contextlib.redirect_stdout(io.StringIO()):
            p3, pml = fit_predict(train, test)
        out = pd.DataFrame({"game_id": test["game_id"].to_numpy(), "season": season,
                            "min_gp": test["min_gp"].to_numpy(), "ll_ml2": ll2(pml, test["ml2"].to_numpy()),
                            "p_ml": pml, "y_ml": test["ml2"].to_numpy()})
        out["ll_reg3"] = ll3(p3, test["outcome_code"].to_numpy()) if p3 is not None else np.nan
        parts.append(out)
    return pd.concat(parts, ignore_index=True)


def paired_ci(diff: np.ndarray, rounds: int = 4000, seed: int = SEED) -> Tuple[float, float]:
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(diff), size=(rounds, len(diff)))
    means = diff[idx].mean(axis=1)
    return float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))


def calibration_slope(p: np.ndarray, y: np.ndarray) -> float:
    z = np.log(np.clip(p, 1e-6, 1 - 1e-6) / np.clip(1 - p, 1e-6, 1)).reshape(-1, 1)
    return float(LogisticRegression(C=1e6, max_iter=1000).fit(z, y).coef_[0][0])


def tune_elo(games: pd.DataFrame) -> Tuple[TuneConfig, List[Tuple[float, TuneConfig]]]:
    grid = itertools.product((4.0, 6.0, 8.0, 10.0), (35.0, 50.0, 65.0), (0.55, 0.70, 0.85),
                             (0.5, 0.6, 0.75), (0.0, 1.0))
    # Bare elo_diff avhenger av parametrene; resten av framen bygges én gang.
    base = build_frame(games, TuneConfig())
    ordered = games.sort_values(["date", "game_id"]).drop_duplicates("game_id").reset_index(drop=True)
    valid = base[base["season"] <= max(VALID_SEASONS)].copy()
    results = []
    for k, ha, reg, ot, mov in grid:
        cfg = TuneConfig(k, ha, reg, ot, mov)
        diff = pd.Series(fast_elo_diff(ordered, cfg), index=ordered["game_id"])
        valid["elo_diff"] = valid["game_id"].map(diff).to_numpy()
        res = walk_forward(valid, three_way_model(BASE_FEATURES), VALID_SEASONS)
        results.append((float(res["ll_reg3"].mean()), cfg))
    results.sort(key=lambda t: t[0])
    return results[0][1], results


def fmt(x: Optional[float], d: int = 4) -> str:
    return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{d}f}".replace(".", ",")


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Walk-forward-sammenligning av modellkandidater")
    ap.add_argument("--with-api", action="store_true", help="ta med NHL-APIet (2020/21 →)")
    ap.add_argument("--moneypuck", type=Path, help="sti til MoneyPuck all_teams.csv")
    ap.add_argument("--out", type=Path, default=Path(os.environ.get("NHL_MODEL_EVAL_MD") or DEFAULT_OUT))
    ap.add_argument("--skip-tuning", action="store_true", help="hopp over Elo-gridsøket (rask kjøring)")
    args = ap.parse_args(argv)
    t0 = time.time()

    if args.with_api:
        games, n_api = load_games(include_api=True)
    else:
        games, n_api = historical_frame(), 0
    games = games.sort_values(["date", "game_id"]).drop_duplicates("game_id").reset_index(drop=True)

    # Vakt: rask Elo med prod-parametrene skal gi nøyaktig prod-Elo.
    prod_elo, _, _ = compute_elo_state(games, EloConfig())
    fast = fast_elo_diff(games, TuneConfig())
    merged = games[["game_id"]].assign(fast=fast).merge(prod_elo[["game_id", "elo_diff"]], on="game_id")
    assert np.allclose(merged["fast"], merged["elo_diff"]), "rask Elo avviker fra prod-Elo"

    counts = games.groupby("season").size()
    complete = [int(s) for s, n in counts.items() if n >= 800]
    test_seasons = [s for s in complete if s >= FIRST_TEST]
    print(f"{len(games)} kamper ({n_api} fra APIet), testsesonger {test_seasons}")

    if args.skip_tuning:
        tuned, tuning = TuneConfig(), []
    else:
        print("Tuner Elo på valideringssesongene 2010/11–2014/15 ...")
        tuned, tuning = tune_elo(games)
    print(f"Valgt Elo: {tuned}")

    prod_frame = build_frame(games, TuneConfig())
    tuned_frame = build_frame(games, tuned)
    mp_feats: List[str] = []
    if args.moneypuck:
        tuned_frame, mp_feats = add_moneypuck(tuned_frame, args.moneypuck)

    m4 = BASE_FEATURES + REST_FEATURES
    candidates: List[Tuple[str, str, pd.DataFrame, Callable]] = [
        ("M0", "Basisrater", prod_frame, base_rate_model),
        ("M1", "Dagens: logistisk, Elo + b2b", prod_frame, three_way_model(BASE_FEATURES)),
        ("M2", "Binær logistisk på vinner inkl. OT", prod_frame, binary_ml_model(BASE_FEATURES)),
        ("M3", "Tunet Elo + b2b", tuned_frame, three_way_model(BASE_FEATURES)),
        ("M4", "M3 + hvile/reise", tuned_frame, three_way_model(m4)),
    ]
    if mp_feats:
        candidates.append(("M5", "M4 + MoneyPuck (xG, skudd, GSAx)", tuned_frame, three_way_model(m4 + mp_feats)))
    candidates += [
        ("M6", "HistGradientBoosting", tuned_frame, three_way_model(m4 + mp_feats, kind="hgb")),
        ("M7", "Poisson-målmodell", tuned_frame, poisson_model(m4 + mp_feats)),
    ]

    results: Dict[str, pd.DataFrame] = {}
    for code, label, frame, fp in candidates:
        t = time.time()
        results[code] = walk_forward(frame, fp, test_seasons)
        print(f"  {code} {label}: ll_reg3 {results[code]['ll_reg3'].mean():.4f} "
              f"ll_ml2 {results[code]['ll_ml2'].mean():.4f} ({time.time() - t:.0f} s)")

    ref = results["M1"].set_index("game_id")
    lines = [
        "# Modellevaluering (walk-forward)",
        "",
        f"_Generert av `NHL/evaluate_models.py` på {len(games)} grunnseriekamper"
        f"{' (game.csv + NHL-APIet)' if n_api else ' (game.csv, 2000–2020)'}. "
        f"Testsesonger: {', '.join(f'{s // 10000}/{s % 100:02d}' for s in test_seasons)}, "
        f"{len(ref)} kamper. Hver sesong er testet med modellen trent på alle sesongene før._",
        "",
        "Log loss: lavere er bedre. Δ er forskjellen mot M1 (dagens modell) per kamp med parret "
        "bootstrap, 95 %-intervall. Negativ Δ betyr bedre enn i dag. Kalibreringsstigning 1,0 = perfekt; "
        "under 1 = overkonfident.",
        "",
        "| | Modell | LL ordinær tid (HUB) | Δ mot M1 | LL vinner inkl. OT | Δ mot M1 | Kalibrering ML |",
        "| --- | --- | ---: | --- | ---: | --- | ---: |",
    ]
    best_ml = ("M1", 0.0)
    for code, label, _, _ in candidates:
        r = results[code].set_index("game_id").loc[ref.index]
        cells = []
        for col in ("ll_reg3", "ll_ml2"):
            if r[col].isna().all():
                cells += ["–", "–"]
                continue
            d = (r[col] - ref[col]).to_numpy()
            mean = float(r[col].mean())
            if code == "M1":
                cells += [fmt(mean), "–"]
            else:
                lo, hi = paired_ci(d)
                star = " ✓" if hi < 0 else ""
                cells += [fmt(mean), f"{fmt(float(d.mean()))} [{fmt(lo)}, {fmt(hi)}]{star}"]
                if col == "ll_ml2" and hi < 0 and d.mean() < best_ml[1]:
                    best_ml = (code, float(d.mean()))
        # Konstant sannsynlighet (basisrater) har ingen stigning å måle.
        slope = None if r["p_ml"].nunique() <= len(test_seasons) else calibration_slope(
            r["p_ml"].to_numpy(), r["y_ml"].to_numpy())
        lines.append(f"| {code} | {label} | {cells[0]} | {cells[1]} | {cells[2]} | {cells[3]} | {fmt(slope, 2)} |")

    lines += ["", "✓ = signifikant bedre enn dagens modell (hele intervallet under null).", ""]
    lines += ["## Per sesong, vinner inkl. OT (log loss)", "",
              "| Sesong | n | " + " | ".join(c for c, *_ in candidates) + " |",
              "| --- | ---: | " + " | ".join("---:" for _ in candidates) + " |"]
    for s in test_seasons:
        n = int((ref["season"] == s).sum())
        vals = [fmt(float(results[c].loc[results[c]["season"] == s, "ll_ml2"].mean())) for c, *_ in candidates]
        note = " (uten publikum)" if s == COVID_SEASON else ""
        lines.append(f"| {s // 10000}/{s % 100:02d}{note} | {n} | " + " | ".join(vals) + " |")

    lines += ["", "## Tidlig i sesongen (vinner inkl. OT, minst antall kamper spilt av de to lagene)", "",
              "| Kamper spilt | n | M0 | M1 | Beste kandidat |", "| --- | ---: | ---: | ---: | ---: |"]
    best_code = best_ml[0] if best_ml[0] != "M1" else "M3"
    for lo_gp, hi_gp in ((0, 4), (5, 9), (10, 19), (20, 99)):
        mask = (ref["min_gp"] >= lo_gp) & (ref["min_gp"] <= hi_gp)
        vals = [fmt(float(results[c].set_index("game_id").loc[ref.index][mask.to_numpy()]["ll_ml2"].mean()))
                for c in ("M0", "M1", best_code)]
        lines.append(f"| {lo_gp}–{hi_gp} | {int(mask.sum())} | {vals[0]} | {vals[1]} | {vals[2]} ({best_code}) |")

    if tuning:
        lines += ["", "## Elo-tuning (validering 2010/11–2014/15, log loss ordinær tid)", "",
                  "| | K | Hjemmefordel | Regresjon | OT-score | MoV | LL |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
        prod_ll = next(v for v, c in tuning if c == TuneConfig())
        for i, (v, c) in enumerate(tuning[:5]):
            lines.append(f"| {i + 1} | {c.k_factor:g} | {c.home_advantage:g} | {c.season_regression:g} | "
                         f"{c.ot_win_score:g} | {c.mov_scale:g} | {fmt(v)} |")
        lines.append(f"| prod | 6 | 50 | 0.7 | 0.6 | 0 | {fmt(prod_ll)} |")

    if best_ml[0] != "M1":
        b = results[best_ml[0]]
        wins = sum(
            float(b.loc[b["season"] == s, "ll_ml2"].mean()) < float(ref.loc[ref["season"] == s, "ll_ml2"].mean())
            for s in test_seasons
        )
        verdict = (f"**{best_ml[0]} slår dagens modell signifikant på vinner inkl. OT** "
                   f"(Δ {fmt(best_ml[1])} per kamp, bedre i {wins} av {len(test_seasons)} sesonger).")
    else:
        verdict = "**Ingen kandidat slår dagens modell signifikant på vinner inkl. OT.**"
    lines += ["", "## Konklusjon", "", verdict + " Forbedringer i log loss på 0,00x-nivå er reelle, men små "
              "mot NTs margin (~7 % på vinner inkl. OT): de flytter sjelden et spill over terskelen. "
              "Modellen alene blir derfor ikke en spillstrategi; den brukes som tilleggsinformasjon i "
              "skyggestrategien.", ""]
    if mp_feats:
        lines += ["_xG-, skudd- og keeperdata: [MoneyPuck.com](https://moneypuck.com) (fri for ikke-kommersiell bruk)._", ""]
    else:
        lines += ["_M5 (MoneyPuck) er ikke med i denne kjøringen; kjør med `--moneypuck all_teams.csv`._", ""]
    lines.append(f"_Kjøretid {time.time() - t0:.0f} s._")

    report = "\n".join(lines) + "\n"
    print(report)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report, encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
