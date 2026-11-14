"""
Alle relevante Norsk Tipping-markeder for NHL-kampene, ikke bare HUB.

`nt_odds.py` leser bare `mainMarket` fra eventlista (HUB = 1X2 etter ordinær
tid, ~12 % margin). Per kamp har NT rundt 85 markeder på
`/markets/{eventId}`, og flere av dem er langt billigere:

    HUB                                    ~12 %
    Vinner (inkludert overtid/straffer)     ~7 %
    Blir det overtid?                       ~7 %
    Uavgjort tilbakebetales                 ~8 %
    Totalt antall mål - over/under X.5      ~8 %

Her klassifiseres de vi vil logge til korte koder (HUB, ML, OT, DNB, TOTAL,
HCP, og på den daglige kjøringen også TT_HOME/TT_AWAY og CS). Spillerprops,
periodemarkeder og kombinasjoner droppes: de er dyre, mange og ikke noe vi
modellerer.

Fallgruver i NT-dataene (verifisert mot ekte svar):
  - Totals bruker `selectionValue` "A" for Over og "H" for Under. Siden leses
    derfor alltid fra navnet («Over 5.5»), aldri fra selectionValue.
  - «Blir det overtid?» har ingen selectionValue; utvalgene heter Ja/Nei.
  - Handikap-utvalgene har mellomrom bakerst, og linja (sett fra hjemmelaget)
    står i markedsnavnet: «Handikap 2-veis -0.5».
  - Eventlista inneholder langtidsspill uten deltakere. De hoppes over.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from live import nt_odds

MARKETS_URL = "https://api.norsk-tipping.no/OddsenGameInfo/v1/api/markets/{event_id}"
# Liten pause mellom kallene, ~16 kamper per kjøring. NT har strupet oss før.
CALL_PAUSE = 0.2

# Tier 1 logges på hver kjøring (også kveldens closing-kjøringer), tier 2 bare
# på den daglige: lagtotaler og korrekt resultat er grunnlag for målmodellen i
# fase 3, men trenger ikke en tidsserie gjennom kvelden.
TIER_CORE = 1
TIER_DAILY = 2

_TOTAL_RE = re.compile(r"^totalt antall mål - over/under (\d+(?:\.\d+)?)$")
_HCP_RE = re.compile(r"^handikap 2-veis ([+-]?\d+(?:\.\d+)?)$")
_TEAM_TOTAL_RE = re.compile(r"^(.+) totalt (\d+(?:\.\d+)?)$")

LINED_CODES = {"TOTAL", "HCP", "TT_HOME", "TT_AWAY"}


def _clean(text: Any) -> str:
    return " ".join(str(text or "").split()).casefold()


def classify_market(
    name: Any,
    home_name: Optional[str] = None,
    away_name: Optional[str] = None,
) -> Optional[Tuple[str, Optional[str], int]]:
    """
    (kode, linje, tier) for et NT-markedsnavn, eller None hvis det ikke logges.

    Matcher på casefold og regex, ikke eksakte strenger: NT-navnene er ikke et
    stabilt API, og en liten omskriving skal heller gi et fall i antall
    klassifiserte markeder (som logges) enn en stille feilklassifisering.
    """
    n = _clean(name)
    if not n:
        return None
    if n == "hub":
        return ("HUB", None, TIER_CORE)
    if "vinner" in n and "overtid" in n and "periode" not in n:
        return ("ML", None, TIER_CORE)
    if n.startswith("blir det overtid"):
        return ("OT", None, TIER_CORE)
    if n == "uavgjort tilbakebetales":
        return ("DNB", None, TIER_CORE)
    m = _TOTAL_RE.match(n)
    if m:
        return ("TOTAL", m.group(1), TIER_CORE)
    m = _HCP_RE.match(n)
    if m:
        return ("HCP", m.group(1), TIER_CORE)
    if n == "korrekt resultat":
        return ("CS", None, TIER_DAILY)
    m = _TEAM_TOTAL_RE.match(n)
    if m:
        team = m.group(1)
        if home_name and team == _clean(home_name):
            return ("TT_HOME", m.group(2), TIER_DAILY)
        if away_name and team == _clean(away_name):
            return ("TT_AWAY", m.group(2), TIER_DAILY)
    return None


def _odds(sel: Dict[str, Any]) -> Optional[float]:
    try:
        value = float(sel.get("selectionOdds"))
    except (TypeError, ValueError):
        return None
    return value if value > 1.0 else None


def _side(code: str, sel: Dict[str, Any]) -> Optional[str]:
    """Hvilken side et utvalg er, i vår egen nøkkel (home/draw/away, over/under …)."""
    value = str(sel.get("selectionValue") or "").strip().upper()
    name = _clean(sel.get("selectionName"))
    if code == "HUB":
        return {"H": "home", "D": "draw", "A": "away"}.get(value)
    if code in {"ML", "DNB", "HCP"}:
        return {"H": "home", "A": "away"}.get(value)
    if code == "OT":
        return {"ja": "yes", "nei": "no"}.get(name)
    if code in {"TOTAL", "TT_HOME", "TT_AWAY"}:
        # Aldri selectionValue her: NT bruker A for Over og H for Under.
        if name.startswith("over"):
            return "over"
        if name.startswith("under"):
            return "under"
        return None
    if code == "CS":
        return name.replace(" ", "") or None
    return None


def parse_markets(
    payload: Dict[str, Any],
    tier_max: int = TIER_DAILY,
    home_name: Optional[str] = None,
    away_name: Optional[str] = None,
) -> Tuple[Dict[str, Any], int]:
    """
    Kompakt markedsdict fra et `/markets/{eventId}`-svar, pluss antall markeder
    som ikke ble klassifisert (inkludert props – tallet brukes bare til å se
    om NT har endret navn, ved at det plutselig hopper).

        {"HUB": {"home": 2.3, "draw": 4.0, "away": 2.3},
         "ML": {"home": 1.85, "away": 1.85},
         "OT": {"yes": 4.0, "no": 1.22},
         "TOTAL": {"5.5": {"over": 1.42, "under": 2.65}}, ...}

    Live-markeder hoppes over. Finnes samme marked to ganger, står det første.
    """
    out: Dict[str, Any] = {}
    unclassified = 0
    for market in payload.get("markets") or []:
        if market.get("live"):
            continue
        cls = classify_market(market.get("marketName"), home_name, away_name)
        if cls is None:
            unclassified += 1
            continue
        code, line, tier = cls
        if tier > tier_max:
            continue
        prices: Dict[str, float] = {}
        for sel in market.get("selections") or []:
            side, odds = _side(code, sel), _odds(sel)
            if side and odds and side not in prices:
                prices[side] = odds
        if not prices:
            continue
        if code in LINED_CODES:
            out.setdefault(code, {}).setdefault(line, prices)
        else:
            out.setdefault(code, prices)
    return out, unclassified


def overround(prices: Dict[str, float]) -> Optional[float]:
    """Σ 1/odds over utvalgene i ett marked (1,0 = ingen margin)."""
    values = [v for v in prices.values() if v and v > 0]
    if len(values) < 2:
        return None
    return sum(1.0 / v for v in values)


def fetch_event_markets(event_id: str) -> Dict[str, Any]:
    """Rått `/markets/{eventId}`-svar. Går via nt_odds._get (retry + teststub)."""
    r = nt_odds._get(MARKETS_URL.format(event_id=event_id))
    if r.status_code != 200:
        raise RuntimeError(f"NT markets {event_id}: status {r.status_code}")
    return r.json()


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def game_key(home_abbr: str, away_abbr: str, start_time: str) -> str:
    """
    Samme nøkkel som bet-loggene: HJEMME-BORTE-YYYY-MM-DD med datoen i NTs
    egen offset (norsk tid). Se bet_tracker.normalize_event_id: NTs eventId
    («8861778.1») er ikke et heltall, så loggene faller alltid tilbake hit.
    """
    return f"{home_abbr}-{away_abbr}-{str(start_time)[:10]}"


def nhl_events(days: int, now: datetime, horizon_hours: float) -> List[Dict[str, Any]]:
    """
    NHL-kamper hos NT som starter i (now, now + horizon_hours], med begge lag
    mappet. Hver kamp: eid (NTs rå id), key, start (UTC), lag og lagnavn.
    """
    out = []
    for ev in nt_odds.get_hockey_events(days):
        if not ev.get("homeParticipant") or not ev.get("awayParticipant"):
            continue
        game = nt_odds._nhl_event(ev)
        if game is None or not game.get("home_abbr") or not game.get("away_abbr"):
            continue
        start = nt_odds._parse_start_time(game["startTime"])
        if start is None or start.tzinfo is None:
            continue
        if not now < start <= now + timedelta(hours=horizon_hours):
            continue
        out.append({
            "eid": str(ev.get("eventId")),
            "key": game_key(game["home_abbr"], game["away_abbr"], game["startTime"]),
            "start": _utc(start),
            "start_local": game["startTime"],
            "home": game["home_abbr"],
            "away": game["away_abbr"],
            "home_name": ev.get("homeParticipant"),
            "away_name": ev.get("awayParticipant"),
        })
    return out


def snapshot_events(
    events: List[Dict[str, Any]],
    now: datetime,
    job: str,
    tier_max: int,
    fetch=None,
    pause: float = CALL_PAUSE,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    Henter og parser markedene for hver kamp. En kamp som feiler stopper ikke
    de andre; tellingene går til runs.csv.
    """
    fetch = fetch or fetch_event_markets
    records: List[Dict[str, Any]] = []
    stats = {"ok": 0, "failed": 0, "unclassified": 0}
    for i, ev in enumerate(events):
        if i and pause:
            time.sleep(pause)
        try:
            payload = fetch(ev["eid"])
            markets, unclassified = parse_markets(
                payload, tier_max, ev.get("home_name"), ev.get("away_name")
            )
        except Exception as exc:  # nettverk, JSON, uventet form
            stats["failed"] += 1
            print(f"  [WARN] NT-markeder for {ev.get('key')}: {type(exc).__name__}: {exc}")
            continue
        stats["ok"] += 1
        stats["unclassified"] += unclassified
        records.append({
            "v": 1,
            "at": _utc(now),
            "job": job,
            "eid": ev["eid"],
            "key": ev["key"],
            "start": ev["start"],
            "home": ev["home"],
            "away": ev["away"],
            "m": markets,
        })
    return records, stats
