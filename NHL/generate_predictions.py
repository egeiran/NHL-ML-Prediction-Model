#!/usr/bin/env python3
"""
Daily artifact generator for the NHL model.

Generates:
- docs/predictions.png
- docs/TODAY.md
- docs/portfolio.png
- docs/daily_profit.png

Uses live Norsk Tipping odds via the same value-report logic as the API/bet tracker.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

# Ensure matplotlib can cache fonts in environments without a writable home.
MPL_CACHE_DIR = Path(os.environ.setdefault("MPLCONFIGDIR", str(Path("/tmp/mplcache"))))
MPL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

import matplotlib

# Use a headless backend for CI.
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd

try:
    from bet_tracker import _build_value_report
except Exception as exc:  # pragma: no cover - guardrail for CI
    _build_value_report = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = REPO_ROOT / "docs"
OUTPUT_IMAGE = DOCS_DIR / "predictions.png"
OUTPUT_MARKDOWN = DOCS_DIR / "TODAY.md"
PORTFOLIO_IMAGE = DOCS_DIR / "portfolio.png"
DAILY_PROFIT_IMAGE = DOCS_DIR / "daily_profit.png"
BET_HISTORY_PATH = REPO_ROOT / "NHL" / "data" / "bet_history.csv"

VALUE_MIN = float(os.environ.get("NHL_VALUE_MIN", "0.01"))
VALUE_DAYS_AHEAD = int(os.environ.get("NHL_VALUE_DAYS_AHEAD", "0"))
VALUE_FALLBACK_DAYS = int(os.environ.get("NHL_VALUE_FALLBACK_DAYS", "3"))
VALUE_CHART_MAX = int(os.environ.get("NHL_VALUE_CHART_MAX", "12"))

TABLE_COLUMNS = [
    "Date",
    "Matchup",
    "Selection",
    "Model Probability",
    "Market Odds",
    "Implied Prob",
    "Expected Value",
]


def _use_plot_style() -> None:
    """Apply preferred style with graceful fallback for older Matplotlib versions."""
    try:
        plt.style.use("seaborn-v0_8-darkgrid")
    except OSError:
        plt.style.use("seaborn-darkgrid")


def _parse_iso(dt: Optional[str]) -> Optional[datetime]:
    if not dt:
        return None
    try:
        return datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
    except Exception:
        return None


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _team_label(game: Dict[str, Any], side: str) -> str:
    abbr = str(game.get(f"{side}_abbr") or "").strip()
    name = str(game.get(side) or "").strip()
    return abbr or name


def _matchup_label(game: Dict[str, Any]) -> str:
    home = _team_label(game, "home")
    away = _team_label(game, "away")
    if home and away:
        return f"{home} vs {away}"
    event_id = game.get("event_id") or game.get("eventId")
    return str(event_id or "Unknown matchup")


def _selection_label(selection: str, game: Dict[str, Any]) -> str:
    choice = str(selection).lower()
    if choice == "home":
        return _team_label(game, "home") or "Home"
    if choice == "away":
        return _team_label(game, "away") or "Away"
    if choice == "draw":
        return "Draw"
    return str(selection)


def _game_date(game: Dict[str, Any]) -> str:
    date_str = str(game.get("date") or "").strip()
    if date_str:
        return date_str
    start_dt = _parse_iso(game.get("start_time") or game.get("startTime"))
    if start_dt:
        return start_dt.strftime("%Y-%m-%d")
    return ""


def _report_date_range(report: Sequence[Dict[str, Any]]) -> str:
    dates = sorted({d for d in (_game_date(g) for g in report) if d})
    if not dates:
        return "Unknown date"
    if len(dates) == 1:
        return dates[0]
    return f"{dates[0]} to {dates[-1]}"


def load_value_report(days_ahead: int) -> List[Dict[str, Any]]:
    if _build_value_report is None:
        print(f"[value-report] Missing bet_tracker import: {_IMPORT_ERROR}")
        return []
    try:
        return _build_value_report(days_ahead)
    except Exception as exc:
        print(f"[value-report] Failed to build report: {exc}")
        return []


def build_value_table(
    report: Sequence[Dict[str, Any]],
    min_value: float,
) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []

    for game in report:
        delta = _to_float(game.get("best_value_delta"))
        if delta is None or delta < min_value:
            continue

        selection = game.get("best_value") or game.get("selection")
        if not selection:
            continue
        selection_key = str(selection).lower()

        odds_lookup = {
            "home": game.get("odds_home"),
            "draw": game.get("odds_draw"),
            "away": game.get("odds_away"),
        }
        model_lookup = {
            "home": game.get("model_home_win"),
            "draw": game.get("model_draw"),
            "away": game.get("model_away_win"),
        }
        implied_lookup = {
            "home": game.get("implied_home_prob"),
            "draw": game.get("implied_draw_prob"),
            "away": game.get("implied_away_prob"),
        }
        value_lookup = {
            "home": game.get("value_home"),
            "draw": game.get("value_draw"),
            "away": game.get("value_away"),
        }

        odds = _to_float(odds_lookup.get(selection_key))
        if odds is None:
            continue

        model_prob = _to_float(model_lookup.get(selection_key))
        implied_prob = _to_float(implied_lookup.get(selection_key))
        value = _to_float(value_lookup.get(selection_key))
        ev_value = value if value is not None else delta

        rows.append(
            {
                "Date": _game_date(game),
                "Matchup": _matchup_label(game),
                "Selection": _selection_label(selection_key, game),
                "Model Probability": round(model_prob, 3) if model_prob is not None else None,
                "Market Odds": round(odds, 2),
                "Implied Prob": round(implied_prob, 3) if implied_prob is not None else None,
                "Expected Value": round(ev_value, 3) if ev_value is not None else None,
            }
        )

    if not rows:
        return pd.DataFrame(columns=TABLE_COLUMNS)

    table = pd.DataFrame(rows)
    table = table.dropna(subset=["Expected Value"])
    table.sort_values(by="Expected Value", ascending=False, inplace=True)
    table.reset_index(drop=True, inplace=True)
    return table


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def save_markdown(
    table: pd.DataFrame,
    output_path: Path,
    report_meta: Dict[str, Any],
) -> None:
    timestamp = datetime.now(timezone.utc)
    date_range = report_meta.get("date_range") or timestamp.strftime("%Y-%m-%d")
    days_ahead = report_meta.get("days_ahead", 0)
    min_value = report_meta.get("min_value", VALUE_MIN)
    total_games = report_meta.get("total_games", 0)
    fallback_used = report_meta.get("fallback_used", False)
    fallback_days = report_meta.get("fallback_days")

    header = [
        f"# Value Bets for {date_range}",
        "",
        f"Generated at {timestamp:%Y-%m-%d %H:%M} UTC",
        f"Data window: {date_range} (days_ahead={days_ahead})",
        f"Min EV threshold: {min_value:.2f}",
        f"Games scanned: {total_games} | Value bets: {len(table)}",
        "Source: Norsk Tipping odds + NHL model (same logic as /value-report).",
        "",
    ]

    if fallback_used and fallback_days is not None:
        header.append(
            f"Note: primary window empty; used fallback horizon ({fallback_days} days ahead)."
        )
        header.append("")

    if table.empty:
        content = "\n".join(header + ["_Ingen value-bets over terskel i denne perioden._", ""])
        atomic_write_text(output_path, content)
        return

    try:
        md_table = table.to_markdown(index=False, tablefmt="github", floatfmt=".3f")
    except Exception:
        md_table = table.to_string(index=False)

    content = "\n".join(header + [md_table, ""])
    atomic_write_text(output_path, content)


def save_chart(table: pd.DataFrame, output_path: Path, max_rows: int = VALUE_CHART_MAX) -> None:
    _use_plot_style()
    fig, ax = plt.subplots(figsize=(10, 5))

    if table.empty:
        ax.axis("off")
        ax.text(
            0.5,
            0.5,
            "Ingen value-bets over terskel",
            ha="center",
            va="center",
            fontsize=14,
            color="#e5e7eb",
        )
        fig.tight_layout()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = output_path.with_name(output_path.stem + "_tmp" + output_path.suffix)
        fig.savefig(tmp_path, dpi=150, bbox_inches="tight", format="png")
        tmp_path.replace(output_path)
        plt.close(fig)
        return

    chart_table = table.head(max_rows).copy()
    bars = ax.bar(
        chart_table["Matchup"],
        chart_table["Expected Value"],
        color="#16a34a",
    )
    ax.axhline(0, color="#555", linewidth=1)
    ax.set_ylabel("Expected Value (unit stake)")
    ax.set_xlabel("Matchup")
    ax.set_title("Latest positive EV bets")
    ax.set_ylim(0, max(0.4, chart_table["Expected Value"].max() + 0.05))
    plt.xticks(rotation=25, ha="right")

    for bar, ev in zip(bars, chart_table["Expected Value"]):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            ev + 0.01,
            f"{ev:.2f}",
            ha="center",
            va="bottom",
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
    x = list(range(len(dates)))
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
    ax.set_ylabel("Belop (kr) / Bets x100")
    ax.set_title("Portefolje over tid")
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
    Lag et soylediagram for siste `days` dager med realisert dagsresultat.
    Soylene er like hoye (positive/negative) som profitten den dagen.
    """
    if daily.empty:
        print("[recent-profit] Ingen data a plotte")
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
    ax.set_title(f"Daglig resultat - siste {min(days, len(trimmed))} dager")
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
    report = load_value_report(VALUE_DAYS_AHEAD)
    used_days = VALUE_DAYS_AHEAD
    fallback_used = False

    if not report and VALUE_FALLBACK_DAYS > VALUE_DAYS_AHEAD:
        report = load_value_report(VALUE_FALLBACK_DAYS)
        used_days = VALUE_FALLBACK_DAYS
        fallback_used = True

    table = build_value_table(report, VALUE_MIN)
    report_meta = {
        "date_range": _report_date_range(report),
        "days_ahead": used_days,
        "min_value": VALUE_MIN,
        "total_games": len(report),
        "fallback_used": fallback_used,
        "fallback_days": VALUE_FALLBACK_DAYS if fallback_used else None,
    }

    save_markdown(table, OUTPUT_MARKDOWN, report_meta)
    save_chart(table, OUTPUT_IMAGE, max_rows=VALUE_CHART_MAX)

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
