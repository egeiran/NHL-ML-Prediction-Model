#!/usr/bin/env python3
"""
Offline-tester for markedsloggen og skyggestrategien på vinner inkl. OT.

Dekker:
  - NT-markedene klassifiseres riktig (totals-side fra navnet, props/live ute)
  - en NT-kamp som feiler stopper ikke de andre; langtidsspill hoppes over
  - The Odds API: ingen HTTP uten nøkkel, nøkkelen skrubbes, lav kvote = intet kall
  - lagnavn (Utah, Montréal) og matching mot NT, byttet hjemme/borte, 3-veis avvist
  - devig-metodene, og P(vinner inkl. OT) fra 3-veis-modellen
  - strategien spiller bare med skarp pris, og bare én gang per kamp
  - avregning: OT-seier er vunnet ML-spill, like mål avregnes ikke, sluttodds
    og CLV hentes fra snapshot-loggen, utsatte kamper annulleres
  - snapshot-loggen: månedsfiler, flatten, kvote per måned
  - market_shadow.main skriver logger og rører aldri bet-loggene
  - analyze_market.py bygger rapporten også med tomme logger
  - BET_FIELDS er frosset (frontend og stake_truth leser bet_history.csv)

Krever verken nettverk eller trent modell. `cd NHL && python test_market.py`
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

NOW = datetime(2026, 11, 14, 8, 0, tzinfo=timezone.utc)


def _sel(name, odds, value=None):
    out = {"selectionName": name, "selectionOdds": str(odds), "selectionShortName": name[:9]}
    if value is not None:
        out["selectionValue"] = value
    return out


# Kuttet ned fra et ekte /markets/{eventId}-svar (ANA–NYI, 15.11.2026), med
# navnene og formen akkurat slik NT sender dem.
MARKETS_FIXTURE = {
    "eventId": "8861940.1",
    "markets": [
        {"live": False, "marketLineType": "MONEY", "marketName": "HUB", "selections": [
            _sel("Anaheim Ducks", "2.30", "H"), _sel("Uavgjort", "4.00", "D"),
            _sel("New York Islanders", "2.30", "A")]},
        {"live": False, "marketName": "Vinner (inkludert overtid/straffer)", "selections": [
            _sel("Anaheim Ducks", "1.85", "H"), _sel("New York Islanders", "1.85", "A")]},
        {"live": False, "marketName": "Blir det overtid?", "selections": [
            _sel("Ja", "4.00"), _sel("Nei", "1.22")]},
        {"live": False, "marketName": "Uavgjort tilbakebetales", "selections": [
            _sel("Anaheim Ducks", "1.85", "H"), _sel("New York Islanders", "1.85", "A")]},
        {"live": False, "marketName": "1. periode - uavgjort tilbakebetales", "selections": [
            _sel("Anaheim Ducks", "2.05", "H"), _sel("New York Islanders", "1.62", "A")]},
        # NT: A = Over, H = Under. Siden skal leses fra navnet.
        {"live": False, "marketLineType": "TOTAL", "marketName": "Totalt antall mål - over/under 5.5",
         "selections": [_sel("Over 5.5", "1.42", "A"), _sel("Under 5.5", "2.65", "H")]},
        {"live": False, "marketLineType": "SIDE", "marketName": "Handikap 2-veis -0.5", "selections": [
            _sel("Anaheim Ducks -0.5 ", "2.30", "H"), _sel("New York Islanders +0.5 ", "1.50", "A")]},
        {"live": False, "marketLineType": "TOTAL", "marketName": "Anaheim Ducks Totalt 2.5", "selections": [
            _sel("Over 2.5", "1.45", "A"), _sel("Under 2.5", "2.40", "H")]},
        {"live": False, "marketName": "Korrekt resultat", "selections": [
            _sel("1-1", "35.00", "D"), _sel("2-1", "50.00", "H")]},
        {"live": False, "marketName": "Målpoeng (inkludert overtid)", "selections": [
            _sel("Nazar, Frank 1+", "1.87")]},
        {"live": True, "marketName": "Totalt antall mål - over/under 6.5", "selections": [
            _sel("Over 6.5", "1.90", "A"), _sel("Under 6.5", "1.80", "H")]},
    ],
}


def test_nt_markets_parse():
    from live import nt_markets as nm

    m, unclassified = nm.parse_markets(MARKETS_FIXTURE, nm.TIER_DAILY, "Anaheim Ducks", "New York Islanders")
    assert m["HUB"] == {"home": 2.30, "draw": 4.00, "away": 2.30}, m["HUB"]
    assert m["ML"] == {"home": 1.85, "away": 1.85}
    assert m["OT"] == {"yes": 4.00, "no": 1.22}
    assert m["DNB"] == {"home": 1.85, "away": 1.85}, "periode-DNB skal ikke overskrive kampens DNB"
    assert m["TOTAL"] == {"5.5": {"over": 1.42, "under": 2.65}}, "side fra navn, ikke selectionValue"
    assert m["HCP"] == {"-0.5": {"home": 2.30, "away": 1.50}}
    assert m["TT_HOME"] == {"2.5": {"over": 1.45, "under": 2.40}}
    assert m["CS"] == {"1-1": 35.0, "2-1": 50.0}
    assert "6.5" not in m["TOTAL"], "live-markeder logges ikke"
    assert unclassified == 2, unclassified  # periode-DNB og props

    core, _ = nm.parse_markets(MARKETS_FIXTURE, nm.TIER_CORE, "Anaheim Ducks", "New York Islanders")
    assert "CS" not in core and "TT_HOME" not in core and "ML" in core
    assert abs(nm.overround(m["HUB"]) - (1 / 2.3 * 2 + 0.25)) < 1e-9


def test_nt_snapshot_isolates_failures_and_skips_specials():
    from live import nt_markets as nm, nt_odds

    def ev(eid, home, away, start):
        return {
            "eventId": eid, "homeParticipant": home, "awayParticipant": away,
            "homeParticipantShortName": home, "awayParticipantShortName": away,
            "startTime": start, "tournament": {"name": "USA - NHL"}, "mainMarket": {},
        }

    events = [
        ev("1.1", "Anaheim Ducks", "New York Islanders", "2026-11-15T04:00:00.000+01:00"),
        ev("2.1", "Utah Mammoth", "San Jose Sharks", "2026-11-15T03:00:00.000+01:00"),
        ev("3.1", None, None, "2026-11-15T00:59:00.000+01:00"),  # langtidsspill
        ev("4.1", "Boston Bruins", "Minnesota Wild", "2026-11-20T01:00:00.000+01:00"),  # utenfor horisont
        ev("5.1", "Boston Bruins", "Minnesota Wild", "2026-11-14T08:00:00.000+01:00"),  # allerede i gang
    ]
    original = nt_odds.get_hockey_events
    nt_odds.get_hockey_events = lambda days: events
    try:
        found = nm.nhl_events(2, NOW, 48)
    finally:
        nt_odds.get_hockey_events = original
    assert [e["eid"] for e in found] == ["1.1", "2.1"], found
    assert found[1]["home"] == "UTA" and found[1]["key"] == "UTA-SJS-2026-11-15"
    assert found[0]["start"] == "2026-11-15T03:00:00Z"

    def fetch(eid):
        if eid == "2.1":
            raise RuntimeError("NT markets 2.1: status 503")
        return MARKETS_FIXTURE

    records, stats = nm.snapshot_events(found, NOW, "daily", nm.TIER_CORE, fetch=fetch, pause=0)
    # Bare markeder som ikke klassifiseres telles (periode-DNB og props), ikke tier 2.
    assert stats == {"ok": 1, "failed": 1, "unclassified": 2}, stats
    assert records[0]["key"] == "ANA-NYI-2026-11-15" and records[0]["m"]["ML"]["home"] == 1.85


def test_nt_markets_fetch_uses_retrying_get():
    """fetch_event_markets går via nt_odds._get, så et blaff (503) retries."""
    from live import nt_markets as nm, nt_odds

    calls = []

    class Resp:
        def __init__(self, code):
            self.status_code = code
            self.text = ""

        def json(self):
            return MARKETS_FIXTURE

    class Shim:
        def get(self, url, params=None, timeout=None):
            calls.append(url)
            return Resp(503 if len(calls) == 1 else 200)

        def __getattr__(self, name):
            import requests

            return getattr(requests, name)

    original, pause = nt_odds.requests, nt_odds.RETRY_PAUSE
    nt_odds.requests, nt_odds.RETRY_PAUSE = Shim(), 0
    try:
        payload = nm.fetch_event_markets("8861940.1")
    finally:
        nt_odds.requests, nt_odds.RETRY_PAUSE = original, pause
    assert len(calls) == 2 and calls[0].endswith("/markets/8861940.1"), calls
    assert payload["eventId"] == "8861940.1"


def _with_requests_get(get, call):
    from live import odds_api

    class Shim:
        def __init__(self):
            self.get = get

        def __getattr__(self, name):
            import requests

            return getattr(requests, name)

    original = odds_api.requests
    odds_api.requests = Shim()
    try:
        return call(odds_api)
    finally:
        odds_api.requests = original


def test_odds_api_without_key_makes_no_http_call():
    def boom(*a, **k):
        raise AssertionError("HTTP-kall uten nøkkel")

    saved = os.environ.pop("ODDS_API_KEY", None)
    try:
        res = _with_requests_get(boom, lambda api: api.fetch_odds())
    finally:
        if saved is not None:
            os.environ["ODDS_API_KEY"] = saved
    assert res.status == "no_key" and res.events == []


def test_odds_api_scrubs_the_key_from_errors():
    import requests

    secret = "abc123SECRET"

    def fail(url, params=None, timeout=None):
        raise requests.exceptions.ConnectionError(f"Max retries for url {url}?apiKey={params['apiKey']}")

    res = _with_requests_get(fail, lambda api: api.fetch_odds(key=secret))
    assert res.status == "error" and secret not in res.note and "***" in res.note, res.note

    class Resp:
        status_code = 401
        headers = {"x-requests-remaining": "0", "x-requests-used": "500"}
        text = f"invalid key {secret}"

    calls = []

    def unauthorized(url, params=None, timeout=None):
        calls.append(1)
        return Resp()

    res = _with_requests_get(unauthorized, lambda api: api.fetch_odds(key=secret))
    assert res.status == "error" and len(calls) == 1, "4xx retries ikke"
    assert secret not in res.note and res.remaining == 0 and res.used == 500


def _odds_api_event(home, away, start, books):
    return {
        "id": f"{home}-{away}", "sport_key": "icehockey_nhl", "commence_time": start,
        "home_team": home, "away_team": away,
        "bookmakers": [
            {"key": key, "last_update": start, "markets": markets} for key, markets in books.items()
        ],
    }


def _h2h(home, away, ph, pa):
    return {"key": "h2h", "outcomes": [{"name": home, "price": ph}, {"name": away, "price": pa}]}


def test_odds_api_parse_and_match():
    from live import odds_api

    payload = [
        _odds_api_event("Utah Mammoth", "San Jose Sharks", "2026-11-15T02:05:00Z", {
            "pinnacle": [_h2h("Utah Mammoth", "San Jose Sharks", 1.60, 2.45),
                         {"key": "totals", "outcomes": [
                             {"name": "Over", "price": 1.95, "point": 6.5},
                             {"name": "Under", "price": 1.87, "point": 6.5}]}],
            "unibet_se": [_h2h("Utah Mammoth", "San Jose Sharks", 1.58, 2.40)],
        }),
        _odds_api_event("Montréal Canadiens", "Colorado Avalanche", "2026-11-15T00:00:00Z", {
            # 3-veis h2h (med Draw) er ordinær tid og skal forkastes.
            "pinnacle": [{"key": "h2h", "outcomes": [
                {"name": "Montréal Canadiens", "price": 2.6}, {"name": "Draw", "price": 4.2},
                {"name": "Colorado Avalanche", "price": 2.4}]}],
            "betfair_ex_eu": [_h2h("Montréal Canadiens", "Colorado Avalanche", 2.30, 1.72)],
        }),
        # Nøytral bane: NT har BOS hjemme, Odds API har MIN hjemme.
        _odds_api_event("Minnesota Wild", "Boston Bruins", "2026-11-15T00:00:00Z", {
            "pinnacle": [_h2h("Minnesota Wild", "Boston Bruins", 1.9, 1.95)],
        }),
        _odds_api_event("Atlantis Fish", "Boston Bruins", "2026-11-15T00:00:00Z", {}),
    ]
    sharp = odds_api.parse_events(payload)
    assert [(s["home"], s["away"]) for s in sharp] == [("UTA", "SJS"), ("MTL", "COL"), ("MIN", "BOS")]
    uta = sharp[0]
    assert uta["books"]["pinnacle"]["ML"] == {"home": 1.60, "away": 2.45}
    assert uta["books"]["pinnacle"]["TOTAL"] == {"6.5": {"over": 1.95, "under": 1.87}}
    assert "unibet_se" not in uta["books"] and uta["books"]["consensus"]["n"] == 2
    assert "pinnacle" not in sharp[1]["books"], "3-veis-h2h skal ikke bli ML"
    assert sharp[1]["books"]["betfair_ex_eu"]["ML"]["home"] == 2.30

    nt = [
        {"key": "UTA-SJS-2026-11-15", "home": "UTA", "away": "SJS", "start": "2026-11-15T02:00:00Z"},
        {"key": "MTL-COL-2026-11-15", "home": "MTL", "away": "COL", "start": "2026-11-15T06:30:00Z"},
        {"key": "BOS-MIN-2026-11-15", "home": "BOS", "away": "MIN", "start": "2026-11-15T00:00:00Z"},
    ]
    matches = odds_api.match_to_nt(sharp, nt)
    assert matches["UTA-SJS-2026-11-15"]["match"] == "ok"
    assert "MTL-COL-2026-11-15" not in matches, "mer enn 3 t avvik i starttid"
    assert matches["BOS-MIN-2026-11-15"]["match"] == "swapped"


def test_low_quota_means_no_call():
    import market_shadow
    from live import odds_api
    from utils import odds_log

    tmp = Path(tempfile.mkdtemp())
    try:
        odds_log.append_run({"run_at": "2026-11-13T22:40:00Z", "job": "closing", "quota_remaining": 12}, tmp)
        os.environ["ODDS_API_KEY"] = "test-key"
        original = odds_api.fetch_odds
        odds_api.fetch_odds = lambda **k: (_ for _ in ()).throw(AssertionError("kall med lav kvote"))
        try:
            status, records, matches, remaining, _ = market_shadow.sharp_snapshot(
                [{"key": "k", "home": "BOS", "away": "MIN", "start": "2026-11-15T00:00:00Z"}],
                NOW, "daily", ("h2h",), tmp,
            )
        finally:
            odds_api.fetch_odds = original
        assert status == "low_quota" and records == [] and remaining == 12
        # Ny måned: kvoten fra forrige måned teller ikke.
        assert odds_log.last_quota_remaining(datetime(2026, 12, 1, 8, tzinfo=timezone.utc), tmp) is None
        # Ingen NT-kamper: ingen kall, uansett nøkkel.
        assert market_shadow.sharp_snapshot([], NOW, "daily", ("h2h",), tmp)[0] == "no_games"
    finally:
        os.environ.pop("ODDS_API_KEY", None)
        shutil.rmtree(tmp, ignore_errors=True)


def test_devig_methods():
    from utils.devig import devig, multiplicative, power, shin

    for fn in (multiplicative, power, shin):
        p = fn([1.85, 1.85])
        assert abs(p[0] - 0.5) < 1e-9 and abs(sum(p) - 1) < 1e-9, (fn.__name__, p)
        q = fn([1.40, 3.20])
        assert abs(sum(q) - 1) < 1e-9
    fav_mult, fav_pow, fav_shin = multiplicative([1.40, 3.20])[0], power([1.40, 3.20])[0], shin([1.40, 3.20])[0]
    # Power/Shin tar mer av marginen fra longshoten → favoritten får høyere p.
    assert fav_pow > fav_mult and fav_shin > fav_mult, (fav_mult, fav_pow, fav_shin)
    three = devig([2.3, 4.0, 2.3], "power")
    assert abs(sum(three) - 1) < 1e-9 and abs(three[0] - three[2]) < 1e-12
    try:
        devig([1.0, 2.0])
    except ValueError:
        pass
    else:
        raise AssertionError("odds 1,0 skal avvises")


def test_moneyline_from_three_way():
    from utils.value_utils import OT_HOME_BASE_RATE, ml_from_three_way, ot_home_share

    assert ot_home_share(0.4, 0.35, {}) == OT_HOME_BASE_RATE
    meta = {"ot_home": {"intercept": -0.05, "slope": 0.27}}
    q_strong, q_even, q_weak = (ot_home_share(0.55, 0.23, meta), ot_home_share(0.4, 0.4, meta),
                                ot_home_share(0.23, 0.55, meta))
    assert q_strong > q_even > q_weak and abs(q_even - 0.4875) < 1e-3
    home, away = ml_from_three_way(0.43, 0.23, 0.34, 0.5)
    assert abs(home - (0.43 + 0.23 * 0.5)) < 1e-12 and abs(home + away - 1) < 1e-12


def _nt_record(key="BOS-MIN-2026-11-15", start="2026-11-15T00:00:00Z", ml=(2.20, 1.70)):
    home, away = key.split("-")[:2]
    m = {"HUB": {"home": 2.6, "draw": 3.9, "away": 2.2}}
    if ml:
        m["ML"] = {"home": ml[0], "away": ml[1]}
    return {"v": 1, "at": "2026-11-14T08:00:00Z", "job": "daily", "eid": "1.1", "key": key,
            "start": start, "home": home, "away": away, "m": m}


def _match(pin=(2.00, 1.87), match="ok", betfair=None, at="2026-11-14T08:00:00Z", key="BOS-MIN-2026-11-15"):
    books = {}
    if pin:
        books["pinnacle"] = {"ML": {"home": pin[0], "away": pin[1]}}
    if betfair:
        books["betfair_ex_eu"] = {"ML": {"home": betfair[0], "away": betfair[1]}}
    sharp = {"v": 1, "at": at, "key": key, "match": match, "home": "BOS", "away": "MIN",
             "start": "2026-11-15T00:00:00Z", "books": books}
    return {"sharp": sharp, "match": match}


def test_strategy_bets_only_with_a_sharp_price():
    import strategy_ml as s
    from utils.devig import power

    row = s.decide(_nt_record(), _match(), NOW, ev_min=0.03)
    p_home = power([2.00, 1.87])[0]
    assert row["status"] == "pending" and row["selection"] == "home", row
    assert abs(row["ev"] - (p_home * 2.20 - 1)) < 1e-12 and row["stake"] == 100.0
    assert row["sharp_source"] == "pinnacle" and row["season"] == "2026-27" and row["date"] == "2026-11-15"

    assert s.decide(_nt_record(), None, NOW)["skip_reason"] == "no_sharp"
    assert s.decide(_nt_record(), _match(pin=None), NOW)["skip_reason"] == "no_sharp"
    assert s.decide(_nt_record(), _match(match="swapped"), NOW)["skip_reason"] == "sharp_swapped"
    assert s.decide(_nt_record(ml=None), _match(), NOW)["skip_reason"] == "no_nt_ml"
    # NT mot seg selv gir aldri spill: samme pris som Pinnacle → EV < 0.
    assert s.decide(_nt_record(ml=(2.0, 1.87)), _match(), NOW)["skip_reason"] == "below_ev"
    # Feil kamp/byttede lag: NT og Pinnacle langt fra hverandre.
    assert s.decide(_nt_record(ml=(1.30, 3.60)), _match(pin=(3.2, 1.38)), NOW)["skip_reason"] == "mismatch"
    # Oddstak.
    big = s.decide(_nt_record(ml=(4.4, 1.25)), _match(pin=(4.0, 1.30)), NOW)
    assert big["skip_reason"] == "odds_cap", big
    # Betfair-børsen bare med lav margin.
    assert s.decide(_nt_record(), _match(pin=None, betfair=(2.02, 1.98)), NOW)["sharp_source"] == "betfair_ex_eu"
    assert s.decide(_nt_record(), _match(pin=None, betfair=(1.90, 1.90)), NOW)["skip_reason"] == "no_sharp"
    # Sperrene (kamptype, tidlig sesong) går foran alt.
    gated = s.decide(_nt_record(), _match(), NOW, gate=lambda r: "early_season")
    assert gated["status"] == "nobet" and gated["skip_reason"] == "early_season"
    # Modellens ML-sannsynlighet logges, men styrer ikke spillet.
    with_model = s.decide(_nt_record(), _match(), NOW,
                          model_row={"model_home_win": 0.30, "model_draw": 0.23, "model_away_win": 0.47})
    assert with_model["status"] == "pending" and abs(with_model["p_model_ml_home"] - (0.30 + 0.23 * 0.507)) < 1e-9


def test_strategy_decides_each_game_once_within_horizon():
    import strategy_ml as s

    rows = []
    soon = _nt_record()
    later = _nt_record(key="TOR-EDM-2026-11-16", start="2026-11-16T00:30:00Z")
    added = s.decide_new(rows, [soon, later], {soon["key"]: _match()}, NOW)
    assert [r["game_key"] for r in added] == ["BOS-MIN-2026-11-15"], "kamper > 24 t fram venter"
    again = s.decide_new(rows, [soon], {soon["key"]: _match(pin=(1.5, 2.8))}, NOW + timedelta(hours=2))
    assert again == [] and len(rows) == 1, "én låst beslutning per kamp"
    nxt = s.decide_new(rows, [later], {}, NOW + timedelta(days=1))
    assert len(nxt) == 1 and nxt[0]["skip_reason"] == "no_sharp" and len(rows) == 2


def test_strategy_settlement_and_clv():
    import strategy_ml as s
    from utils import odds_log
    from utils.devig import power

    rows = []
    s.decide_new(rows, [_nt_record()], {"BOS-MIN-2026-11-15": _match()}, NOW)
    nobet = _nt_record(key="TOR-EDM-2026-11-15", start="2026-11-15T00:30:00Z", ml=(2.0, 1.87))
    s.decide_new(rows, [nobet], {"TOR-EDM-2026-11-15": _match(key="TOR-EDM-2026-11-15")}, NOW)
    tie = _nt_record(key="LAK-CGY-2026-11-15", start="2026-11-15T03:00:00Z")
    s.decide_new(rows, [tie], {}, NOW)
    assert [r["status"] for r in rows] == ["pending", "nobet", "nobet"]

    late_nt = _nt_record(ml=(1.95, 1.92))
    late_nt["at"] = "2026-11-14T22:40:00Z"
    after_start = _nt_record(ml=(1.50, 2.60))
    after_start["at"] = "2026-11-15T00:10:00Z"  # etter start: skal ikke brukes
    late_sharp = _match(pin=(1.92, 1.96), at="2026-11-14T22:40:00Z")["sharp"]
    nt_by_key = odds_log.by_key([_nt_record(), late_nt, after_start])
    sharp_by_key = odds_log.by_key([_match()["sharp"], late_sharp])

    results = {
        # OT-seier for hjemmelaget: ML-spillet på hjemme vinner, 3-veis sier uavgjort.
        ("2026-11-15", "BOS", "MIN"): {"finished": True, "outcome": "draw", "home_goals": 3, "away_goals": 2},
        ("2026-11-15", "TOR", "EDM"): {"finished": True, "outcome": "away", "home_goals": 1, "away_goals": 4},
        ("2026-11-15", "LAK", "CGY"): {"finished": True, "outcome": "draw", "home_goals": 2, "away_goals": 2},
    }
    too_early = s.settle(rows, NOW + timedelta(hours=17), lambda *k: results[k], nt_by_key, sharp_by_key)
    assert too_early == 0, "avregnes ikke før kampen er ferdig"
    n = s.settle(rows, NOW + timedelta(hours=30), lambda *k: results[k], nt_by_key, sharp_by_key)
    assert n == 2, n
    bet, skipped, tied = rows
    assert bet["status"] == "won" and bet["ml_outcome"] == "home" and bet["reg_outcome"] == "draw"
    assert bet["profit"] == 120.0 and bet["payout"] == 220.0
    assert bet["close_nt_ml_home"] == 1.95 and bet["close_at"] == "2026-11-14T22:40:00Z"
    assert abs(bet["clv_nt"] - (2.20 / 1.95 - 1)) < 1e-12
    assert abs(bet["clv_sharp"] - (2.20 * power([1.92, 1.96])[0] - 1)) < 1e-12
    assert skipped["status"] == "nobet" and skipped["ml_outcome"] == "away" and skipped["clv_sharp"] is None
    assert not tied["settled_at"], "like mål avregnes ikke"

    # Utsatt kamp: et spill annulleres etter tre dager.
    postponed = []
    s.decide_new(postponed, [_nt_record()], {"BOS-MIN-2026-11-15": _match()}, NOW)
    s.settle(postponed, NOW + timedelta(days=4), lambda *k: {"finished": False})
    assert postponed[0]["status"] == "void" and postponed[0]["profit"] == 0.0


def test_strategy_summary_and_promotion():
    import strategy_ml as s

    rows = [{"status": "won", "stake": 100.0, "profit": 90.0, "clv_sharp": 0.04, "clv_nt": 0.02,
             "p_fair_home": 0.5} for _ in range(s.TARGET_BETS)]
    rows += [{"status": "nobet", "skip_reason": "below_ev", "p_fair_home": 0.5}]
    summary = s.summarize(rows)
    assert summary["bets"] == s.TARGET_BETS and summary["promotable"] is True
    assert summary["clv_sharp"]["ci_low"] == 0.04 and summary["skip_reasons"] == {"below_ev": 1}
    assert s.summarize(rows[:10])["promotable"] is False, "for få spill"
    mixed = [{"status": "lost", "stake": 100.0, "profit": -100.0, "clv_sharp": v}
             for v in [-0.05, 0.06] * (s.TARGET_BETS // 2)]
    assert s.summarize(mixed)["promotable"] is False, "CI krysser null"
    assert s.summarize([])["clv_sharp"]["mean"] is None


def test_strategy_csv_round_trip():
    import strategy_ml as s

    tmp = Path(tempfile.mkdtemp())
    try:
        path = tmp / "strategy_ml.csv"
        s.save([], path)
        assert path.read_text().splitlines()[0].split(",") == s.FIELDS, "header også for tom logg"
        rows = []
        s.decide_new(rows, [_nt_record()], {"BOS-MIN-2026-11-15": _match()}, NOW)
        s.save(rows, path)
        back = s.load(path)
        assert back[0]["odds"] == 2.20 and back[0]["status"] == "pending" and back[0]["clv_sharp"] is None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_snapshot_log_round_trip():
    from utils import odds_log

    tmp = Path(tempfile.mkdtemp())
    try:
        rec = _nt_record()
        odds_log.append("nt", [rec], NOW, tmp)
        odds_log.append("nt", [dict(rec, at="2026-12-01T08:00:00Z")], datetime(2026, 12, 1, 8, tzinfo=timezone.utc), tmp)
        assert sorted(p.name for p in tmp.iterdir()) == ["nt_2026-11.jsonl", "nt_2026-12.jsonl"]
        assert odds_log.append("nt", [], NOW, tmp) is None
        back = list(odds_log.iter_records("nt", tmp))
        assert len(back) == 2 and back[0] == rec
        flat = odds_log.flatten(back[0])
        assert {"market": "ML", "line": "", "side": "home", "odds": 2.20} | {
            "key": rec["key"], "at": rec["at"], "job": "daily"} in flat
        lined = odds_log.flatten({"key": "k", "m": {"TOTAL": {"5.5": {"over": 1.7, "under": 2.0}}}})
        assert [(r["line"], r["side"]) for r in lined] == [("5.5", "over"), ("5.5", "under")]
        assert odds_log.last_before(back, "2026-11-20T00:00:00Z")["at"] == rec["at"]
        try:
            odds_log.append("bogus", [rec], NOW, tmp)
        except ValueError:
            pass
        else:
            raise AssertionError("ukjent type skal avvises")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else ""


def test_market_shadow_main_logs_and_leaves_bet_ledgers_alone():
    import bet_tracker as bt
    import market_shadow
    import strategy_ml as s
    from live import nt_markets, odds_api

    tmp = Path(tempfile.mkdtemp())
    ledgers = [bt.BET_HISTORY_PATH, bt.BET_SHADOW_PATH]
    before = [_digest(p) for p in ledgers]
    saved = {
        "events": nt_markets.nhl_events, "fetch": nt_markets.fetch_event_markets,
        "odds": odds_api.fetch_odds, "gate": market_shadow._gate,
        "model": market_shadow._model_rows, "meta": market_shadow._model_meta,
        "lookup": bt._lookup_result,
    }
    os.environ["NHL_ODDS_DIR"] = str(tmp)
    os.environ["NHL_STRATEGY_ML_PATH"] = str(tmp / "strategy_ml.csv")
    os.environ["ODDS_API_KEY"] = "test-key"
    soon = (datetime.now(timezone.utc) + timedelta(hours=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    events = [{"eid": "8861940.1", "key": f"ANA-NYI-{soon[:10]}", "start": soon, "home": "ANA",
               "away": "NYI", "home_name": "Anaheim Ducks", "away_name": "New York Islanders"}]
    payload = [_odds_api_event("Anaheim Ducks", "New York Islanders", soon, {
        "pinnacle": [_h2h("Anaheim Ducks", "New York Islanders", 1.80, 2.10)]})]
    try:
        nt_markets.nhl_events = lambda days, now, horizon: events
        nt_markets.fetch_event_markets = lambda eid: MARKETS_FIXTURE
        odds_api.fetch_odds = lambda markets=("h2h",), **k: odds_api.OddsApiResult(
            "ok", payload, remaining=480, used=20)
        market_shadow._gate = lambda row: None
        market_shadow._model_rows = lambda: {}
        market_shadow._model_meta = lambda: {}
        bt._lookup_result = lambda *a: None
        nt_markets.CALL_PAUSE = 0

        assert market_shadow.main(["--job", "daily"]) == 0
        assert market_shadow.main(["--job", "closing"]) == 0
    finally:
        nt_markets.nhl_events, nt_markets.fetch_event_markets = saved["events"], saved["fetch"]
        odds_api.fetch_odds = saved["odds"]
        market_shadow._gate, market_shadow._model_rows = saved["gate"], saved["model"]
        market_shadow._model_meta, bt._lookup_result = saved["meta"], saved["lookup"]
        for k in ("NHL_ODDS_DIR", "NHL_STRATEGY_ML_PATH", "ODDS_API_KEY"):
            os.environ.pop(k, None)
    try:
        runs = (tmp / "runs.csv").read_text().splitlines()
        assert len(runs) == 3 and runs[1].split(",")[1] == "daily", runs
        assert ",ok,1,1,0," in runs[1] and ",480,20," in runs[1], runs[1]
        nt_lines = list(tmp.glob("nt_*.jsonl"))[0].read_text().splitlines()
        sharp_lines = list(tmp.glob("sharp_*.jsonl"))[0].read_text().splitlines()
        assert len(nt_lines) == 2 and len(sharp_lines) == 2
        assert json.loads(sharp_lines[0])["match"] == "ok"
        assert "test-key" not in (tmp / "runs.csv").read_text()
        rows = s.load(tmp / "strategy_ml.csv")
        # NT 1.85/1.85 mot Pinnacle 1.80/2.10: borte har EV ≈ −0,14, hjemme ≈ +0,0.
        assert len(rows) == 1 and rows[0]["sharp_source"] == "pinnacle", rows
        assert [_digest(p) for p in ledgers] == before, "bet-loggene skal aldri røres"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_analyze_market_report():
    """Rapporten bygges uten pandas, også med tomme snapshot- og strategilogger."""
    import analyze_market as am
    import strategy_ml as s

    tmp = Path(tempfile.mkdtemp())
    try:
        empty = am.build_report(directory=tmp, strategy_path=tmp / "none.csv")
        assert "## A." in empty and "## B." in empty and "## C." in empty
        assert "Ikke nok data ennå (n=0" in empty and "Ingen kamper vurdert" in empty

        rows = []
        s.decide_new(rows, [_nt_record()], {"BOS-MIN-2026-11-15": _match()}, NOW)
        s.save(rows, tmp / "strategy_ml.csv")
        report = am.build_report(directory=tmp, strategy_path=tmp / "strategy_ml.csv")
        assert "1 kamper vurdert, 1 med Pinnacle-pris. 1 spill (1 åpne)" in report, report

        base = am.base_rates()
        assert abs(sum(base.values()) - 1) < 1e-9 and 0.42 < base["home"] < 0.44
        diffs = [0.1] * 50
        lo, hi = am.bootstrap_ci(diffs, rounds=200)
        assert abs(lo - 0.1) < 1e-12 and abs(hi - 0.1) < 1e-12
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_bet_fields_are_frozen():
    """bet_history.csv leses av frontend og stake_truth. Endres skjemaet, skal det være bevisst."""
    import bet_tracker as bt

    assert bt.BET_FIELDS == [
        "season", "date", "event_id", "start_time", "home_abbr", "away_abbr", "selection",
        "odds", "model_prob", "implied_prob", "value", "stake", "status", "payout", "profit",
        "actual_outcome", "created_at", "updated_at",
        "odds_home", "odds_draw", "odds_away", "model_home_win", "model_draw", "model_away_win",
        "implied_home_prob", "implied_draw_prob", "implied_away_prob",
        "value_home", "value_draw", "value_away",
        "close_odds_home", "close_odds_draw", "close_odds_away", "close_odds_at",
    ], bt.BET_FIELDS
    assert bt.season_of("2026-07-01") == "2026-27", "season_of re-eksporteres fra utils.seasons"


def main() -> int:
    cases = [
        ("nt_markets_parse", test_nt_markets_parse),
        ("nt_snapshot_isolated", test_nt_snapshot_isolates_failures_and_skips_specials),
        ("nt_markets_retry", test_nt_markets_fetch_uses_retrying_get),
        ("odds_api_no_key", test_odds_api_without_key_makes_no_http_call),
        ("odds_api_scrub", test_odds_api_scrubs_the_key_from_errors),
        ("odds_api_parse_match", test_odds_api_parse_and_match),
        ("low_quota_no_call", test_low_quota_means_no_call),
        ("devig_methods", test_devig_methods),
        ("ml_from_three_way", test_moneyline_from_three_way),
        ("strategy_needs_sharp", test_strategy_bets_only_with_a_sharp_price),
        ("strategy_once_per_game", test_strategy_decides_each_game_once_within_horizon),
        ("strategy_settlement", test_strategy_settlement_and_clv),
        ("strategy_summary", test_strategy_summary_and_promotion),
        ("strategy_csv", test_strategy_csv_round_trip),
        ("snapshot_log", test_snapshot_log_round_trip),
        ("market_shadow_main", test_market_shadow_main_logs_and_leaves_bet_ledgers_alone),
        ("analyze_market_report", test_analyze_market_report),
        ("bet_fields_frozen", test_bet_fields_are_frozen),
    ]
    failures = 0
    for name, case in cases:
        try:
            case()
        except Exception as exc:
            failures += 1
            import traceback

            traceback.print_exc()
            print(f"FEIL  {name}: {type(exc).__name__}: {exc}")
        else:
            print(f"OK    {name}")
    print("\nAlle tester passerte" if not failures else f"\n{failures} test(er) feilet")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
