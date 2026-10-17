# live/live_feature_builder.py
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd

from live.nhl_api import plays_on
from utils.elo import (
    build_elo_feature_values,
    load_last_seasons,
    load_ratings,
    resolve_ratings_path,
    season_id,
)
from utils.feature_engineering import get_feature_columns
from utils.team_alias import to_canonical, to_display

ELO_RATINGS_PATH = "models/elo_ratings.json"

# Nordamerikanske kamper starter mellom ca. 12:00 og 22:30 lokal tid. Trekker vi
# fem timer fra starttiden i UTC, havner alle på riktig lokal kampdato – også
# vestkystkampene som starter etter midnatt UTC.
_NA_OFFSET = timedelta(hours=5)


def local_game_date(start_time: Optional[str]) -> Optional[str]:
    """Nordamerikansk kampdato (YYYY-MM-DD) for en ISO-starttid, eller None."""
    if not start_time:
        return None
    try:
        dt = datetime.fromisoformat(str(start_time).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt.astimezone(timezone.utc) - _NA_OFFSET).strftime("%Y-%m-%d")


# Elo-ratings caches, men lastes på nytt hvis fila er oppdatert (mtime endres)
# slik at et langtkjørende API plukker opp ferske tall uten omstart.
_ELO_CACHE = {}


def _get_elo():
    # Fila slås opp via elo-modulen slik at den finnes uansett arbeidskatalog.
    resolved = resolve_ratings_path(ELO_RATINGS_PATH)
    try:
        mtime = os.path.getmtime(resolved)
    except OSError:
        mtime = None
    # Sjekk på "ratings" i tillegg til mtime: mangler fila er mtime None både
    # før og etter, og cachen ville aldri blitt fylt.
    if "ratings" not in _ELO_CACHE or _ELO_CACHE.get("mtime") != mtime:
        ratings, config = load_ratings(str(resolved))
        if not ratings:
            # Modellen er trent med Elo-features. Uten ratings får alle lag
            # base-rating, og prediksjonene blir stille feil – da er det bedre
            # å feile høylytt enn å publisere tall som ser riktige ut.
            raise RuntimeError(
                f"Elo-ratings mangler eller er tomme ({resolved}). "
                "Kjør train_model.py eller update_elo_ratings.py."
            )
        _ELO_CACHE["ratings"] = ratings
        _ELO_CACHE["config"] = config
        _ELO_CACHE["last_season"] = load_last_seasons(str(resolved))
        _ELO_CACHE["mtime"] = mtime
    return _ELO_CACHE["ratings"], _ELO_CACHE["config"]


def _get_last_seasons():
    _get_elo()
    return _ELO_CACHE.get("last_season") or {}


def build_live_features(
    away_abbr: str,
    home_abbr: str,
    game_date: Optional[str] = None,
) -> pd.DataFrame:
    """
    Lager en rad med nøyaktig de samme features som treningsdataen brukte.

    `game_date` er nordamerikansk kampdato (se local_game_date). Den avgjør
    back-to-back (spilte laget grunnseriekamp dagen før?) og hvilken sesong
    Elo-ratingen skal gjelde for. Uten dato (egendefinerte matchups) regnes
    ingen av lagene som slitne, og sesongen er dagens.
    """
    home_canon = to_canonical(home_abbr)
    away_canon = to_canonical(away_abbr)

    if game_date:
        day = datetime.strptime(game_date[:10], "%Y-%m-%d").date()
        previous_day = (day - timedelta(days=1)).isoformat()
        # Sesongprogrammet i NHL-APIet bruker visningsforkortelsen (UTA).
        home_b2b = int(plays_on(to_display(home_canon), previous_day))
        away_b2b = int(plays_on(to_display(away_canon), previous_day))
        season = season_id(day)
    else:
        home_b2b = away_b2b = 0
        season = season_id(datetime.now(timezone.utc).date())

    # Elo slås opp på kanonisk forkortelse (ARI), og lag som ikke har spilt i
    # kampens sesong ennå regresseres mot snittet – slik treningen gjør.
    elo_ratings, elo_config = _get_elo()
    elo = build_elo_feature_values(
        home_canon,
        away_canon,
        elo_ratings,
        elo_config,
        season=season,
        last_season=_get_last_seasons(),
    )

    row = {
        "elo_diff": elo["elo_diff"],
        "home_b2b": home_b2b,
        "away_b2b": away_b2b,
    }
    return pd.DataFrame([row], columns=get_feature_columns())
