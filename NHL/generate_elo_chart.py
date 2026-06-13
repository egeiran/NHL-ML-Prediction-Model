#!/usr/bin/env python3
"""
Genererer docs/elo.png: en oversikt over nåværende Elo-ratings for de 32
aktive NHL-lagene, lest fra models/elo_ratings.json.

Kjøres i den daglige workflowen (og ved Elo-oppdatering) så grafen i README
alltid speiler siste ratings. Trenger ikke NHL-APIet – leser kun JSON-fila.
"""
from __future__ import annotations

import os
from pathlib import Path

# Matplotlib må kunne cache fonter i miljøer uten skrivbar home.
MPL_CACHE_DIR = Path(os.environ.setdefault("MPLCONFIGDIR", str(Path("/tmp/mplcache"))))
MPL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt

from live.nhl_results import CURRENT_TEAMS
from utils.elo import load_ratings
from utils.team_alias import to_canonical, to_display

NHL_DIR = Path(__file__).resolve().parent
REPO_ROOT = NHL_DIR.parent
RATINGS_PATH = NHL_DIR / "models" / "elo_ratings.json"
OUTPUT_IMAGE = REPO_ROOT / "docs" / "elo.png"


def _use_plot_style() -> None:
    try:
        plt.style.use("seaborn-v0_8-darkgrid")
    except OSError:
        plt.style.use("seaborn-darkgrid")


def main() -> None:
    ratings, config = load_ratings(str(RATINGS_PATH))
    if not ratings:
        print("[elo-chart] Ingen ratings funnet, hopper over.")
        return

    # Bare de 32 aktive lagene, vist med visningsforkortelse (ARI -> UTA).
    rows = []
    for abbr in CURRENT_TEAMS:
        rating = ratings.get(to_canonical(abbr))
        if rating is None:
            continue
        rows.append((to_display(abbr), float(rating)))
    rows.sort(key=lambda r: r[1])  # lavest nederst -> høyest øverst i barh

    labels = [r[0] for r in rows]
    values = [r[1] for r in rows]
    base = config.base_rating
    colors = ["#16a34a" if v >= base else "#dc2626" for v in values]

    _use_plot_style()
    fig, ax = plt.subplots(figsize=(9, 11))
    bars = ax.barh(labels, values, color=colors)
    ax.axvline(base, color="#555", linewidth=1, linestyle="--", label=f"Base ({base:.0f})")
    ax.set_xlabel("Elo-rating")

    meta = {}
    try:
        import json

        meta = json.loads(RATINGS_PATH.read_text(encoding="utf-8")).get("meta", {})
    except Exception:
        meta = {}
    through = meta.get("through", "")
    title = "NHL Elo-ratings"
    if through:
        title += f" (oppdatert t.o.m. {through})"
    ax.set_title(title)

    lo = min(values) - 10
    hi = max(values) + 25
    ax.set_xlim(lo, hi)
    for bar, v in zip(bars, values):
        ax.text(
            v + 2,
            bar.get_y() + bar.get_height() / 2,
            f"{v:.0f}",
            va="center",
            ha="left",
            fontsize=8,
        )
    ax.legend(loc="lower right")
    fig.tight_layout()

    OUTPUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = OUTPUT_IMAGE.with_name(OUTPUT_IMAGE.stem + "_tmp" + OUTPUT_IMAGE.suffix)
    fig.savefig(tmp_path, dpi=150, bbox_inches="tight", format="png")
    tmp_path.replace(OUTPUT_IMAGE)
    plt.close(fig)
    print(f"Wrote {OUTPUT_IMAGE.relative_to(REPO_ROOT)} ({len(rows)} teams, through {through or 'n/a'}).")


if __name__ == "__main__":
    main()
