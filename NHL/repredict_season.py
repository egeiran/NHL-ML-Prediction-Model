#!/usr/bin/env python3
"""
Re-prediksjon av sesongens loggede kamper uten preseason-kamper i formen.

Bakgrunn: fram til denne endringen hentet live-pipelinen lagenes siste kamper
fra NHL-scoreboardet, uten filter på kamptype og bare 120 dager tilbake. I
sesongstarten besto form-featurene derfor nesten bare av preseason-kamper.
Modellen var trent på grunnserie alene og hadde aldri sett slike tall.

For hver kamp i bet_history.csv og bet_shadow.csv for sesongen regnes fire
sannsynlighetssett ut, med oddsen som faktisk ble logget:

  logget       det som står i loggen
  gjenskapt    gammel Random Forest + gammel form (med preseason) + Elo-fila
               slik den så ut da raden ble skrevet. Skal treffe «logget» – det
               bekrefter at oppsettet under er det samme som produksjonen brukte.
  uten_pre     samme modell og samme Elo, men formen bygget av grunnseriekamper
               alene (rullet inn i forrige sesong, som i treningen). Eneste
               endring: preseason er ute.
  ny           den nye modellen (logistisk regresjon på Elo + back-to-back),
               trent bare på sesongene før denne, med Elo regressert før lagets
               første kamp i sesongen og sperren mot de første kampene.

Spillene velges med samme terskler som produksjonen (bet_tracker), og
avregnes mot faktisk utfall. Loggene endres ikke – de er en logg over
beslutninger som faktisk ble tatt.

Elo-fila for hver rad hentes fra git-historikken (commiten som la inn raden),
så kjør med full historikk (`fetch-depth: 0` i Actions). Uten git brukes
pre-kamp Elo fra kamphistorikken, som er nesten det samme.

Kjøres der NHL-APIet er tilgjengelig:  python repredict_season.py
Miljøvariabler:
  NHL_REPREDICT_SEASON   sesong i loggformat, default inneværende ("2026-27")
  NHL_REPREDICT_OUT_MD   markdown-rapport (default ../docs/repredict_<sesong>.md)
  NHL_REPREDICT_OUT_CSV  rad-for-rad CSV (default data/repredict_<sesong>.csv)
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

import bet_tracker as bt
from live.form_engine import compute_team_form_from_games
from live.live_feature_builder import local_game_date
from live.nhl_api import (
    get_scoreboard,
    get_team_recent_games,
    plays_on,
    regular_season_games_played,
)
from utils.data_loader import load_and_prepare_games, load_team_mappings
from utils.elo import EloConfig, build_elo_feature_values, compute_elo_history
from utils.feature_engineering import (
    DEFAULT_WINDOWS,
    add_multiwindow_form,
    build_team_long_df,
    get_feature_columns,
    get_legacy_feature_columns,
    make_game_feature_frame,
)
from utils.game_history import build_feature_history, load_games
from utils.model_utils import train_outcome_model, train_random_forest
from utils.team_alias import to_canonical, to_display
from utils.value_utils import adjust_three_way_probs, expected_value

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
ELO_PATH_IN_REPO = "NHL/models/elo_ratings.json"
LOG_FILES = {"bet": "data/bet_history.csv", "skygge": "data/bet_shadow.csv"}

# Det den gamle pipelinen brukte: draw-proben ganget med 0.95.
LEGACY_DRAW_MULT = 0.95
LEGACY_MAX_DAYS_BACK = 120
FIRST_TRAIN_SEASON = 20052006
OUTCOMES = ("home", "draw", "away")


# --------------------------------------------------------------------------- #
# Modellene
# --------------------------------------------------------------------------- #

def train_legacy_random_forest():
    """
    Gjenskaper den gamle produksjonsmodellen nøyaktig: samme data (game.csv),
    samme features, samme tilfeldige splitt og samme seed som train_model.py
    hadde før byttet. Den daglige jobben trente den på nytt hver dag, så dette
    er modellen som ga sannsynlighetene i loggen.
    """
    games, _, _ = load_and_prepare_games("data/game.csv", "data/team_info.csv")
    long_df = add_multiwindow_form(build_team_long_df(games), windows=DEFAULT_WINDOWS)
    elo_df, _ = compute_elo_history(games, EloConfig())
    X, y, _, _ = make_game_feature_frame(games, long_df, windows=DEFAULT_WINDOWS, elo_df=elo_df)
    X_train, _, y_train, _ = train_test_split(X, y, test_size=0.1, random_state=42, stratify=y)
    return train_random_forest(X_train, y_train)


def train_new_model(season_id: int):
    """Produksjonsmodellen, trent bare på sesongene før `season_id`."""
    games, n_api = load_games(include_api=True, until_season=season_id - 10001, min_api_games=1000)
    frame, _, _ = build_feature_history(games, EloConfig())
    frame = frame[frame["season"] >= FIRST_TRAIN_SEASON]
    cols = get_feature_columns()
    print(f"Ny modell trent på {len(frame)} kamper ({n_api} fra API), t.o.m. {season_id - 10001}")
    return train_outcome_model(frame[cols], frame["outcome_code"])


def _probs(model, X: pd.DataFrame) -> Tuple[float, float, float]:
    proba = dict(zip(model.classes_, model.predict_proba(X)[0]))
    total = sum(proba.get(c, 0.0) for c in (0, 1, 2))
    return tuple(float(proba.get(c, 0.0)) / total for c in (0, 1, 2))


# --------------------------------------------------------------------------- #
# Elo slik den var da raden ble skrevet
# --------------------------------------------------------------------------- #

def _git(*args: str) -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=True
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout


def commit_that_added(event_id: str, log_file: str) -> Optional[str]:
    """Første commit der `event_id` dukket opp i loggfila."""
    out = _git("log", "--reverse", "--format=%H", f"-S{event_id}", "--", f"NHL/{log_file}")
    if not out:
        return None
    return out.split()[0]


@lru_cache(maxsize=None)
def elo_at_commit(commit: str) -> Optional[Tuple[Dict[str, float], EloConfig]]:
    raw = _git("show", f"{commit}:{ELO_PATH_IN_REPO}")
    if not raw:
        return None
    payload = json.loads(raw)
    ratings = {t: float(r) for t, r in payload.get("ratings", {}).items()}
    return ratings, EloConfig(**payload.get("config", {}))


def pre_game_ratings(history, home: str, away: str, game_date: str):
    """
    Reserve uten git: ratingene lagene gikk inn i kampen med, fra
    kamphistorikken. Er kampen ikke spilt ennå, brukes siste ratings.
    """
    frame, latest, _ = history
    home_c, away_c = to_canonical(home), to_canonical(away)
    match = frame[
        (frame["home_team"] == home_c)
        & (frame["away_team"] == away_c)
        & (frame["local_date"] == pd.Timestamp(game_date))
    ]
    if match.empty:
        return dict(latest), EloConfig()
    row = match.iloc[0]
    return {home_c: float(row["home_elo_pre"]), away_c: float(row["away_elo_pre"])}, EloConfig()


# --------------------------------------------------------------------------- #
# Formen, gammel og ny
# --------------------------------------------------------------------------- #

def _flatten(scoreboard: Dict) -> List[Dict]:
    if scoreboard.get("gamesByDate"):
        return [g for day in scoreboard["gamesByDate"] for g in day.get("games", [])]
    return scoreboard.get("games", []) or []


def legacy_recent_games(team: str, as_of: str, limit: int = 20) -> Tuple[List[Dict], List[int]]:
    """
    Den gamle hentingen: scoreboardet dag for dag bakover fra `as_of`, inntil
    `limit` ferdigspilte kamper eller 120 dager – uansett kamptype. Kamper
    etter `as_of` er ikke tatt med (de var ikke spilt da). Returnerer
    (kamper nyeste først, kamptypene i samme rekkefølge).
    """
    day0 = datetime.strptime(as_of, "%Y-%m-%d")
    collected: Dict = {}
    days_back = 0
    while len(collected) < limit and days_back < LEGACY_MAX_DAYS_BACK:
        date = (day0 - timedelta(days=days_back)).strftime("%Y-%m-%d")
        for g in _flatten(get_scoreboard(date)):
            home = g.get("homeTeam", {}).get("abbrev")
            away = g.get("awayTeam", {}).get("abbrev")
            if team not in (home, away):
                continue
            if str(g.get("gameState", "")).upper() not in {"OFF", "FINAL"}:
                continue
            gdate = g.get("gameDate") or g.get("startTimeUTC") or ""
            if gdate[:10] >= as_of:
                continue
            key = g.get("id") or f"{home}|{away}|{gdate}"
            if key in collected:
                continue
            collected[key] = {
                "id": g.get("id"),
                "date": gdate,
                "home": home,
                "away": away,
                "home_goals": g.get("homeTeam", {}).get("score"),
                "away_goals": g.get("awayTeam", {}).get("score"),
                "game_type": g.get("gameType"),
            }
            if len(collected) >= limit:
                break
        days_back += 1
    games = sorted(collected.values(), key=lambda g: g["date"], reverse=True)[:limit]
    return games, [g.get("game_type") for g in games]


def legacy_feature_row(
    home: str,
    away: str,
    home_games: List[Dict],
    away_games: List[Dict],
    ratings: Dict[str, float],
    config: EloConfig,
    abbr_to_id: Dict[str, int],
) -> pd.DataFrame:
    """Samme rad som den gamle build_live_features bygget."""
    home_form = compute_team_form_from_games(home, home_games, windows=DEFAULT_WINDOWS)
    away_form = compute_team_form_from_games(away, away_games, windows=DEFAULT_WINDOWS)
    row: Dict[str, float] = {}
    for w in DEFAULT_WINDOWS:
        for metric in ("form_goals_for", "form_goals_against", "form_win_rate"):
            row[f"home_{metric}_w{w}"] = home_form[f"{metric}_w{w}"]
            row[f"away_{metric}_w{w}"] = away_form[f"{metric}_w{w}"]
    row["home_team_id"] = abbr_to_id[to_canonical(home)]
    row["away_team_id"] = abbr_to_id[to_canonical(away)]
    row.update(build_elo_feature_values(to_canonical(home), to_canonical(away), ratings, config))
    return pd.DataFrame([row], columns=get_legacy_feature_columns(DEFAULT_WINDOWS))


# --------------------------------------------------------------------------- #
# Seleksjon og avregning, med produksjonens terskler
# --------------------------------------------------------------------------- #

def select(probs: Tuple[float, float, float], odds: Tuple[float, float, float]) -> Optional[str]:
    game = {f"odds_{o}": odd for o, odd in zip(OUTCOMES, odds)}
    for o, p, odd in zip(OUTCOMES, probs, odds):
        game[f"value_{o}"] = expected_value(p, odd)
    return bt._qualifying_selection(
        game, bt.DEFAULT_MIN_VALUE, bt.DEFAULT_DRAW_MIN_VALUE, bt.DEFAULT_MAX_ODDS
    )


def settle(selection: Optional[str], odds: Dict[str, float], outcome: str) -> Optional[float]:
    if not selection or outcome not in OUTCOMES:
        return None
    return round(100.0 * (odds[selection] - 1), 2) if selection == outcome else -100.0


# --------------------------------------------------------------------------- #
# Hovedløp
# --------------------------------------------------------------------------- #

def load_rows(season: str) -> pd.DataFrame:
    frames = []
    for source, path in LOG_FILES.items():
        df = pd.read_csv(BASE_DIR / path)
        df = df[df["season"] == season].copy()
        df["kilde"] = source
        df["logg_fil"] = path
        frames.append(df)
    rows = pd.concat(frames, ignore_index=True)
    return rows.dropna(subset=["odds_home", "odds_draw", "odds_away"]).sort_values(
        ["start_time", "event_id"]
    ).reset_index(drop=True)


def main() -> int:
    season = os.environ.get("NHL_REPREDICT_SEASON") or bt.current_season()
    season_id = int(f"{season[:4]}{int(season[:4]) + 1}")
    out_md = Path(os.environ.get("NHL_REPREDICT_OUT_MD", REPO_ROOT / "docs" / f"repredict_{season}.md"))
    out_csv = Path(os.environ.get("NHL_REPREDICT_OUT_CSV", BASE_DIR / "data" / f"repredict_{season}.csv"))

    rows = load_rows(season)
    print(f"Sesong {season}: {len(rows)} loggede kamper med komplette odds")

    print("Gjenskaper den gamle Random Forest-modellen...")
    legacy = train_legacy_random_forest()
    new_model = train_new_model(season_id)
    _, abbr_to_id = load_team_mappings("data/team_info.csv")

    # Reserve når git-historikken mangler: pre-kamp Elo fra kamphistorikken.
    fallback_frame = None

    records = []
    for r in rows.itertuples(index=False):
        home, away = to_display(to_canonical(r.home_abbr)), to_display(to_canonical(r.away_abbr))
        game_date = local_game_date(r.start_time) or str(r.date)
        as_of = local_game_date(str(r.created_at)) or game_date
        odds = {"home": r.odds_home, "draw": r.odds_draw, "away": r.odds_away}
        odds_t = (r.odds_home, r.odds_draw, r.odds_away)
        outcome = r.actual_outcome if isinstance(r.actual_outcome, str) else ""

        commit = commit_that_added(str(r.event_id), r.logg_fil)
        elo = elo_at_commit(commit) if commit else None
        elo_source = "git"
        if elo is None:
            if fallback_frame is None:
                games, _ = load_games(include_api=True, until_season=season_id)
                fallback_frame = build_feature_history(games, EloConfig())
            elo = pre_game_ratings(fallback_frame, home, away, game_date)
            elo_source = "historikk"
        ratings, config = elo

        # Gammel form (med preseason) og ny form (grunnserie, punkt-i-tid).
        old_home, old_home_types = legacy_recent_games(home, as_of)
        old_away, old_away_types = legacy_recent_games(away, as_of)
        new_home = get_team_recent_games(home, limit=20, before=as_of)
        new_away = get_team_recent_games(away, limit=20, before=as_of)

        p_repro = adjust_three_way_probs(
            *_probs(legacy, legacy_feature_row(home, away, old_home, old_away, ratings, config, abbr_to_id)),
            draw_multiplier=LEGACY_DRAW_MULT,
        )
        p_nopre = adjust_three_way_probs(
            *_probs(legacy, legacy_feature_row(home, away, new_home, new_away, ratings, config, abbr_to_id)),
            draw_multiplier=LEGACY_DRAW_MULT,
        )

        # Ny modell: Elo regresseres for lag uten grunnseriekamp i sesongen ennå.
        gp_home = regular_season_games_played(home, game_date)
        gp_away = regular_season_games_played(away, game_date)
        last_season = {
            to_canonical(home): season_id if gp_home else season_id - 10001,
            to_canonical(away): season_id if gp_away else season_id - 10001,
        }
        elo_new = build_elo_feature_values(
            to_canonical(home), to_canonical(away), ratings, config,
            season=season_id, last_season=last_season,
        )
        previous_day = (datetime.strptime(game_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        X_new = pd.DataFrame(
            [{
                "elo_diff": elo_new["elo_diff"],
                "home_b2b": int(plays_on(home, previous_day)),
                "away_b2b": int(plays_on(away, previous_day)),
            }],
            columns=get_feature_columns(),
        )
        p_new = adjust_three_way_probs(*_probs(new_model, X_new), draw_multiplier=1.0)

        sel_logged = r.selection if r.kilde == "bet" else None
        sel_repro, sel_nopre, sel_new = select(p_repro, odds_t), select(p_nopre, odds_t), select(p_new, odds_t)
        early = min(gp_home, gp_away) < bt.MIN_GAMES_PLAYED
        sel_new_rule = None if early else sel_new

        records.append({
            "date": r.date,
            "local_date": game_date,
            "event_id": r.event_id,
            "home": home,
            "away": away,
            "kilde": r.kilde,
            "odds_home": r.odds_home,
            "odds_draw": r.odds_draw,
            "odds_away": r.odds_away,
            "utfall": outcome,
            "elo_kilde": elo_source,
            "preseason_w5_home": sum(1 for t in old_home_types[:5] if t == 1),
            "preseason_w5_away": sum(1 for t in old_away_types[:5] if t == 1),
            "preseason_w20_home": sum(1 for t in old_home_types if t == 1),
            "preseason_w20_away": sum(1 for t in old_away_types if t == 1),
            "gp_home": gp_home,
            "gp_away": gp_away,
            **{f"logget_{o}": p for o, p in zip(OUTCOMES, (r.model_home_win, r.model_draw, r.model_away_win))},
            **{f"gjenskapt_{o}": round(p, 4) for o, p in zip(OUTCOMES, p_repro)},
            **{f"uten_pre_{o}": round(p, 4) for o, p in zip(OUTCOMES, p_nopre)},
            **{f"ny_{o}": round(p, 4) for o, p in zip(OUTCOMES, p_new)},
            "spill_logget": sel_logged or "",
            "spill_gjenskapt": sel_repro or "",
            "spill_uten_pre": sel_nopre or "",
            "spill_ny": sel_new or "",
            "spill_ny_med_sperre": sel_new_rule or "",
            "resultat_logget": settle(sel_logged, odds, outcome),
            "resultat_gjenskapt": settle(sel_repro, odds, outcome),
            "resultat_uten_pre": settle(sel_nopre, odds, outcome),
            "resultat_ny": settle(sel_new, odds, outcome),
            "resultat_ny_med_sperre": settle(sel_new_rule, odds, outcome),
        })
        print(
            f"  {r.date} {home}-{away}: logget {r.model_home_win:.3f}/{r.model_draw:.3f}/{r.model_away_win:.3f}"
            f"  gjenskapt {p_repro[0]:.3f}/{p_repro[1]:.3f}/{p_repro[2]:.3f}"
            f"  uten pre {p_nopre[0]:.3f}/{p_nopre[1]:.3f}/{p_nopre[2]:.3f}"
            f"  ny {p_new[0]:.3f}/{p_new[1]:.3f}/{p_new[2]:.3f}"
        )

    df = pd.DataFrame.from_records(records)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)
    print(f"\nSkrev {out_csv}")

    report = render_report(df, season)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(report, encoding="utf-8")
    print(f"Skrev {out_md}\n")
    print(report)
    return 0


# --------------------------------------------------------------------------- #
# Rapport
# --------------------------------------------------------------------------- #

def _variant_line(df: pd.DataFrame, label: str, col: str) -> str:
    placed = df[df[f"spill_{col}"] != ""]
    settled = placed[placed[f"resultat_{col}"].notna()]
    n, hits = len(settled), int((settled[f"resultat_{col}"] > 0).sum())
    profit = settled[f"resultat_{col}"].sum()
    roi = profit / (100 * n) * 100 if n else 0.0
    pending = len(placed) - n
    return (
        f"| {label} | {len(placed)} | {n} | {hits} | {profit:+.0f} kr | {roi:+.1f} % | {pending} |"
    )


def _mean_abs(df: pd.DataFrame, a: str, b: str) -> float:
    return float(np.mean([np.abs(df[f"{a}_{o}"] - df[f"{b}_{o}"]).mean() for o in OUTCOMES]))


def render_report(df: pd.DataFrame, season: str) -> str:
    max_dev = float(np.max([np.abs(df[f"gjenskapt_{o}"] - df[f"logget_{o}"]).max() for o in OUTCOMES]))
    first_week = df[df["local_date"] <= (pd.to_datetime(df["local_date"]).min() + pd.Timedelta(days=6)).strftime("%Y-%m-%d")]
    pre_share_w5 = (first_week[["preseason_w5_home", "preseason_w5_away"]].sum().sum()) / (5 * 2 * max(len(first_week), 1))

    lines = [
        f"# Re-prediksjon {season} uten preseason i formen",
        "",
        f"Generert {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC av `NHL/repredict_season.py`. "
        f"{len(df)} kamper fra porteføljen og skyggeloggen, med oddsen som faktisk ble logget. "
        "Loggene er ikke endret.",
        "",
        "## Kontroll: gjenskaper vi det produksjonen gjorde?",
        "",
        f"Gammel modell + gammel form + Elo-fila fra commiten som la inn raden: snittavvik "
        f"{_mean_abs(df, 'gjenskapt', 'logget'):.4f} mot loggede sannsynligheter, største avvik {max_dev:.4f} "
        f"(loggen er avrundet til tre desimaler). Elo-kilde: "
        + ", ".join(f"{k} {v}" for k, v in df["elo_kilde"].value_counts().items())
        + ".",
        "",
        "## Hvor mye preseason var det i formen?",
        "",
        f"Første uke av sesongen var {pre_share_w5 * 100:.0f} % av kampene i 5-kampersvinduet preseason-kamper. "
        f"Snittavviket mellom «gjenskapt» og «uten preseason» er {_mean_abs(df, 'gjenskapt', 'uten_pre'):.3f} "
        "per utfall over hele perioden.",
        "",
        "## Hva ville blitt spilt?",
        "",
        "Samme terskler som produksjonen: EV > "
        f"{bt.DEFAULT_MIN_VALUE:.2f} hjemme/borte, > {bt.DEFAULT_DRAW_MIN_VALUE:.2f} uavgjort, odds < {bt.DEFAULT_MAX_ODDS:.2f}.",
        "",
        "| Variant | Spill | Avgjort | Treff | Resultat | ROI | Åpne |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        _variant_line(df, "Logget (faktisk portefølje)", "logget"),
        _variant_line(df, "Gjenskapt (gammel modell, med preseason)", "gjenskapt"),
        _variant_line(df, "Gammel modell uten preseason", "uten_pre"),
        _variant_line(df, "Ny modell", "ny"),
        _variant_line(df, f"Ny modell + sperre (< {bt.MIN_GAMES_PLAYED} kamper)", "ny_med_sperre"),
        "",
        "Små tall: et par treff fra eller til snur ROI-en. Tabellen viser hva preseason-feilen "
        "gjorde med *utvalget*, ikke om modellen har en kant.",
        "",
        "## Kamp for kamp (der minst én variant spiller)",
        "",
        "| Dato | Kamp | Utfall | Logget | Uten pre | Ny | Ny + sperre | Preseason w5 (H/B) |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    def cell(row, col):
        sel = row[f"spill_{col}"]
        if not sel:
            return "–"
        res = row[f"resultat_{col}"]
        mark = "" if pd.isna(res) else (" ✓" if res > 0 else " ✗")
        return f"{sel} @ {row[f'odds_{sel}']:.2f}{mark}"

    any_bet = df[(df[["spill_logget", "spill_uten_pre", "spill_ny", "spill_ny_med_sperre"]] != "").any(axis=1)]
    for _, row in any_bet.iterrows():
        lines.append(
            f"| {row['local_date']} | {row['away']} @ {row['home']} | {row['utfall'] or 'åpen'} | "
            f"{cell(row, 'logget')} | {cell(row, 'uten_pre')} | {cell(row, 'ny')} | {cell(row, 'ny_med_sperre')} | "
            f"{row['preseason_w5_home']}/{row['preseason_w5_away']} |"
        )
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
