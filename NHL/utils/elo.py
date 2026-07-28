"""
Elo-ratingsystem for NHL-lag.

Elo gir hvert lag en løpende styrkerating som oppdateres kamp for kamp.
Ratingen brukes som ekstra features i prediksjonsmodellen og fungerer som
et lag-styrke-prior på tvers av sesonger.

Sentrale egenskaper:
  - Hjemmebanefordel legges til i forventet score (home_advantage).
  - OT/SO-kamper teller som "halve" seire (ot_win_score), siden de er nær
    myntkast og ikke bør svinge ratingen like mye som en ordinær seier.
  - Mellom sesonger trekkes ratingene mot snittet (season_regression) for å
    reflektere at lag endrer seg (roster, form) fra år til år.
  - Alle features er PRE-kamp: et lags rating før kampen påvirkes kun av
    tidligere kamper, så det er ingen lekkasje inn i modellen.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

# Feature-kolonnene Elo bidrar med til modellen.
ELO_FEATURE_COLUMNS: List[str] = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",
    "elo_expected_home",
]


@dataclass(frozen=True)
class EloConfig:
    """Parametre for Elo-motoren."""

    base_rating: float = 1500.0
    k_factor: float = 6.0
    home_advantage: float = 50.0
    season_regression: float = 0.70  # 1.0 = ingen regresjon, 0.0 = full nullstilling
    ot_win_score: float = 0.6  # poeng til OT/SO-vinner (taper får 1 - dette)
    scale: float = 400.0


def expected_home_score(
    home_rating: float,
    away_rating: float,
    config: EloConfig = EloConfig(),
) -> float:
    """Forventet score (≈ sannsynlighet for hjemmeseier) gitt ratings."""
    diff = (home_rating + config.home_advantage) - away_rating
    return 1.0 / (1.0 + 10.0 ** (-diff / config.scale))


def _actual_home_score(
    home_goals: float,
    away_goals: float,
    is_ot: bool,
    config: EloConfig,
) -> float:
    """
    Faktisk score for hjemmelaget (0..1).
    OT/SO gir en "myk" score så nesten-jevne kamper ikke svinger ratingen for mye.
    """
    home_won = home_goals > away_goals
    if is_ot:
        return config.ot_win_score if home_won else (1.0 - config.ot_win_score)
    return 1.0 if home_won else 0.0


def update_ratings(
    ratings: Dict[str, float],
    home_team: str,
    away_team: str,
    home_goals: float,
    away_goals: float,
    is_ot: bool,
    config: EloConfig = EloConfig(),
) -> float:
    """
    Oppdaterer `ratings` in-place for én kamp (zero-sum) og returnerer
    pre-kamp forventet hjemmescore. Ukjente lag starter på base-rating.
    Samme oppdateringsregel som compute_elo_history.
    """
    home_rating = ratings.get(home_team, config.base_rating)
    away_rating = ratings.get(away_team, config.base_rating)
    expected_home = expected_home_score(home_rating, away_rating, config)
    actual_home = _actual_home_score(home_goals, away_goals, is_ot, config)
    delta = config.k_factor * (actual_home - expected_home)
    ratings[home_team] = home_rating + delta
    ratings[away_team] = away_rating - delta
    return expected_home


def regress_to_mean(
    ratings: Dict[str, float],
    config: EloConfig = EloConfig(),
) -> Dict[str, float]:
    """Trekker alle ratings mot base-rating (brukes ved sesongovergang)."""
    return {
        team: config.base_rating + config.season_regression * (rating - config.base_rating)
        for team, rating in ratings.items()
    }


def compute_elo_history(
    games: pd.DataFrame,
    config: EloConfig = EloConfig(),
) -> Tuple[pd.DataFrame, Dict[str, float]]:
    """
    Går gjennom alle kamper kronologisk og bygger pre-kamp Elo-features.

    Forventer at `games` har kolonnene:
      game_id, date, season, home_team, away_team, home_goals, away_goals,
      outcome_code (1 = OT/SO).

    Returnerer:
      - elo_df: DataFrame med én rad per game_id og kolonnene i
        ELO_FEATURE_COLUMNS (pre-kamp ratings).
      - latest_ratings: dict lag -> siste rating etter siste kamp.

    Merk: kildedataen inneholder en del eksakte duplikat-rader (samme game_id).
    Vi dropper duplikater på game_id slik at hver reelle kamp kun oppdaterer
    ratingen én gang, og slik at elo_df får unik game_id (trygt å merge).
    """
    ordered = (
        games.sort_values(["date", "game_id"])
        .drop_duplicates(subset="game_id", keep="first")
        .copy()
    )

    ratings: Dict[str, float] = {}
    last_season: Dict[str, int] = {}

    records: List[Dict[str, float]] = []

    for row in ordered.itertuples(index=False):
        home = row.home_team
        away = row.away_team
        season = int(row.season)

        # Sesongregresjon: trekk mot snittet ved lagets første kamp i ny sesong.
        for team in (home, away):
            rating = ratings.get(team, config.base_rating)
            if last_season.get(team) is not None and last_season[team] != season:
                rating = config.base_rating + config.season_regression * (
                    rating - config.base_rating
                )
            ratings[team] = rating
            last_season[team] = season

        home_rating = ratings[home]
        away_rating = ratings[away]

        records.append(
            {
                "game_id": row.game_id,
                "home_elo_pre": home_rating,
                "away_elo_pre": away_rating,
                "elo_diff": home_rating - away_rating,
                "elo_expected_home": expected_home_score(
                    home_rating, away_rating, config
                ),
            }
        )

        # Oppdater ratings etter kampen (zero-sum).
        is_ot = int(row.outcome_code) == 1
        update_ratings(
            ratings, home, away, row.home_goals, row.away_goals, is_ot, config
        )

    elo_df = pd.DataFrame.from_records(records, columns=["game_id"] + ELO_FEATURE_COLUMNS)
    return elo_df, ratings


def latest_rating(
    ratings: Dict[str, float],
    team: str,
    config: EloConfig = EloConfig(),
) -> float:
    """Henter siste rating for et lag, eller base-rating hvis ukjent."""
    return float(ratings.get(team, config.base_rating))


def build_elo_feature_values(
    home_team: str,
    away_team: str,
    ratings: Dict[str, float],
    config: EloConfig = EloConfig(),
) -> Dict[str, float]:
    """
    Lager Elo-feature-verdiene for én kommende kamp ut fra siste ratings.
    Brukes i prediksjon (live og CLI).
    """
    home_rating = latest_rating(ratings, home_team, config)
    away_rating = latest_rating(ratings, away_team, config)
    return {
        "home_elo_pre": home_rating,
        "away_elo_pre": away_rating,
        "elo_diff": home_rating - away_rating,
        "elo_expected_home": expected_home_score(home_rating, away_rating, config),
    }


def _resolve_ratings_path(path: str) -> Path:
    """
    Returnerer en brukbar sti til ratings-fila ved LESING. Prøver oppgitt sti
    først, og faller tilbake på `NHL/models/<filnavn>` slik at scriptene leser
    riktig fil uansett hvilken katalog de kjøres fra (samme mønster som
    data_loader/model_utils). Brukes bevisst ikke ved skriving: da skal en
    oppgitt sti alltid respekteres.
    """
    p = Path(path)
    if p.is_file():
        return p
    fallback = MODELS_DIR / p.name
    if fallback.is_file():
        return fallback
    return p


def save_ratings(
    ratings: Dict[str, float],
    config: EloConfig,
    path: str = "models/elo_ratings.json",
    metadata: Optional[Dict] = None,
) -> None:
    """
    Lagrer siste ratings + konfig til JSON ved siden av modellen.
    `metadata` (f.eks. {"through": "2026-06-12", "n_games": 1234}) lagres under
    nøkkelen "meta" og ignoreres trygt av load_ratings.
    """
    resolved = Path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "config": asdict(config),
        "ratings": {team: float(rating) for team, rating in ratings.items()},
    }
    if metadata:
        payload["meta"] = metadata
    with open(resolved, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)


def load_ratings(
    path: str = "models/elo_ratings.json",
) -> Tuple[Dict[str, float], EloConfig]:
    """
    Laster ratings + konfig fra JSON. Returnerer (tom dict, default-konfig)
    hvis filen mangler, slik at prediksjon faller tilbake på base-rating.
    """
    resolved = _resolve_ratings_path(path)
    if not resolved.is_file():
        return {}, EloConfig()
    with open(resolved, "r", encoding="utf-8") as f:
        payload = json.load(f)
    ratings = {team: float(rating) for team, rating in payload.get("ratings", {}).items()}
    config_data = payload.get("config", {})
    try:
        config = EloConfig(**config_data)
    except TypeError:
        config = EloConfig()
    return ratings, config
