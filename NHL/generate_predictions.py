#!/usr/bin/env python3
"""
Daily artifact generator for the NHL model.

What it does:
- Loads a trained model from disk (placeholder path can be changed).
- Builds sample feature rows (replace with your real data loader if desired).
- Computes predictions + a simple value/edge metric.
- Writes `predictions.png` and `TODAY.md` into the repo root (overwrites safely).

This template is intentionally self contained so it can run in CI without
extra parameters. Adapt `fetch_feature_data` and `build_matchups` to hook up
real inputs/odds.
"""
from __future__ import annotations

import os
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional, Sequence
import numbers

# Ensure matplotlib can cache fonts in environments without a writable home.
MPL_CACHE_DIR = Path(os.environ.setdefault("MPLCONFIGDIR", str(Path("/tmp/mplcache"))))
MPL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

import matplotlib

# Use a headless backend for CI.
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

try:
    # Prefer the project's loader if available.
    from utils.model_utils import load_model as _load_model
except Exception:
    _load_model = None

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_IMAGE = REPO_ROOT / "predictions.png"
OUTPUT_MARKDOWN = REPO_ROOT / "TODAY.md"
PORTFOLIO_IMAGE = REPO_ROOT / "portfolio.png"
DAILY_PROFIT_IMAGE = REPO_ROOT / "daily_profit.png"
BET_HISTORY_PATH = REPO_ROOT / "NHL" / "data" / "bet_history.csv"
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "models" / "nhl_model.pkl"
ROWS_TO_SAMPLE = 6


def _use_plot_style() -> None:
    """Apply preferred style with graceful fallback for older Matplotlib versions."""
    try:
        plt.style.use("seaborn-v0_8-darkgrid")
    except OSError:
        plt.style.use("seaborn-darkgrid")


def load_matchups_from_history(
    path: Path, max_rows: int = ROWS_TO_SAMPLE
) -> Optional[tuple[datetime.date, List[str]]]:
    """
    Pull matchups from the most recent *completed* day in bet_history.csv.
    Returns (target_date, matchups) or None if missing/unusable.
    """
    if not path.exists():
        return None
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        print(f"[matchups] Could not read bet history: {exc}")
        return None

    required = {"date", "home_abbr", "away_abbr"}
    if not required.issubset(df.columns):
        print("[matchups] bet_history.csv missing columns: date, home_abbr, away_abbr")
        return None

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "home_abbr", "away_abbr"])
    if df.empty:
        return None

    df.sort_values(["date", "start_time"], inplace=True, na_position="last")
    unique_dates = df["date"].dt.date.drop_duplicates().tolist()
    if not unique_dates:
        return None

    # Skip the most recent date to avoid in-progress bets if possible.
    target_date = unique_dates[-2] if len(unique_dates) > 1 else unique_dates[-1]
    day_rows = df[df["date"].dt.date == target_date]
    if day_rows.empty:
        return None

    matchups = [f"{h} vs {a}" for h, a in zip(day_rows["home_abbr"], day_rows["away_abbr"])]
    # Keep order, trim to max_rows
    return target_date, matchups[:max_rows]


def load_trained_model(model_path: Path = DEFAULT_MODEL_PATH):
    """Load the serialized model; raise a clear error if it's missing."""
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model file not found at {model_path}. "
            "Update DEFAULT_MODEL_PATH or drop your model there."
        )

    if _load_model:
        return _load_model(str(model_path))

    with open(model_path, "rb") as f:
        return pickle.load(f)


def _resolve_feature_names(model) -> List[str]:
    if hasattr(model, "feature_names_in_"):
        return list(model.feature_names_in_)
    if hasattr(model, "n_features_in_"):
        return [f"feature_{i}" for i in range(int(model.n_features_in_))]
    return [f"feature_{i}" for i in range(8)]


def fetch_feature_data(model, rows: int = ROWS_TO_SAMPLE) -> pd.DataFrame:
    """
    Build a placeholder feature matrix sized to the model.
    Replace this with your real feature loader if you have one.
    """
    rng = np.random.default_rng(seed=42)
    feature_names = _resolve_feature_names(model)
    data = rng.normal(loc=0, scale=1, size=(rows, len(feature_names)))
    return pd.DataFrame(data, columns=feature_names)


def build_matchups(rows: int) -> List[str]:
    """
    Create human-readable matchup labels for the markdown and chart.
    """
    rng = np.random.default_rng(seed=7)
    teams = [
        "BOS",
        "NYR",
        "TOR",
        "MTL",
        "LAK",
        "EDM",
        "VAN",
        "CHI",
        "COL",
        "PIT",
        "BUF",
        "STL",
    ]
    matchups = []
    for _ in range(rows):
        home, away = rng.choice(teams, size=2, replace=False)
        matchups.append(f"{home} vs {away}")
    return matchups


def simulate_market_odds(rows: int, n_classes: int) -> np.ndarray:
    """Generate plausible decimal odds for each class."""
    rng = np.random.default_rng(seed=24)
    odds = rng.uniform(1.8, 3.8, size=(rows, n_classes))
    return np.round(odds, 2)


def compute_value_table(
    model,
    features: pd.DataFrame,
    matchups: Sequence[str],
    match_date: Optional[datetime.date],
) -> pd.DataFrame:
    """
    Predict class probabilities and derive a simple value/edge metric.
    """
    if not hasattr(model, "predict_proba"):
        raise AttributeError("Model must expose predict_proba for probability outputs.")

    proba = model.predict_proba(features)
    classes = getattr(model, "classes_", np.arange(proba.shape[1]))
    odds_matrix = simulate_market_odds(len(features), proba.shape[1])

    def _class_role(label) -> str:
        """Return 'home', 'draw', 'away', or 'unknown' for the class label."""
        if isinstance(label, numbers.Integral):
            if int(label) == 0:
                return "home"
            if int(label) == 1:
                return "draw"
            if int(label) == 2:
                return "away"
        if isinstance(label, numbers.Real):
            # allow float-like labels too
            as_int = int(round(float(label)))
            if as_int == 0:
                return "home"
            if as_int == 1:
                return "draw"
            if as_int == 2:
                return "away"
        if isinstance(label, str):
            lower = label.lower()
            if lower in {"home", "h"}:
                return "home"
            if lower in {"draw", "tie", "d", "x"}:
                return "draw"
            if lower in {"away", "a"}:
                return "away"
        return "unknown"

    def _selection_label(best_class, matchup: str) -> str:
        role = _class_role(best_class)
        try:
            home_abbr, away_abbr = [p.strip() for p in matchup.split("vs")]
        except Exception:
            home_abbr, away_abbr = matchup, matchup

        if role == "home":
            return home_abbr
        if role == "away":
            return away_abbr
        if role == "draw":
            return "Draw"
        return str(best_class)

    rows = []
    for idx, matchup in enumerate(matchups):
        probs = np.asarray(proba[idx], dtype=float)
        odds = odds_matrix[idx]

        best_class_idx = int(np.argmax(probs))
        model_prob = float(np.clip(probs[best_class_idx], 0.0, 1.0))
        offered_odds = float(max(odds[best_class_idx], 1.01))
        implied_prob = 1.0 / offered_odds
        edge = model_prob - implied_prob
        expected_value = model_prob * offered_odds - 1.0

        selection = _selection_label(classes[best_class_idx], matchup)

        rows.append(
            {
                "Date": (match_date or datetime.now(timezone.utc).date()).isoformat(),
                "Matchup": matchup,
                "Selection": selection,
                "Model Probability": round(model_prob, 3),
                "Market Odds": round(offered_odds, 2),
                "Implied Prob": round(implied_prob, 3),
                "Edge": round(edge, 3),
                "Expected Value": round(expected_value, 3),
            }
        )

    table = pd.DataFrame(rows)
    table.sort_values(by="Expected Value", ascending=False, inplace=True)
    table.reset_index(drop=True, inplace=True)
    return table


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def save_markdown(table: pd.DataFrame, output_path: Path) -> None:
    timestamp = datetime.now(timezone.utc)
    header = [
        f"# Value Bets for {timestamp:%Y-%m-%d}",
        "",
        f"Generated at {timestamp:%Y-%m-%d %H:%M} UTC",
        "",
        "Matchups come from the latest completed day in `NHL/data/bet_history.csv` "
        "when available; otherwise they are placeholders. "
        "Replace the placeholder data loader with your real odds feed when ready.",
        "",
        "Columns:",
        "- Selection: modelens pick (home/away/draw) mapped to laget vi tror vinner.",
        "- Model Probability: sannsynligheten modellen gir for selection.",
        "- Market Odds: simulerte desimalodds for selection.",
        "- Implied Prob: 1/odds (normalisert) – markedets sannsynlighet.",
        "- Edge: model_prob - implied_prob.",
        "- Expected Value: model_prob * odds - 1 per enhetsinnsats.",
        "",
    ]

    try:
        md_table = table.to_markdown(index=False, tablefmt="github", floatfmt=".3f")
    except Exception:
        md_table = table.to_string(index=False)

    content = "\n".join(header + [md_table, ""])
    atomic_write_text(output_path, content)


def save_chart(table: pd.DataFrame, output_path: Path) -> None:
    _use_plot_style()
    fig, ax = plt.subplots(figsize=(10, 5))

    bars = ax.bar(
        table["Matchup"],
        table["Expected Value"],
        color=["#0f9d58" if ev >= 0 else "#d93025" for ev in table["Expected Value"]],
    )
    ax.axhline(0, color="#555", linewidth=1)
    ax.set_ylabel("Expected Value (unit stake)")
    ax.set_xlabel("Matchup")
    ax.set_title("Model value vs. market")
    ax.set_ylim(
        min(-0.25, table["Expected Value"].min() - 0.05),
        max(0.4, table["Expected Value"].max() + 0.05),
    )
    plt.xticks(rotation=25, ha="right")

    for bar, ev in zip(bars, table["Expected Value"]):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            ev + (0.01 if ev >= 0 else -0.03),
            f"{ev:.2f}",
            ha="center",
            va="bottom" if ev >= 0 else "top",
            fontsize=9,
        )

    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_name(output_path.stem + "_tmp" + output_path.suffix)
    fig.savefig(tmp_path, dpi=150, bbox_inches="tight", format="png")
    tmp_path.replace(output_path)
    plt.close(fig)


def build_portfolio_timeseries(path: Path) -> Optional[pd.DataFrame]:
    """Aggregate bet history into cumulative profit and invested series."""
    if not path.exists():
        print(f"[portfolio] No bet history found at {path}")
        return None

    df = pd.read_csv(path)
    if "date" not in df or "profit" not in df or "stake" not in df:
        print("[portfolio] bet_history.csv is missing required columns (date, profit, stake)")
        return None

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df.sort_values("date", inplace=True)

    daily = (
        df.groupby(df["date"].dt.date)
        .agg(
            DailyProfit=("profit", "sum"),
            BetCount=("profit", "size"),
        )
        .reset_index()
        .rename(columns={"date": "Date"})
    )

    # Drop the most recent day to avoid incomplete in-progress results.
    if len(daily) > 1:
        daily = daily.iloc[:-1]

    daily["Cumulative Profit"] = daily["DailyProfit"].cumsum()
    return daily


def save_portfolio_chart(daily: pd.DataFrame, output_path: Path) -> None:
    _use_plot_style()
    fig, ax = plt.subplots(figsize=(10, 5))

    dates = pd.to_datetime(daily["Date"])
    x = np.arange(len(dates))
    value = daily["Cumulative Profit"]
    bet_volume = daily["BetCount"] * 100  # bets * 100 to mirror stake line style

    ax.plot(x, value, color="#34d399", linewidth=2.8, label="Netto resultat")
    ax.plot(
        x,
        bet_volume,
        color="#38bdf8",
        linewidth=2.3,
        linestyle="--",
        label="Antall bets x100kr (daglig)",
    )

    xtick_step = max(1, len(x) // 8)
    ax.set_xticks(x[::xtick_step])
    ax.set_xticklabels([d.strftime("%b %d") for d in dates[::xtick_step]], rotation=25, ha="right")
    ax.set_ylabel("Beløp (kr) / Bets x100")
    ax.set_title("Portefølje over tid")
    ax.grid(True, linestyle="--", alpha=0.35)
    ax.legend()
    fig.tight_layout()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_name(output_path.stem + "_tmp" + output_path.suffix)
    fig.savefig(tmp_path, dpi=150, bbox_inches="tight", format="png")
    tmp_path.replace(output_path)
    plt.close(fig)


def save_recent_profit_chart(
    daily: pd.DataFrame,
    output_path: Path,
    days: int = 5,
) -> None:
    """
    Lag et søylediagram for siste `days` dager med realisert dagsresultat.
    Søylene er like høye (positive/negative) som profitten den dagen.
    """
    if daily.empty:
        print("[recent-profit] Ingen data å plotte")
        return

    trimmed = daily.tail(days).copy()
    trimmed["Date"] = pd.to_datetime(trimmed["Date"])

    _use_plot_style()
    fig, ax = plt.subplots(figsize=(8.5, 4.5))

    profits = trimmed["DailyProfit"]
    labels = [d.strftime("%b %d") for d in trimmed["Date"]]
    colors = ["#16a34a" if p > 0 else ("#dc2626" if p < 0 else "#6b7280") for p in profits]

    bars = ax.bar(labels, profits, color=colors, width=0.6)
    ax.axhline(0, color="#555", linewidth=1)
    ax.set_ylabel("Daglig resultat (kr)")
    ax.set_title(f"Daglig resultat — siste {min(days, len(trimmed))} dager")
    plt.xticks(rotation=0)

    for bar, value in zip(bars, profits):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value + (5 if value >= 0 else -5),
            f"{value:.0f}",
            ha="center",
            va="bottom" if value >= 0 else "top",
            fontsize=9,
        )

    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_name(output_path.stem + "_tmp" + output_path.suffix)
    fig.savefig(tmp_path, dpi=150, bbox_inches="tight", format="png")
    tmp_path.replace(output_path)
    plt.close(fig)


def main() -> None:
    model = load_trained_model()
    history_payload = load_matchups_from_history(BET_HISTORY_PATH, max_rows=ROWS_TO_SAMPLE)
    if history_payload:
        match_date, matchups = history_payload
    else:
        match_date, matchups = None, build_matchups(rows=ROWS_TO_SAMPLE)
    if not matchups:
        matchups = build_matchups(rows=ROWS_TO_SAMPLE)
    features = fetch_feature_data(model, rows=len(matchups))

    table = compute_value_table(model, features, matchups, match_date)
    save_markdown(table, OUTPUT_MARKDOWN)
    save_chart(table, OUTPUT_IMAGE)

    portfolio_daily = build_portfolio_timeseries(BET_HISTORY_PATH)
    if portfolio_daily is not None and not portfolio_daily.empty:
        save_portfolio_chart(portfolio_daily, PORTFOLIO_IMAGE)
        save_recent_profit_chart(portfolio_daily, DAILY_PROFIT_IMAGE, days=5)
        print(f"Wrote {PORTFOLIO_IMAGE.relative_to(REPO_ROOT)}")
        print(f"Wrote {DAILY_PROFIT_IMAGE.relative_to(REPO_ROOT)}")
    else:
        print("[portfolio] Skipped portfolio graph (no data).")

    print(f"Wrote {OUTPUT_MARKDOWN.relative_to(REPO_ROOT)}")
    print(f"Wrote {OUTPUT_IMAGE.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
