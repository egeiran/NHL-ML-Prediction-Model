#!/usr/bin/env python3
"""
Eksporterer alt frontend trenger som statiske JSON-filer.

Frontend (Next.js) bygges som en statisk side på Vercel og har derfor ikke et
levende API å snakke med. Denne jobben kjører i den daglige GitHub Actions-
workflowen og legger ferdig beregnet data i `nhl-frontend/public/data/`:

  teams.json         - lagene som kan velges i matchup-panelet
  value-report.json  - dagens/kommende kamper med modellodds og EV
  portfolio.json     - porteføljens tidsserie, sammendrag og bets
  matchups.json      - forhåndsberegnet prediksjon for alle lagkombinasjoner
  meta.json          - når dataen ble generert + hvilke filer som finnes

Hver seksjon skrives uavhengig: feiler én av dem (f.eks. fordi NHL-APIet er
nede), beholdes forrige versjon av den fila og resten oppdateres som normalt.

Kjøres fra repo-roten (`python NHL/export_site_data.py`) eller fra NHL-mappa.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pandas as pd

from bet_tracker import build_portfolio_payload, load_history
from live.live_feature_builder import build_live_features
from report_service import (
    PREDICT_GAMES_NEEDED,
    build_team_summary,
    build_value_report,
    get_team_games,
    list_teams,
    predict_rows,
)
from utils.feature_engineering import DEFAULT_WINDOWS
from utils.team_alias import to_canonical

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "nhl-frontend" / "public" / "data"

# Antall dager frem i tid value-boardet viser (frontend bruker samme horisont).
DEFAULT_DAYS_AHEAD = 3

# NHL har 32 aktive lag. Får vi data for langt færre, er NHL-APIet ustabilt –
# da er forrige eksport bedre enn en halv lagliste.
MIN_TEAMS_FOR_EXPORT = 24


def _output_dir() -> Path:
    configured = os.environ.get("NHL_EXPORT_DIR")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_OUTPUT_DIR


def _days_ahead() -> int:
    raw = os.environ.get("NHL_EXPORT_DAYS", "")
    try:
        return max(0, min(int(raw), 10))
    except ValueError:
        return DEFAULT_DAYS_AHEAD


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    """Skriver JSON til disk. `compact` brukes for de største filene."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def build_matchups(teams: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Forhåndsberegner prediksjon for alle lagkombinasjoner (hjemme/borte).

    Kampdataen hentes én gang per lag fra NHL-APIet, og alle feature-radene
    sendes gjennom modellen i ett kall.
    """
    memo: Dict[str, Optional[List[Dict]]] = {}
    team_games: Dict[str, List[Dict]] = {}
    team_summaries: Dict[str, Dict[str, Any]] = {}

    for team in teams:
        abbr = team["abbreviation"]
        games = get_team_games(abbr, limit=PREDICT_GAMES_NEEDED, memo=memo)
        if not games:
            print(f"  [skip] {abbr}: ingen kampdata")
            continue
        team_games[abbr] = games
        team_summaries[abbr] = build_team_summary(abbr, games)

    abbrs = sorted(team_games)
    if len(abbrs) < MIN_TEAMS_FOR_EXPORT:
        raise RuntimeError(
            f"Fikk kampdata for bare {len(abbrs)} lag (krever {MIN_TEAMS_FOR_EXPORT})"
        )

    print(f"  Bygger matchups for {len(abbrs)} lag ({len(abbrs) * (len(abbrs) - 1)} kombinasjoner)")

    keys: List[str] = []
    feature_rows: List[pd.DataFrame] = []
    first_error: Optional[str] = None

    for home in abbrs:
        for away in abbrs:
            if home == away:
                continue
            try:
                feature_rows.append(
                    build_live_features(
                        to_canonical(away),
                        to_canonical(home),
                        windows=DEFAULT_WINDOWS,
                        home_games=team_games[home],
                        away_games=team_games[away],
                    )
                )
            except Exception as exc:  # pragma: no cover - hopper over ett lagpar
                # Feilen er som regel den samme for alle par (f.eks. manglende
                # Elo-ratings), så vi logger den én gang og tar den med videre.
                if first_error is None:
                    first_error = str(exc)
                    print(f"  [skip] {home} vs {away}: {exc}")
                continue
            keys.append(f"{home}-{away}")

    # Et lag uten brukbare kombinasjoner skal ikke kunne velges i frontend.
    usable = {abbr for key in keys for abbr in key.split("-")}
    if len(usable) < MIN_TEAMS_FOR_EXPORT:
        raise RuntimeError(
            f"Bare {len(usable)} lag fikk brukbare kombinasjoner "
            f"(krever {MIN_TEAMS_FOR_EXPORT})"
            + (f": {first_error}" if first_error else "")
        )

    predictions = predict_rows(pd.concat(feature_rows, ignore_index=True))

    return {
        "teams": {abbr: s for abbr, s in team_summaries.items() if abbr in usable},
        "matchups": dict(zip(keys, predictions)),
    }


def main() -> int:
    output_dir = _output_dir()
    days = _days_ahead()
    generated_at = datetime.now(timezone.utc).isoformat()

    print(f"Eksporterer statisk data til {output_dir} (days={days})")

    written: List[str] = []
    failed: List[str] = []

    def run(name: str, filename: str, build: Callable[[], Any], compact: bool = False) -> None:
        try:
            payload = build()
        except Exception as exc:
            print(f"[WARN] {name} feilet, beholder eksisterende fil: {exc}")
            failed.append(name)
            return
        write_json(output_dir / filename, payload, compact=compact)
        written.append(filename)
        print(f"  Skrev {filename}")

    try:
        teams = list_teams()
    except Exception as exc:
        print(f"[WARN] Kunne ikke laste lag/modell: {exc}")
        teams = []

    matchups: Dict[str, Any] = {}

    def build_matchups_section() -> Dict[str, Any]:
        nonlocal matchups
        matchups = build_matchups(teams)
        return {"generated_at": generated_at, **matchups}

    def build_teams_section() -> List[Dict[str, str]]:
        # Lagene med ferske data er de eneste som kan predikeres, så de er også
        # de eneste vi tilbyr i frontend. Feilet matchup-eksporten, lar vi
        # forrige teams.json stå – den er konsistent med forrige matchups.json.
        if not matchups.get("teams"):
            raise RuntimeError("matchups feilet – beholder forrige teams.json")
        return [t for t in teams if t["abbreviation"] in matchups["teams"]]

    run("matchups", "matchups.json", build_matchups_section, compact=True)
    run("teams", "teams.json", build_teams_section)
    run("value-report", "value-report.json", lambda: build_value_report(days, verbose=True))
    run("portfolio", "portfolio.json", lambda: build_portfolio_payload(load_history()))

    write_json(
        output_dir / "meta.json",
        {
            "generated_at": generated_at,
            "days_ahead": days,
            "files": sorted(written),
            "failed": sorted(failed),
        },
    )
    print("  Skrev meta.json")

    if failed and not written:
        print("[ERROR] Ingen seksjoner kunne eksporteres")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
