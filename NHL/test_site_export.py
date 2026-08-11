#!/usr/bin/env python3
"""
Offline-test av rapportlogikken og den statiske eksporten.

Stubber NHL-APIet, odds-APIet og modellen, så testen krever verken nettverk
eller en trent `models/nhl_model.pkl`. Den leser `data/team_info.csv` og
`models/elo_ratings.json` fra repoet, men asserter aldri på innholdet i filer
pipelinen skriver om (`data/bet_*.csv`, `models/elo_ratings.json`): der bygges
fixtures, ellers ville testene begynt å feile natta etter en kjøring. Dekker
særlig feilmodusene som avgjør hva som havner på den statiske sida:

  - normal eksport skriver alle filene og alle lagkombinasjoner
  - lag uten kampdata faller ut av teams.json og matchups.json
  - NHL-APIet nede -> forrige JSON beholdes, seksjonen merkes i meta.json
  - delvis nede NHL-API -> for få lag/kamper til å erstatte god data
  - feature-bygging som feiler for de fleste lagpar -> samme beskyttelse
  - elo.json skrives med visningsforkortelser (UTA) og bare aktive lag
  - shadow.json takler en tom skyggelogg
  - meta.json bærer pipelinens EV-/odds-terskler
  - alle tre utfall logges, og gamle rader uten kolonnene overlever
  - et brutt odds-kall retries, men reell nedetid boblar fortsatt opp

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

    # Innholdet i models/elo_ratings.json rulles framover hver natt, så her
    # sjekkes bare formen. Aliasing/rangering testes mot fixture i
    # test_elo_export_uses_display_abbreviations.
    elo = files["elo.json"]
    assert "ARI" not in elo["ratings"]
    assert set(elo["ratings"]) <= set(ex.CURRENT_TEAMS)
    assert DEFUNCT.isdisjoint(elo["ratings"])
    assert len(elo["ratings"]) >= ex.MIN_TEAMS_FOR_EXPORT
    assert elo["display_keys"] is True
    assert isinstance(elo["config"], dict) and isinstance(elo["meta"], dict)
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


def _report_game(**overrides):
    """Én rad i value-rapporten. Default: hjemmespill godt over begge tersklene."""
    game = {
        "best_value": "home",
        "best_value_delta": 0.25,
        "date": "2026-12-10",
        "start_time": "2026-12-10T18:00:00+00:00",
        "home_abbr": "BOS",
        "away_abbr": "MTL",
        "event_id": "1",
        "odds_home": 2.0,
        "odds_draw": 3.9,
        "odds_away": 3.5,
        "model_home_win": 0.625,
        "implied_home_prob": 0.5,
        "value_home": 0.25,
        "model_draw": 0.28,
        "implied_draw_prob": 0.256,
        "value_draw": 0.10,
    }
    game.update(overrides)
    return game


def _classify(report, **kwargs):
    """record_new_bets uten nettverk: kamptypen stubbes til grunnserie."""
    import bet_tracker as bt

    history, shadow = kwargs.pop("history", []), kwargs.pop("shadow", [])
    original = bt.is_bettable_game_type
    bt.is_bettable_game_type = kwargs.pop("game_type_ok", lambda *_: True)
    try:
        created, shadowed = bt.record_new_bets(
            history, prefetched_report=report, shadow=shadow, min_value=0.15, **kwargs
        )
    finally:
        bt.is_bettable_game_type = original
    return history, shadow, created, shadowed


def test_rejected_bets_go_to_the_shadow_ledger():
    """
    Skyggeloggen er kampene vi ikke tar fordi de ryker på EV-terskelen eller
    oddstaket. Full innsats og vanlig avregning, så terskelplasseringen kan
    måles. OT/SO er ikke lenger et eget tilfelle – de spilles som alt annet.
    """
    import bet_tracker as bt

    tatt = _report_game(event_id="1")
    lav_ev = _report_game(event_id="2", best_value_delta=0.10, value_home=0.10)
    hoye_odds = _report_game(event_id="3", odds_home=4.2, value_home=0.4,
                             best_value_delta=0.4)
    # Uavgjort må over sin egen, høyere terskel (0.30) for å bli spilt.
    uavgjort = _report_game(event_id="4", best_value="draw", best_value_delta=0.35,
                            value_draw=0.35, value_home=None, value_away=None)

    history, shadow, created, shadowed = _classify([tatt, lav_ev, hoye_odds, uavgjort])

    # Over sin terskel -> porteføljen. Uavgjort er ikke utelukket, bare strengere.
    assert (created, shadowed) == (2, 2)
    assert sorted(r["event_id"] for r in history) == ["1", "4"]
    assert sorted(r["event_id"] for r in shadow) == ["2", "3"]
    # Skyggespill har full innsats og avregnes som et ekte spill.
    assert all(r["stake"] == 100.0 and r["status"] == "pending" for r in shadow)

    # Ingen dobbeltføring ved neste kjøring.
    _, _, created2, shadowed2 = _classify(
        [tatt, lav_ev, hoye_odds, uavgjort], history=history, shadow=shadow
    )
    assert (created2, shadowed2) == (0, 0)

    # Skrus OT/SO av igjen, havner de i skyggeloggen i stedet.
    original = bt.ALLOW_DRAW_BETS
    bt.ALLOW_DRAW_BETS = False
    try:
        h, s, c, sh = _classify([uavgjort])
        assert (c, sh) == (0, 1)
        assert h == [] and [r["selection"] for r in s] == ["draw"]
    finally:
        bt.ALLOW_DRAW_BETS = original


def test_draws_need_a_higher_ev_threshold_than_home_and_away():
    """
    Norsk Tipping holder OT/SO-oddsen fast rundt 3,90, så EV-terskelen måler noe
    annet for uavgjort enn for hjemme/borte: den blir en ren test av hvor høyt
    modellen tør å gå. Derfor egen terskel på 0,30.
    """
    import bet_tracker as bt

    assert bt.DEFAULT_DRAW_MIN_VALUE == 0.30
    assert bt.min_value_for("home", 0.15) == 0.15
    assert bt.min_value_for("draw", 0.15) == 0.30

    # EV 0,20: nok for et hjemmespill, ikke for uavgjort.
    kun_uavgjort = dict(value_home=None, value_away=None, best_value="draw")
    _, s, c, sh = _classify([_report_game(value_draw=0.20, **kun_uavgjort)])
    assert (c, sh) == (0, 1) and s[0]["selection"] == "draw"

    h, _, c, sh = _classify([_report_game(value_draw=0.35, **kun_uavgjort)])
    assert (c, sh) == (1, 0) and h[0]["selection"] == "draw"

    # Terskelen kan overstyres per kall (API-et sender den videre).
    h, _, c, _ = _classify([_report_game(value_draw=0.20, **kun_uavgjort)],
                           draw_min_value=0.15)
    assert c == 1 and h[0]["selection"] == "draw"


def test_a_failing_draw_does_not_drag_down_a_good_home_bet():
    """
    Uavgjort kan ha høyest EV uten å klare sin egen terskel. Da skal vi fortsatt
    ta hjemmespillet i samme kamp – ikke kaste hele kampen. Hvert utfall
    vurderes mot sin egen terskel, ikke bare `best_value`.
    """
    game = _report_game(
        best_value="draw", best_value_delta=0.28,  # høyest EV ...
        value_draw=0.28,                           # ... men under 0,30
        value_home=0.22,                           # klarer 0,15
        value_away=None,
    )
    history, shadow, created, shadowed = _classify([game])
    assert (created, shadowed) == (1, 0)
    assert history[0]["selection"] == "home" and history[0]["odds"] == 2.0


def test_a_game_never_lands_in_both_ledgers():
    """
    Én kamp gir én kandidat. Skygges den på uavgjort og hjemmelaget senere
    kvalifiserer, skal skyggeraden bort – ellers telles kampen to ganger, én
    gang med notionell og én gang med ekte innsats.
    """
    avvist = _report_game(best_value="draw", best_value_delta=0.28,
                          value_draw=0.28, value_home=0.10, value_away=None)
    senere = _report_game(best_value="draw", best_value_delta=0.28,
                          value_draw=0.28, value_home=0.22, value_away=None)

    history, shadow, created, shadowed = _classify([avvist])
    assert (created, shadowed) == (0, 1) and shadow[0]["selection"] == "draw"

    history, shadow, created, shadowed = _classify(
        [senere], history=history, shadow=shadow
    )
    assert (created, shadowed) == (1, 0)
    assert [r["selection"] for r in history] == ["home"] and shadow == []


def test_a_bet_moves_out_of_the_shadow_when_the_odds_cross_the_threshold():
    """
    Oddsen kan bevege seg mellom kjøringene. Krysser den terskelen, tar vi
    spillet på ekte – og skyggeraden skal bort, ellers telles kampen to ganger.
    """
    under = _report_game(best_value_delta=0.10, value_home=0.10)
    over = _report_game(best_value_delta=0.25, value_home=0.25)

    history, shadow, created, shadowed = _classify([under])
    assert (created, shadowed) == (0, 1)

    history, shadow, created, shadowed = _classify(
        [over], history=history, shadow=shadow
    )
    assert (created, shadowed) == (1, 0)
    assert [r["event_id"] for r in history] == ["1"] and shadow == []


def test_playoff_games_are_skipped_entirely():
    """
    Sluttspill spilles ikke: Elo oppdateres bare på grunnserien, så modellen
    predikerer på frosne ratings. De skal ikke i skyggeloggen heller – det er
    ikke terskelen som diskvalifiserer dem.
    """
    history, shadow, created, shadowed = _classify(
        [_report_game()], game_type_ok=lambda *_: False
    )
    assert (created, shadowed) == (0, 0)
    assert history == [] and shadow == []


def test_unknown_game_type_is_never_played():
    """
    Vet vi ikke kamptypen, spiller vi ikke. Det finnes ingen kalendergrense å
    gjette på: preseason 2025-26 gikk til 4. oktober mens grunnserien startet
    7., og 2026-27 starter 29. september. Et månedsskille ville sluppet gjennom
    preseason noen år og stengt grunnserie andre.
    """
    import bet_tracker as bt

    original = bt.lookup_game_type
    try:
        # Ingen dato redder et ukjent svar – heller ikke midt i grunnserien.
        bt.lookup_game_type = lambda *_: None
        for dato in ("2026-12-10", "2026-10-15", "2026-05-20", "2026-09-29"):
            assert bt.is_bettable_game_type(dato, "BOS", "MTL") is False, dato

        # Kamptypen avgjør, ikke kalenderen – begge veier.
        bt.lookup_game_type = lambda *_: 2
        assert bt.is_bettable_game_type("2026-05-20", "BOS", "MTL") is True
        bt.lookup_game_type = lambda *_: 3
        assert bt.is_bettable_game_type("2026-12-10", "BOS", "MTL") is False
        bt.lookup_game_type = lambda *_: 1
        assert bt.is_bettable_game_type("2026-09-22", "BOS", "MTL") is False
    finally:
        bt.lookup_game_type = original

    assert bt.is_bettable_game_type(None, "BOS", "MTL") is False
    assert bt.is_bettable_game_type("2026-12-10", None, "MTL") is False


def test_game_type_picks_the_closest_game_in_the_scoreboard_window():
    """
    Scoreboardet svarer med ±5 dager. Møter to lag hverandre både i siste
    grunnseriekamp og i sluttspillåpningen, ligger begge i svaret – og da må vi
    lese den som faktisk er nærmest datoen, ellers spiller vi sluttspill.
    """
    import bet_tracker as bt

    vindu = {
        "gamesByDate": [
            {"date": "2026-04-15", "games": [{
                "id": 2025021300, "gameDate": "2026-04-15", "gameType": 2,
                "homeTeam": {"abbrev": "BOS"}, "awayTeam": {"abbrev": "MTL"}}]},
            {"date": "2026-04-19", "games": [{
                "id": 2025030111, "gameDate": "2026-04-19", "gameType": 3,
                "homeTeam": {"abbrev": "BOS"}, "awayTeam": {"abbrev": "MTL"}}]},
        ]
    }
    original = bt.get_scoreboard
    bt.get_scoreboard = lambda _date: vindu
    try:
        assert bt.lookup_game_type("2026-04-15", "BOS", "MTL") == 2
        assert bt.lookup_game_type("2026-04-19", "BOS", "MTL") == 3
        assert bt.is_bettable_game_type("2026-04-19", "BOS", "MTL") is False
    finally:
        bt.get_scoreboard = original

    # Mangler gameType, leses kamptypen ut av NHL-idens siffer 5-6.
    assert bt._game_type_from_id(2025030111) == 3
    assert bt._game_type_from_id(2025021300) == 2
    assert bt._game_type_from_id("tull") is None


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


def test_elo_export_uses_display_abbreviations(tmp: Path):
    """
    Aliasingen skjer i eksport-steget, ikke i frontend: modellens tilstandsfil
    bruker ARI og har fortsatt nedlagte franchiser, `elo.json` gjør ikke.

    Tilstandsfila rulles framover hver natt (`update_elo_ratings.py`), så
    oppførselen testes mot en fixture. Mot den ekte fila sjekkes bare det som
    holder uansett innhold.
    """
    import export_site_data as ex

    # Fixture: ARI (ikke UTA), to nedlagte franchiser, og usortert rekkefølge.
    canonical = [ex.to_canonical(a) for a in ex.CURRENT_TEAMS]
    assert "ARI" in canonical and "UTA" not in canonical
    fixture_ratings = {
        abbr: 1500.0 + i for i, abbr in enumerate(canonical)
    }
    fixture_ratings.update({"ATL": 1490.0, "PHX": 1480.0})
    fixture = {
        "config": {"base_rating": 1500.0, "k_factor": 6.0},
        "meta": {"through": "2020-01-01", "n_games": 1},
        "ratings": fixture_ratings,
    }
    fixture_path = tmp / "elo_ratings.json"
    fixture_path.write_text(json.dumps(fixture), encoding="utf-8")

    original_path = ex.ELO_RATINGS_PATH
    ex.ELO_RATINGS_PATH = fixture_path
    try:
        elo = ex.build_elo("2026-07-31T00:00:00+00:00")
    finally:
        ex.ELO_RATINGS_PATH = original_path

    # Alle aktive lag med visningsnavn, ingen kanoniske nøkler, ingen nedlagte.
    assert set(elo["ratings"]) == set(ex.CURRENT_TEAMS)
    assert "UTA" in elo["ratings"] and "ARI" not in elo["ratings"]
    assert DEFUNCT.isdisjoint(elo["ratings"])

    # UTA-verdien er ARI-verdien, ikke en ny beregning.
    assert elo["ratings"]["UTA"] == fixture_ratings["ARI"]

    # Tilstandsfila skal være urørt.
    assert json.loads(fixture_path.read_text(encoding="utf-8")) == fixture

    # config/meta følger uendret med, og flagget sier at nøklene er visningsnavn.
    assert elo["config"] == fixture["config"] and elo["meta"] == fixture["meta"]
    assert elo["display_keys"] is True
    assert elo["generated_at"] == "2026-07-31T00:00:00+00:00"

    values = list(elo["ratings"].values())
    assert values == sorted(values, reverse=True)

    # For få aktive lag -> hellere ingen eksport enn en halv Elo-tabell.
    thin = dict(fixture, ratings={a: 1500.0 for a in canonical[: ex.MIN_TEAMS_FOR_EXPORT - 1]})
    fixture_path.write_text(json.dumps(thin), encoding="utf-8")
    ex.ELO_RATINGS_PATH = fixture_path
    try:
        ex.build_elo("2026-07-31T00:00:00+00:00")
    except RuntimeError:
        pass
    else:
        raise AssertionError("build_elo skulle feilet på for få lag")
    finally:
        ex.ELO_RATINGS_PATH = original_path

    # Mot repoets egen tilstandsfil: bare invarianter, ingen antagelser om
    # hvilke tall eller hvilken dato som står der i dag.
    real = ex.build_elo("2026-07-31T00:00:00+00:00")
    assert set(real["ratings"]) <= set(ex.CURRENT_TEAMS)
    assert len(real["ratings"]) >= ex.MIN_TEAMS_FOR_EXPORT
    assert "ARI" not in real["ratings"] and DEFUNCT.isdisjoint(real["ratings"])
    real_values = list(real["ratings"].values())
    assert real_values == sorted(real_values, reverse=True)
    assert all(isinstance(v, float) for v in real_values)


def test_shadow_export_survives_an_empty_ledger(tmp: Path):
    """
    `bet_shadow.csv` er tom utenfor sesong. Da skal eksporten gi [] – ikke
    krasje, og ikke droppe fila.
    """
    import bet_tracker as bt
    import export_site_data as ex

    # Bare header, ingen rader.
    empty = tmp / "bet_shadow.csv"
    bt.save_shadow([], empty)
    assert bt.load_shadow(empty) == []

    # ... og en helt fraværende fil.
    assert bt.load_shadow(tmp / "finnes-ikke.csv") == []

    # build_shadow() leser standardstien. Vi peker den mot fixturen i stedet for
    # å anta at repoets egen logg er tom – den fylles så snart en sesong kjører.
    original = ex.load_shadow
    ex.load_shadow = lambda path=empty: bt.load_shadow(path)
    try:
        assert ex.build_shadow() == []
    finally:
        ex.load_shadow = original

    # Mot den ekte fila holder bare invarianten: en JSON-serialiserbar liste.
    real = ex.build_shadow()
    assert isinstance(real, list)
    assert json.dumps(real)

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


def write_legacy_history(path: Path) -> list[dict]:
    """
    Skriver en `bet_history.csv` slik den så ut FØR utfallskolonnene kom:
    headeren er `BET_FIELDS` minus `OUTCOME_FIELDS`.

    Fixturen bygges her og leses aldri fra `data/bet_history.csv`. Den ekte fila
    skrives om med den nye headeren første gang pipelinen kjører `save_history`,
    og en test som leste den ville da stille slutte å teste det den heter.
    """
    import csv

    import bet_tracker as bt

    legacy_fields = [f for f in bt.BET_FIELDS if f not in set(bt.OUTCOME_FIELDS)]
    rows = [
        {
            "season": "2025-26",
            "date": "2025-12-05",
            "event_id": "BOS-STL-2025-12-05",
            "start_time": "2025-12-05T01:00:00+01:00",
            "home_abbr": "BOS",
            "away_abbr": "STL",
            "selection": "home",
            "odds": "2.65",
            "model_prob": "0.461",
            "implied_prob": "0.37736",
            "value": "0.22165",
            "stake": "100.0",
            "status": "won",
            "payout": "265.0",
            "profit": "165.0",
            "actual_outcome": "home",
            "created_at": "2025-12-04T08:48:28.383157",
            "updated_at": "2025-12-05T11:10:10.674074",
        },
        {
            "season": "2025-26",
            "date": "2025-12-05",
            "event_id": "FLA-NSH-2025-12-05",
            "start_time": "2025-12-05T01:00:00+01:00",
            "home_abbr": "FLA",
            "away_abbr": "NSH",
            "selection": "away",
            "odds": "3.35",
            "model_prob": "0.447",
            "implied_prob": "0.29851",
            "value": "0.49745",
            "stake": "100.0",
            "status": "lost",
            "payout": "0.0",
            "profit": "-100.0",
            "actual_outcome": "draw",
            "created_at": "2025-12-04T08:48:28.383089",
            "updated_at": "2025-12-05T11:10:10.674243",
        },
        # Helt gammel rad: `season` fantes ikke og skal utledes av datoen.
        {
            **{f: "" for f in legacy_fields},
            "date": "2026-06-10",
            "event_id": "VGK-CAR-2026-06-10",
            "start_time": "2026-06-10T02:00:00+02:00",
            "home_abbr": "VGK",
            "away_abbr": "CAR",
            "selection": "home",
            "odds": "2.4",
            "model_prob": "0.512",
            "implied_prob": "0.41667",
            "value": "0.22863",
            "stake": "100.0",
            "status": "pending",
            "payout": "0.0",
            "profit": "0.0",
            "actual_outcome": "",
            "created_at": "2026-06-08T12:40:24.860804",
            "updated_at": "2026-06-08T12:40:24.860804",
        },
    ]

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=legacy_fields)
        writer.writeheader()
        writer.writerows(rows)
    return rows


def test_legacy_rows_survive_a_read_write_round_trip(tmp: Path):
    """
    Historiske rader har ikke de nye utfallskolonnene. De skal kunne leses og
    skrives uten å krasje, uten at noe eksisterende felt endrer verdi, og de
    nye feltene skal bli ukjente (None/tomme) – ikke 0.0.
    """
    import bet_tracker as bt

    legacy_path = tmp / "bet_history.csv"
    written = write_legacy_history(legacy_path)

    old_header = legacy_path.read_text(encoding="utf-8").splitlines()[0].split(",")
    assert set(old_header).isdisjoint(bt.OUTCOME_FIELDS)
    assert old_header == [f for f in bt.BET_FIELDS if f not in set(bt.OUTCOME_FIELDS)]

    rows = bt.load_history(legacy_path)
    assert len(rows) == len(written)
    # Ukjent er ikke null: 0.0 ville lest som "oddsen/EVen var faktisk null".
    for row in rows:
        for field in bt.OUTCOME_FIELDS:
            assert row[field] is None, field

    # Verdiene fra fila skal være der, typekonvertert men uendret.
    first, last = rows[0], rows[-1]
    assert (first["event_id"], first["selection"], first["status"]) == (
        "BOS-STL-2025-12-05", "home", "won",
    )
    assert (first["odds"], first["stake"], first["payout"], first["profit"]) == (
        2.65, 100.0, 265.0, 165.0,
    )
    assert first["season"] == "2025-26"
    # Rad uten season får den utledet av datoen ved innlesing.
    assert last["season"] == bt.season_of("2026-06-10") == "2025-26"

    bt.save_history(rows, legacy_path)

    lines = legacy_path.read_text(encoding="utf-8").splitlines()
    assert lines[0].split(",") == bt.BET_FIELDS
    # De nye kolonnene skrives som tomme celler, ikke som 0.
    n_outcome = len(bt.OUTCOME_FIELDS)
    for line in lines[1:]:
        assert line.split(",")[-n_outcome:] == [""] * n_outcome, line

    reread = bt.load_history(legacy_path)
    assert len(reread) == len(rows)
    assert reread == rows

    # Ingen av de gamle verdiene skal ha flyttet på seg.
    for before, after in zip(rows, reread):
        for field in ("date", "event_id", "selection", "odds", "profit", "status"):
            assert before[field] == after[field], field

    # Porteføljen bygges fortsatt av gamle rader.
    assert bt.build_portfolio_payload(reread, all_seasons=True)["summary"]["total_bets"] == len(rows)


class _RequestsShim:
    """
    Ekte requests-modul med vår egen `get`.

    Vi bytter `nt_odds.requests`, ikke `requests.get`, slik at stubben aldri
    lekker til andre moduler (live/nhl_api.py kaller også requests.get).
    Alt annet — RequestException m.m. — slås opp på den ekte modulen.
    """

    def __init__(self, get):
        self.get = get

    def __getattr__(self, name):
        import requests

        return getattr(requests, name)


class _FakeResponse:
    def __init__(self, status_code=200, events=(({"eventId": 1}),)):
        self.status_code = status_code
        self._events = list(events)
        # _fetch_events_range tar med body-en i RuntimeError-meldingen.
        self.text = f"fake body (status {status_code})"

    def json(self):
        return {"eventList": self._events}


def _with_stubbed_nt(get_func, call):
    """Kjører `call` med NT-kallene stubbet og uten ventetid."""
    from live import nt_odds

    original_requests = nt_odds.requests
    original_pause = nt_odds.RETRY_PAUSE
    nt_odds.requests = _RequestsShim(get_func)
    nt_odds.RETRY_PAUSE = 0  # ingen grunn til å sove i testen
    try:
        return call(nt_odds)
    finally:
        nt_odds.requests = original_requests
        nt_odds.RETRY_PAUSE = original_pause


def test_nt_odds_retries_a_dropped_connection():
    """Ett brutt kall mot NT skal ikke velte den daglige kjøringen."""
    import requests

    calls = []

    def flaky_get(url, params=None, timeout=None):
        calls.append(url)
        if len(calls) == 1:
            raise requests.exceptions.ConnectionError(
                "('Connection aborted.', ConnectionResetError(104, 'Connection reset by peer'))"
            )
        return _FakeResponse()

    events = _with_stubbed_nt(flaky_get, lambda nt: nt._fetch_events_range(3))

    assert len(calls) == 2, calls
    assert events == [{"eventId": 1}], events


def test_nt_odds_retries_a_transient_server_error():
    """503 skal retries på samme måte som et brutt kall."""
    calls = []

    def flaky_get(url, params=None, timeout=None):
        calls.append(url)
        return _FakeResponse(status_code=503 if len(calls) == 1 else 200)

    events = _with_stubbed_nt(flaky_get, lambda nt: nt._fetch_events_range(3))

    assert len(calls) == 2, calls
    assert events == [{"eventId": 1}], events


def test_nt_odds_surfaces_a_persistent_server_error():
    """Svarer NT 503 hele veien, skal siste status bli en RuntimeError."""

    def dead_get(url, params=None, timeout=None):
        return _FakeResponse(status_code=503, events=[])

    def run(nt):
        try:
            nt._fetch_events_range(3)
        except RuntimeError as exc:
            return str(exc)
        return None

    message = _with_stubbed_nt(dead_get, run)
    assert message and "503" in message, message


def test_nt_odds_gives_up_after_the_last_retry():
    """Er NT faktisk nede, skal feilen fortsatt boble opp og gjøre jobben rød."""
    import requests

    calls = []

    def dead_get(url, params=None, timeout=None):
        calls.append(url)
        raise requests.exceptions.ConnectionError("Connection reset by peer")

    def run(nt):
        try:
            nt._fetch_events_range(3)
        except requests.exceptions.ConnectionError:
            return True
        return False

    raised = _with_stubbed_nt(dead_get, run)

    assert raised, "forventet at siste forsøk kaster videre"

    from live import nt_odds

    assert len(calls) == nt_odds.MAX_RETRIES, calls


def test_nt_odds_stub_does_not_leak_to_other_modules():
    """Stubben skal ikke påvirke live/nhl_api.py, som også kaller requests.get."""
    import requests

    from live import nhl_api

    before = requests.get

    def stub_get(url, params=None, timeout=None):
        return _FakeResponse()

    def run(nt):
        # Midt i stubbingen skal den globale requests.get være urørt.
        assert requests.get is before
        assert nhl_api.requests.get is before
        return nt._fetch_events_range(3)

    _with_stubbed_nt(stub_get, run)

    assert requests.get is before


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
            ("rejected_shadow_ledger", test_rejected_bets_go_to_the_shadow_ledger, False),
            ("draw_threshold", test_draws_need_a_higher_ev_threshold_than_home_and_away, False),
            ("draw_does_not_block_home", test_a_failing_draw_does_not_drag_down_a_good_home_bet, False),
            ("one_ledger_per_game", test_a_game_never_lands_in_both_ledgers, False),
            ("shadow_promotion", test_a_bet_moves_out_of_the_shadow_when_the_odds_cross_the_threshold, False),
            ("playoffs_skipped", test_playoff_games_are_skipped_entirely, False),
            ("unknown_type_skipped", test_unknown_game_type_is_never_played, False),
            ("game_type_closest", test_game_type_picks_the_closest_game_in_the_scoreboard_window, False),
            ("season_ledger", test_season_column_and_portfolio_filtering, False),
            ("nt_retry_recovers", test_nt_odds_retries_a_dropped_connection, False),
            ("nt_retry_on_503", test_nt_odds_retries_a_transient_server_error, False),
            ("nt_persistent_503", test_nt_odds_surfaces_a_persistent_server_error, False),
            ("nt_retry_gives_up", test_nt_odds_gives_up_after_the_last_retry, False),
            ("nt_stub_no_leak", test_nt_odds_stub_does_not_leak_to_other_modules, False),
            ("elo_display_abbrs", test_elo_export_uses_display_abbreviations, True),
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
