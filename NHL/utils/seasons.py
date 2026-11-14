"""Sesong-hjelpere uten tunge avhengigheter (kun stdlib)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional


def season_of(date_str: Optional[str]) -> str:
    """
    NHL-sesongen en dato hører til, f.eks. "2025-26". Sesongen går fra oktober
    til juni, så vi deler på 1. juli: alt fra juli og ut året tilhører sesongen
    som starter det året, alt før juli tilhører sesongen som startet året før.
    """
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except Exception:
        return ""
    start_year = d.year if d.month >= 7 else d.year - 1
    return f"{start_year}-{(start_year + 1) % 100:02d}"
