#!/usr/bin/env python3
"""
Offline-test av rapportlogikken og den statiske eksporten.

Stubber NHL-APIet, odds-APIet og modellen, så testen krever verken nettverk
eller en trent `models/nhl_model.pkl`. Den bruker derimot repoets egne
`models/elo_ratings.json`, `data/team_info.csv` og `data/bet_history.csv`
(alle sporet i git). Dekker særlig feilmodusene som avgjør hva som havner på
den statiske sida:

  - normal eksport skriver alle filene og alle lagkombinasjoner
  - lag uten kampdata faller ut av teams.json og matchups.json
  - NHL-APIet nede -> forrige JSON beholdes, seksjonen merkes i meta.json
  - delvis nede NHL-API -> for få lag/kamper til å erstatte god data
  - feature-bygging som feiler for de fleste lagpar -> samme beskyttelse
  - elo.json skrives med visningsforkortelser (UTA) og bare aktive lag
  - shadow.json takler en tom skyggelogg
  - meta.json bærer pipelinens EV-/odds-terskler
  - alle tre utfall logges, og gamle rader uten kolonnene overlever

Kjøres direkte: `cd NHL && python test_site_export.py`
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import report_service as rs  # noqa: E402

# Lag uten kampdata i NHL-APIet (nedlagte franchiser i team_info.csv).
DEFUNCT = {"PHX", "ATL"}


class FakeModel:
    """Minimal stand-in for RandomForestClassifier."""

    classes_ = np.array([0, 1, 2])

    def predict_proba(self, X):
        return np.tile(np.array([0.5, 0.2, 0.3]), (len(X), 1))


def fake_games(abbr: str, opponent: str = "NYR", n: int = 20):
    games = []
    for i in range(n):
        date = (datetime.now(timezone.utc) - timedelta(days=i + 1)).strftime(
            "%Y-%m-%dT00:00:00Z"
        )
        at_home = i % 2 == 0
        games.append({
            "id": f"{abbr}{i}",
            "date": date,
            "home": abbr if at_home else opponent,
            "away": opponent if at_home else abbr,
            "home_goals": 3 if at_home else 2,
            "away_goals": 2 if at_home else 3,
        })
    return games


def fake_odds(days: int = 3):
    start = datetime.now(timezone.utc)
    return [
        {
            "eventId": "1001",
            "startTime": start.strftime("%Y-%m-%dT18:00:00Z"),
            "home": "Boston Bruins",
            "away": "Montreal Canadiens",
            "home_abbr": "BOS",
            "away_abbr": "MTL",
            "odds_home": 1.9,
            "odds_draw": 4.2,
            "odds_away": 3.4,
        },
        {
            "eventId": "1002",
            "startTime": (start + timedelta(days=1)).strftime("%Y-%m-%dT18:00:00Z"),
            "home": "Utah Mammoth",
            "away": "Seattle Kraken",
            "home_abbr": "UTA",
            "away_abbr": "SEA",
            "odds_home": 2.1,
            "odds_draw": None,  # ufullstendige odds
            "odds_away": 3.0,
        },
        {
            "eventId": "1003",
            "startTime": (start + timedelta(days=1)).strftime("%Y-%m-%dT20:00:00Z"),
            "home": "Toronto Maple Leafs",
            "away": "New York Rangers",
            "home_abbr": "TOR",
            "away_abbr": "NYR",
            "odds_home": 2.0,
            "odds_draw": 4.0,
            "odds_away": 3.6,
        },
    ]


def install_stubs(teams_with_data=None):
    """Stubber nettverk + modell. `teams_with_data=None` betyr alle aktive lag."""
    def get_recent(team_abbr, limit=5):
        if team_abbr in DEFUNCT:
            return []
        if teams_with_data is not None and team_abbr not in teams_with_data:
            return []
        return fake_games(team_abbr)[:limit]

    rs.get_team_recent_games = get_recent
    rs.get_nhl_matches_range = fake_odds
    # Diskcachen omgås så testen ikke plukker opp ekte data.
    rs.get_cached_team_games = lambda abbr: None
    rs.cache_team_games = lambda abbr, games: None

    _, abbr_to_id = rs.load_team_mappings(str(rs.TEAM_INFO_PATH))
    rs._cache["data"] = {
        "id_to_abbr": {v: k for k, v in abbr_to_id.items()},
        "abbr_to_id": abbr_to_id,
        "model": FakeModel(),
    }


def test_prediction_payload():
    install_stubs()
    pred = rs.build_prediction("BOS", "MTL", fake_games("BOS"), fake_games("MTL"))

    assert pred["home_team"] == "BOS" and pred["away_team"] == "MTL"
    assert len(pred["home_last_5"]) == 5
    assert pred["prediction"] == "Home Win"
    assert abs(sum((pred["prob_home_win"], pred["prob_ot"], pred["prob_away_win"])) - 1) < 0.02

    # Utah: NHL-APIet bruker UTA, features bruker ARI. Hjemme/borte skal
    # fortsatt være riktig i visningsdataen.
    uta = rs.build_prediction("UTA", "SEA", fake_games("UTA"), fake_games("SEA"))
    assert uta["home_team"] == "UTA"
    assert {g["venue"] for g in uta["home_last_5"]} == {"H", "A"}


def test_value_report():
    install_stubs()
    report = rs.build_value_report(3)

    assert len(report) == 3
    assert report[0]["home_abbr"] == "BOS"
    assert report[0]["best_value"] in {"home", "draw", "away"}
    # Ufullstendige odds skal ikke gi en anbefaling ...
    assert report[1]["best_value"] is None
    # ... men modellodds beregnes uansett.
    assert report[1]["model_home_odds"] is not None


def test_value_report_raises_when_most_games_lack_data():
    # Bare BOS/MTL har data -> 1 av 3 kamper kan beregnes.
    install_stubs(teams_with_data={"BOS", "MTL"})
    try:
        rs.build_value_report(3)
    except RuntimeError as exc:
        assert "1 av 3" in str(exc), exc
    else:
        raise AssertionError("build_value_report skulle feilet på 1 av 3 kamper")

    # 2 av 3 er over terskelen og skal slippe gjennom.
    install_stubs(teams_with_data={"BOS", "MTL", "TOR", "NYR"})
    assert len(rs.build_value_report(3)) == 2


def test_elo_guard_rejects_empty_ratings():
    """Uten Elo-ratings blir 4 av 18 features konstante – da skal vi feile."""
    from live import live_feature_builder as lfb
    from utils.elo import EloConfig

    original_loader = lfb.load_ratings
    lfb._ELO_CACHE.clear()
    lfb.load_ratings = lambda path=None: ({}, EloConfig())
    try:
        lfb._get_elo()
    except RuntimeError:
        return
    finally:
        lfb.load_ratings = original_loader
        lfb._ELO_CACHE.clear()
    raise AssertionError("_get_elo skulle feilet på tomme ratings")


def test_full_export(tmp: Path):
    install_stubs()
    os.environ["NHL_EXPORT_DIR"] = str(tmp)
    import export_site_data as ex

    assert ex.main() == 0

    files = {p.name: json.loads(p.read_text()) for p in tmp.glob("*.json")}
    assert set(files) == {
        "teams.json",
        "value-report.json",
        "portfolio.json",
        "matchups.json",
        "elo.json",
        "shadow.json",
        "meta.json",
    }

    matchups = files["matchups.json"]
    teams = files["teams.json"]
    n = len(matchups["teams"])
    assert n >= ex.MIN_TEAMS_FOR_EXPORT
    assert len(matchups["matchups"]) == n * (n - 1)
    assert "BOS-MTL" in matchups["matchups"] and "MTL-BOS" in matchups["matchups"]
    # Nedlagte franchiser har ingen kampdata og skal ikke kunne velges.
    assert DEFUNCT.isdisjoint(matchups["teams"])
    assert {t["abbreviation"] for t in teams} == set(matchups["teams"])
    assert files["meta.json"]["failed"] == []
    assert files["portfolio.json"]["summary"]["total_bets"] >= 0

    # Nye filer skal ligge i meta.json.files, ellers finner ikke frontend dem.
    assert {"elo.json", "shadow.json"} <= set(files["meta.json"]["files"])

    elo = files["elo.json"]
    assert "UTA" in elo["ratings"] and "ARI" not in elo["ratings"]
    assert DEFUNCT.isdisjoint(elo["ratings"])
    assert len(elo["ratings"]) == 32
    assert elo["display_keys"] is True
    assert elo["config"]["base_rating"] and elo["meta"]["through"]
    # Rangert liste: høyeste rating først.
    values = list(elo["ratings"].values())
    assert values == sorted(values, reverse=True)

    assert isinstance(files["shadow.json"], list)

    # Pipelinens terskler, så frontend slipper å gjette dem.
    import bet_tracker as bt

    meta = files["meta.json"]
    assert meta["value_min"] == bt.DEFAULT_MIN_VALUE
    assert meta["max_odds"] == bt.DEFAULT_MAX_ODDS
    assert meta["allow_draw_bets"] == bt.ALLOW_DRAW_BETS


def test_export_keeps_previous_files_when_nhl_api_is_down(tmp: Path):
    stale_teams = [{"abbreviation": "BOS", "id": "6"}]
    stale_report = [{"event_id": "gammel"}]
    (tmp / "teams.json").write_text(json.dumps(stale_teams))
    (tmp / "value-report.json").write_text(json.dumps(stale_report))

    install_stubs(teams_with_data=set())
    os.environ["NHL_EXPORT_DIR"] = str(tmp)
    import export_site_data as ex

    # Eksporten skal ikke feile jobben, bare hoppe over seksjonene.
    assert ex.main() == 0

    meta = json.loads((tmp / "meta.json").read_text())
    assert meta["failed"] == ["matchups", "teams", "value-report"]
    assert json.loads((tmp / "teams.json").read_text()) == stale_teams
    assert json.loads((tmp / "value-report.json").read_text()) == stale_report


def test_export_rejects_partial_team_data(tmp: Path):
    stale_teams = [{"abbreviation": "BOS", "id": "6"}]
    (tmp / "teams.json").write_text(json.dumps(stale_teams))

    install_stubs(teams_with_data={"BOS", "MTL", "NYR", "TOR", "EDM"})
    os.environ["NHL_EXPORT_DIR"] = str(tmp)
    import export_site_data as ex

    assert ex.main() == 0

    meta = json.loads((tmp / "meta.json").read_text())
    assert "matchups" in meta["failed"] and "teams" in meta["failed"]
    assert json.loads((tmp / "teams.json").read_text()) == stale_teams


def test_export_rejects_when_most_pairs_fail(tmp: Path):
    """Alle lag har kampdata, men feature-byggingen feiler for de fleste par."""
    stale_teams = [{"abbreviation": "BOS", "id": "6"}]
    (tmp / "teams.json").write_text(json.dumps(stale_teams))

    install_stubs()
    os.environ["NHL_EXPORT_DIR"] = str(tmp)
    import export_site_data as ex

    working = {"BOS", "MTL", "TOR", "NYR", "SEA"}
    original = ex.build_live_features

    def flaky(away_abbr, home_abbr, **kwargs):
        if home_abbr not in working or away_abbr not in working:
            raise RuntimeError("feature-bygging feilet")
        return original(away_abbr, home_abbr, **kwargs)

    ex.build_live_features = flaky
    try:
        assert ex.main() == 0
    finally:
        ex.build_live_features = original

    meta = json.loads((tmp / "meta.json").read_text())
    assert "matchups" in meta["failed"] and "teams" in meta["failed"]
    assert json.loads((tmp / "teams.json").read_text()) == stale_teams


def test_utah_alias_gets_same_form_as_a_team_without_alias():
    """
    Utah heter UTA i NHL-APIet, men ARI i modellen. Formberegningen må matche
    på forkortelsen kampene bruker, ellers telles alle hjemmekampene som
    bortekamper med mål for/mot byttet om.
    """
    from live.live_feature_builder import build_live_features

    install_stubs()
    control = build_live_features(
        "MTL", "BOS", home_games=fake_games("BOS"), away_games=fake_games("MTL")
    )
    utah = build_live_features(
        "MTL", "UTA", home_games=fake_games("UTA"), away_games=fake_games("MTL")
    )

    form_cols = [c for c in control.columns if c.startswith("home_form_")]
    assert control[form_cols].iloc[0].equals(utah[form_cols].iloc[0])
    # Kampene i fixturen er 20 seire. Med feil alias-oppslag ble raten 0.5.
    assert utah["home_form_win_rate_w20"].iloc[0] == 1.0

    # Id og Elo skal fortsatt slås opp kanonisk (ARI), ikke på visningsnavnet.
    _, abbr_to_id = rs.load_team_mappings(str(rs.TEAM_INFO_PATH))
    assert utah["home_team_id"].iloc[0] == abbr_to_id["ARI"]


def test_draw_bets_go_to_the_shadow_ledger():
    """
    OT/SO-spill har ingen målbar edge og skal ikke legges inn – men de skal
    føres i skyggeloggen med full innsats, så vi kan måle hva vi går glipp av
    (eller sparer oss for).
    """
    import bet_tracker as bt

    game = {
        "best_value": "draw",
        "best_value_delta": 0.30,
        "date": "2026-10-10",
        "start_time": "2026-10-10T18:00:00+00:00",
        "home_abbr": "BOS",
        "away_abbr": "MTL",
        "event_id": "1",
        "odds_home": 2.0,
        "odds_draw": 3.9,
        "odds_away": 3.5,
        "model_draw": 0.33,
        "implied_draw_prob": 0.256,
        "value_draw": 0.30,
    }
    home_game = dict(game, event_id="2", best_value="home", model_home_win=0.55,
                     implied_home_prob=0.5, value_home=0.25, best_value_delta=0.25)

    history, shadow = [], []
    created, shadowed = bt.record_new_bets(
        history, prefetched_report=[game, home_game], shadow=shadow, min_value=0.15
    )

    # Uavgjort havner i skyggeloggen, hjemmespillet i den ekte.
    assert (created, shadowed) == (1, 1)
    assert [r["selection"] for r in history] == ["home"]
    assert [r["selection"] for r in shadow] == ["draw"]
    # Skyggespillet har full innsats og avregnes som et ekte spill.
    assert shadow[0]["stake"] == 100.0 and shadow[0]["status"] == "pending"

    # Ingen dobbeltføring ved neste kjøring.
    created2, shadowed2 = bt.record_new_bets(
        history, prefetched_report=[game, home_game], shadow=shadow, min_value=0.15
    )
    assert (created2, shadowed2) == (0, 0)

    # Med bryteren på spilles de som før, og havner ikke i skyggeloggen.
    original = bt.ALLOW_DRAW_BETS
    bt.ALLOW_DRAW_BETS = True
    try:
        history2, shadow2 = [], []
        created3, shadowed3 = bt.record_new_bets(
            history2, prefetched_report=[game], shadow=shadow2, min_value=0.15
        )
        assert (created3, shadowed3) == (1, 0)
        assert history2[0]["selection"] == "draw" and shadow2 == []
    finally:
        bt.ALLOW_DRAW_BETS = original


def test_season_column_and_portfolio_filtering():
    """
    Sesongen utledes fra kampdatoen, og porteføljen viser nyeste sesong som
    faktisk har spill (ellers ville sida stått tom hele off-season).
    """
    import bet_tracker as bt

    assert bt.season_of("2025-12-06") == "2025-26"
    assert bt.season_of("2026-06-30") == "2025-26"   # sesongslutt
    assert bt.season_of("2026-07-01") == "2026-27"   # ny sesong
    assert bt.season_of("2026-10-08") == "2026-27"
    assert bt.season_of("") == ""

    history = [
        {"date": "2026-03-01", "season": "2025-26", "selection": "home", "odds": 2.0,
         "stake": 100.0, "status": "won", "payout": 200.0, "profit": 100.0},
        {"date": "2026-11-02", "season": "2026-27", "selection": "away", "odds": 2.0,
         "stake": 100.0, "status": "lost", "payout": 0.0, "profit": -100.0},
    ]

    assert bt.available_seasons(history) == ["2025-26", "2026-27"]

    # Default: nyeste sesong med spill.
    payload = bt.build_portfolio_payload(history)
    assert payload["season"] == "2026-27"
    assert payload["summary"]["total_bets"] == 1
    assert payload["summary"]["profit"] == -100.0

    # Eksplisitt sesong.
    older = bt.build_portfolio_payload(history, season="2025-26")
    assert older["summary"]["total_bets"] == 1 and older["summary"]["profit"] == 100.0

    # Hele historikken.
    total = bt.build_portfolio_payload(history, all_seasons=True)
    assert total["season"] is None and total["summary"]["total_bets"] == 2

    # all_time følger med uansett valgt sesong.
    assert payload["all_time"] == {"total_bets": 2, "profit": 0.0}

    # Rader uten season faller tilbake på datoen.
    legacy = [dict(history[0], season="")]
    assert bt.build_portfolio_payload(legacy)["season"] == "2025-26"


def test_elo_export_uses_display_abbreviations():
    """
    Aliasingen skjer i eksport-steget, ikke i frontend: modellens tilstandsfil
    bruker ARI og har fortsatt nedlagte franchiser, `elo.json` gjør ikke.
    """
    import export_site_data as ex

    elo = ex.build_elo("2026-07-31T00:00:00+00:00")

    assert "UTA" in elo["ratings"]
    assert "ARI" not in elo["ratings"]
    assert DEFUNCT.isdisjoint(elo["ratings"])
    assert len(elo["ratings"]) == 32

    # Tilstandsfila skal være urørt – der heter Utah fortsatt ARI.
    raw = json.loads(ex.ELO_RATINGS_PATH.read_text(encoding="utf-8"))
    assert "ARI" in raw["ratings"] and "UTA" not in raw["ratings"]

    # UTA-verdien er ARI-verdien, ikke en ny beregning.
    assert elo["ratings"]["UTA"] == raw["ratings"]["ARI"]

    # config/meta følger uendret med, og flagget sier at nøklene er visningsnavn.
    assert elo["config"] == raw["config"] and elo["meta"] == raw["meta"]
    assert elo["display_keys"] is True

    values = list(elo["ratings"].values())
    assert values == sorted(values, reverse=True)


def test_shadow_export_survives_an_empty_ledger(tmp: Path):
    """
    `bet_shadow.csv` er tom utenfor sesong. Da skal eksporten gi [] – ikke
    krasje, og ikke droppe fila.
    """
    import bet_tracker as bt
    import export_site_data as ex

    # Repoets egen (tomme) skyggelogg.
    assert ex.build_shadow() == []

    # Bare header, ingen rader.
    empty = tmp / "bet_shadow.csv"
    bt.save_shadow([], empty)
    assert bt.load_shadow(empty) == []

    # Med en rad skal formen matche portfolio.json sine bets[]: tall som tall.
    row = bt._build_bet_entry(
        {
            "best_value": "home",
            "date": "2026-10-10",
            "start_time": "2026-10-10T18:00:00+00:00",
            "home_abbr": "BOS",
            "away_abbr": "MTL",
            "event_id": "1",
            "odds_home": 2.0,
            "odds_draw": 3.9,
            "odds_away": 3.5,
            "model_home_win": 0.55,
            "implied_home_prob": 0.5,
            "value_home": 0.1,
        },
        100.0,
    )
    bt.save_shadow([row], empty)
    loaded = bt.load_shadow(empty)
    assert len(loaded) == 1
    for field in ("odds", "model_prob", "implied_prob", "value", "stake", "payout", "profit"):
        assert isinstance(loaded[0][field], float), field
    assert json.dumps(loaded)  # må være serialiserbar som den er


def test_bet_entry_logs_all_three_outcomes(tmp: Path):
    """
    PROBLEMS.md funn 02: bare det spilte utfallet ble logget, så odds og EV for
    de to andre var borte for alltid. Nå lagres hele markedsbildet – med samme
    feltnavn som value-rapporten bruker.
    """
    import bet_tracker as bt

    game = {
        "best_value": "home",
        "date": "2026-10-10",
        "start_time": "2026-10-10T18:00:00+00:00",
        "home_abbr": "BOS",
        "away_abbr": "MTL",
        "event_id": "1",
        "odds_home": 2.0,
        "odds_draw": 3.9,
        "odds_away": 3.5,
        "model_home_win": 0.55,
        "model_draw": 0.2,
        "model_away_win": 0.25,
        "implied_home_prob": 0.5,
        "implied_draw_prob": 0.25641,
        "implied_away_prob": 0.28571,
        "value_home": 0.1,
        "value_draw": -0.22,
        "value_away": -0.125,
    }

    entry = bt._build_bet_entry(game, 100.0)
    for field in bt.OUTCOME_FIELDS:
        assert entry[field] is not None, field
    assert (entry["odds_home"], entry["odds_draw"], entry["odds_away"]) == (2.0, 3.9, 3.5)
    assert (entry["model_home_win"], entry["model_draw"], entry["model_away_win"]) == (0.55, 0.2, 0.25)
    assert (entry["value_home"], entry["value_draw"], entry["value_away"]) == (0.1, -0.22, -0.125)

    # De gamle enkeltfeltene er fortsatt det spilte utfallet.
    assert entry["odds"] == entry["odds_home"]
    assert entry["model_prob"] == entry["model_home_win"]
    assert entry["value"] == entry["value_home"]

    # Under terskel og skygge bruker samme radbygger -> samme felter.
    assert set(bt._build_candidate_entry(game)) == set(bt.BET_FIELDS)
    assert set(entry) == set(bt.BET_FIELDS)


def test_legacy_rows_survive_a_read_write_round_trip(tmp: Path):
    """
    De 202 historiske radene har ikke de nye kolonnene. De skal kunne leses og
    skrives uten å krasje, og uten at noe eksisterende felt endrer verdi.
    """
    import bet_tracker as bt

    legacy_path = tmp / "bet_history.csv"
    shutil.copy(bt.BET_HISTORY_PATH, legacy_path)

    original_text = legacy_path.read_text(encoding="utf-8")
    assert "value_home" not in original_text.splitlines()[0]  # gammel header

    rows = bt.load_history(legacy_path)
    assert rows, "fixturen skal ha rader"
    for field in bt.OUTCOME_FIELDS:
        assert rows[0][field] is None, field

    bt.save_history(rows, legacy_path)
    header = legacy_path.read_text(encoding="utf-8").splitlines()[0]
    assert header.split(",") == bt.BET_FIELDS

    reread = bt.load_history(legacy_path)
    assert len(reread) == len(rows)
    assert reread == rows

    # Ingen av de gamle verdiene skal ha flyttet på seg.
    for before, after in zip(rows, reread):
        for field in ("date", "event_id", "selection", "odds", "profit", "status"):
            assert before[field] == after[field], field

    # Porteføljen bygges fortsatt av gamle rader.
    assert bt.build_portfolio_payload(reread)["summary"]["total_bets"] > 0


def main() -> int:
    failures = 0
    tmp_root = Path(tempfile.mkdtemp(prefix="nhl-export-test-"))
    try:
        cases = [
            ("prediction_payload", test_prediction_payload, False),
            ("value_report", test_value_report, False),
            ("value_report_raises", test_value_report_raises_when_most_games_lack_data, False),
            ("elo_guard", test_elo_guard_rejects_empty_ratings, False),
            ("utah_alias_form", test_utah_alias_gets_same_form_as_a_team_without_alias, False),
            ("draw_shadow_ledger", test_draw_bets_go_to_the_shadow_ledger, False),
            ("season_ledger", test_season_column_and_portfolio_filtering, False),
            ("elo_display_abbrs", test_elo_export_uses_display_abbreviations, False),
            ("three_outcome_fields", test_bet_entry_logs_all_three_outcomes, True),
            ("legacy_round_trip", test_legacy_rows_survive_a_read_write_round_trip, True),
            ("shadow_empty_ledger", test_shadow_export_survives_an_empty_ledger, True),
            ("full_export", test_full_export, True),
            ("keeps_previous_files", test_export_keeps_previous_files_when_nhl_api_is_down, True),
            ("rejects_partial_data", test_export_rejects_partial_team_data, True),
            ("rejects_failing_pairs", test_export_rejects_when_most_pairs_fail, True),
        ]
        for name, case, needs_dir in cases:
            try:
                if needs_dir:
                    case_dir = tmp_root / name
                    case_dir.mkdir()
                    case(case_dir)
                else:
                    case()
            except Exception as exc:
                failures += 1
                print(f"FEIL  {name}: {type(exc).__name__}: {exc}")
            else:
                print(f"OK    {name}")
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

    print("\nAlle tester passerte" if not failures else f"\n{failures} test(er) feilet")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
