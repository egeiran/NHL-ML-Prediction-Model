"""
Skarpe referanseodds (Pinnacle m.fl.) fra The Odds API, gratisnivået.

Hvorfor: NT-oddsen alene kan ikke si om et spill har verdi. Fjerner man NTs
margin fra NTs egne priser, blir EV negativ per konstruksjon. Pinnacle har
~2–3 % margin og regnes som markedets beste anslag; NT-odds over Pinnacles
margin-frie pris er den mest velprøvde kilden til edge mot en «myk» bookmaker.

Gratisnivået gir 500 kreditter i måneden. Kostnad per kall = antall markeder ×
antall regioner (eu = 1), og kall uten kamper koster ingenting. Daglig
h2h+totals (2) og fire closing-kjøringer med h2h (4) blir ~180 i måneden.

Sikkerhet: nøkkelen står i URL-en (apiKey=...). requests-unntak tar med URL-en
i meldingen, og runs.csv committes – derfor går alle meldinger gjennom
`scrub()` før de skrives eller printes.

Uten ODDS_API_KEY gjøres ingen HTTP-kall; status blir "no_key" og resten av
pipelinen går som før.
"""
from __future__ import annotations

import os
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

import requests

from live.nt_odds import TEAM_MAP, _normalize
from utils.team_alias import to_display

ODDS_URL = "https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds"
HTTP_TIMEOUT = 10
# Bøker vi lagrer per kamp. Konsensus regnes over alle bøkene i svaret.
KEEP_BOOKS = ("pinnacle", "betfair_ex_eu")
DEFAULT_RESERVE = int(os.environ.get("NHL_ODDS_API_RESERVE", "60"))


@dataclass
class OddsApiResult:
    status: str  # ok | no_key | low_quota | no_games | error
    events: List[Dict[str, Any]] = field(default_factory=list)
    remaining: Optional[int] = None
    used: Optional[int] = None
    note: str = ""


def api_key() -> str:
    return os.environ.get("ODDS_API_KEY", "").strip()


def scrub(text: Any, key: Optional[str] = None) -> str:
    """Erstatter API-nøkkelen med *** i en melding."""
    out = str(text)
    key = api_key() if key is None else key
    if key:
        out = out.replace(key, "***")
    return out


def quota_ok(last_remaining: Optional[int], reserve: int = DEFAULT_RESERVE) -> bool:
    """Om vi har råd til et kall. Ukjent kvote (første kjøring) er ok."""
    return last_remaining is None or last_remaining >= reserve


def _int_header(headers: Any, name: str) -> Optional[int]:
    try:
        return int(float(headers.get(name)))
    except (TypeError, ValueError, AttributeError):
        return None


def fetch_odds(
    markets: Sequence[str] = ("h2h",),
    regions: str = "eu",
    key: Optional[str] = None,
) -> OddsApiResult:
    """
    Henter NHL-odds. Retry én gang på 5xx/nettverksfeil, aldri på 4xx (feil
    nøkkel, brukt opp kvote – å prøve igjen hjelper ikke og koster).
    """
    key = api_key() if key is None else key
    if not key:
        return OddsApiResult(status="no_key", note="ODDS_API_KEY er ikke satt")
    params = {
        "apiKey": key,
        "regions": regions,
        "markets": ",".join(markets),
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    }
    last_error = ""
    for attempt in range(2):
        try:
            r = requests.get(ODDS_URL, params=params, timeout=HTTP_TIMEOUT)
        except requests.RequestException as exc:
            last_error = scrub(f"{type(exc).__name__}: {exc}", key)
            continue
        remaining = _int_header(r.headers, "x-requests-remaining")
        used = _int_header(r.headers, "x-requests-used")
        if r.status_code == 200:
            try:
                payload = r.json()
            except ValueError as exc:
                return OddsApiResult("error", [], remaining, used, scrub(f"ugyldig JSON: {exc}", key))
            return OddsApiResult("ok", list(payload or []), remaining, used)
        last_error = scrub(f"status {r.status_code}: {r.text[:200]}", key)
        if r.status_code < 500:
            return OddsApiResult("error", [], remaining, used, last_error)
    return OddsApiResult("error", note=last_error)


def team_abbr(name: Any) -> Optional[str]:
    """Visningsforkortelse (UTA, MTL …) for et lagnavn fra The Odds API."""
    abbr = TEAM_MAP.get(_normalize(str(name or "")))
    return to_display(abbr) if abbr else None


def _parse_time(value: Any) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _book_markets(book: Dict[str, Any], home_team: str, away_team: str) -> Dict[str, Any]:
    """
    ML (2-veis inkl. OT) og TOTAL per linje for én bok. Et h2h-marked med
    «Draw» er 3-veis ordinær tid og forkastes – det er ikke det vi sammenligner
    mot NTs «Vinner inkl. overtid».
    """
    out: Dict[str, Any] = {}
    for market in book.get("markets") or []:
        outcomes = market.get("outcomes") or []
        if market.get("key") == "h2h":
            names = {o.get("name") for o in outcomes}
            if len(outcomes) != 2 or "Draw" in names:
                continue
            prices = {}
            for o in outcomes:
                side = "home" if o.get("name") == home_team else "away" if o.get("name") == away_team else None
                try:
                    price = float(o.get("price"))
                except (TypeError, ValueError):
                    side = None
                if side and price > 1.0:
                    prices[side] = price
            if len(prices) == 2:
                out["ML"] = prices
        elif market.get("key") == "totals":
            for o in outcomes:
                name = str(o.get("name") or "").lower()
                try:
                    price, point = float(o.get("price")), float(o.get("point"))
                except (TypeError, ValueError):
                    continue
                if name in {"over", "under"} and price > 1.0:
                    out.setdefault("TOTAL", {}).setdefault(f"{point:g}", {})[name] = price
    return out


def _no_vig_home(prices: Dict[str, float]) -> Optional[float]:
    try:
        ih, ia = 1.0 / prices["home"], 1.0 / prices["away"]
    except (KeyError, ZeroDivisionError, TypeError):
        return None
    return ih / (ih + ia)


def parse_events(
    payload: Iterable[Dict[str, Any]],
    keep_books: Sequence[str] = KEEP_BOOKS,
) -> List[Dict[str, Any]]:
    """
    Én post per kamp: lag (visningsforkortelse), start i UTC, utvalgte bøker,
    og konsensus = median margin-fri P(hjemme) over alle bøker med 2-veis ML
    (logges, men spilles ikke på). Kamper med ukjente lag hoppes over.
    """
    out = []
    for ev in payload or []:
        home_team, away_team = ev.get("home_team"), ev.get("away_team")
        home, away = team_abbr(home_team), team_abbr(away_team)
        start = _parse_time(ev.get("commence_time"))
        if not home or not away or start is None:
            continue
        books: Dict[str, Any] = {}
        p_homes = []
        for book in ev.get("bookmakers") or []:
            markets = _book_markets(book, home_team, away_team)
            if "ML" in markets:
                p = _no_vig_home(markets["ML"])
                if p is not None:
                    p_homes.append(p)
            if book.get("key") in keep_books and markets:
                books[book["key"]] = {**markets, "upd": book.get("last_update")}
        if p_homes:
            books["consensus"] = {
                "ML": {"p_home": round(statistics.median(p_homes), 5)},
                "n": len(p_homes),
            }
        out.append({
            "api_id": ev.get("id"),
            "start": _utc(start),
            "home": home,
            "away": away,
            "books": books,
        })
    return out


def match_to_nt(
    sharp: Sequence[Dict[str, Any]],
    nt_events: Sequence[Dict[str, Any]],
    tol_hours: float = 3.0,
) -> Dict[str, Dict[str, Any]]:
    """
    NT-kampnøkkel → {"sharp": post, "match": "ok" | "swapped"}.

    Samme lagpar og |Δstart| ≤ tol_hours gir "ok". Byttet hjemme/borte (typisk
    kamper på nøytral bane, som Global Series) gir "swapped" og skal aldri
    spilles: da vet vi ikke hvilken side prisene gjelder.
    """
    tol = timedelta(hours=tol_hours)
    out: Dict[str, Dict[str, Any]] = {}
    for ev in nt_events:
        nt_start = _parse_time(ev.get("start"))
        if nt_start is None:
            continue
        best = None
        for s in sharp:
            s_start = _parse_time(s.get("start"))
            if s_start is None or abs(s_start - nt_start) > tol:
                continue
            if (s["home"], s["away"]) == (ev["home"], ev["away"]):
                best = (s, "ok")
                break
            if (s["home"], s["away"]) == (ev["away"], ev["home"]) and best is None:
                best = (s, "swapped")
        if best:
            out[ev["key"]] = {"sharp": best[0], "match": best[1]}
    return out
