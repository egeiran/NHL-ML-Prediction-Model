"""
Snapshot-logg for odds: hva NT og de skarpe bøkene priset, og når.

Kun stdlib, så analyze_market.py kan lese loggen uten pandas.

Lagring (alt under NHL/data/odds/, eller NHL_ODDS_DIR):
  nt_YYYY-MM.jsonl     én linje per NT-kamp per kjøring
  sharp_YYYY-MM.jsonl  én linje per kamp fra The Odds API per kjøring
  runs.csv             én rad per kjøring: status, antall, kvote

Månedsfiler etter snapshot-tidspunktet i UTC holder hver fil liten (~1 MB) og
gjør diffene i git lesbare. Linjene skrives bare til, aldri om.

Hvorfor JSONL og ikke én CSV-rad per marked × utvalg: en kamp har ~25
utvalg vi bryr oss om. Lang CSV ville blitt ~4x så stor, og formen på
markedene (linjer, Ja/Nei, korrekt resultat) passer dårlig i faste kolonner.
`flatten()` gir den lange formen når analysen trenger den.
"""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DIR = BASE_DIR / "data" / "odds"
KINDS = ("nt", "sharp")

RUN_FIELDS = [
    "run_at",
    "job",
    "nt_status",
    "nt_events",
    "nt_markets_ok",
    "nt_markets_failed",
    "nt_unclassified",
    "sharp_status",
    "sharp_events",
    "sharp_matched",
    "quota_remaining",
    "quota_used",
    "strategy_decided",
    "strategy_bets",
    "strategy_settled",
    "note",
]


def odds_dir() -> Path:
    raw = os.environ.get("NHL_ODDS_DIR", "").strip()
    return Path(raw) if raw else DEFAULT_DIR


def _month_file(kind: str, at: datetime, directory: Optional[Path] = None) -> Path:
    if kind not in KINDS:
        raise ValueError(f"ukjent snapshot-type: {kind}")
    at = at.astimezone(timezone.utc) if at.tzinfo else at
    return (directory or odds_dir()) / f"{kind}_{at:%Y-%m}.jsonl"


def append(kind: str, records: Iterable[Dict[str, Any]], now: datetime,
           directory: Optional[Path] = None) -> Optional[Path]:
    """Legger postene til i månedsfila for `now`. Returnerer fila, eller None hvis ingen poster."""
    records = list(records)
    if not records:
        return None
    path = _month_file(kind, now, directory)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
            f.write("\n")
    return path


def iter_records(kind: str, directory: Optional[Path] = None) -> Iterator[Dict[str, Any]]:
    """Alle poster av en type, eldste måned først. Ødelagte linjer hoppes over."""
    directory = directory or odds_dir()
    if not directory.exists():
        return
    for path in sorted(directory.glob(f"{kind}_*.jsonl")):
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def by_key(records: Iterable[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Poster gruppert på kampnøkkel, sortert på tidspunkt."""
    out: Dict[str, List[Dict[str, Any]]] = {}
    for rec in records:
        key = rec.get("key")
        if key:
            out.setdefault(key, []).append(rec)
    for recs in out.values():
        recs.sort(key=lambda r: r.get("at") or "")
    return out


def last_before(
    records: Iterable[Dict[str, Any]],
    t: str,
    predicate: Optional[Callable[[Dict[str, Any]], bool]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Siste post med `at` strengt før `t` (ISO-strenger i UTC med Z sammenlignes
    leksikografisk riktig). `predicate` kan kreve f.eks. at ML-markedet finnes.
    """
    best = None
    for rec in records:
        at = rec.get("at") or ""
        if not at or at >= t:
            continue
        if predicate is not None and not predicate(rec):
            continue
        if best is None or at > best.get("at", ""):
            best = rec
    return best


def flatten(record: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Lang form av en NT-post: én rad per marked × linje × side.
    {key, at, job, market, line, side, odds}. Linje er "" for markeder uten linje.
    """
    rows = []
    base = {"key": record.get("key"), "at": record.get("at"), "job": record.get("job")}
    for market, content in (record.get("m") or {}).items():
        if not isinstance(content, dict):
            continue
        values = list(content.values())
        lined = bool(values) and all(isinstance(v, dict) for v in values)
        groups = content.items() if lined else [("", content)]
        for line, prices in groups:
            for side, odds in prices.items():
                rows.append({**base, "market": market, "line": line, "side": side, "odds": odds})
    return rows


def read_runs(directory: Optional[Path] = None) -> List[Dict[str, str]]:
    """
    Kjøringene, eldste først etter `run_at` – ikke fil-rekkefølge: union-merge
    (.gitattributes) kan legge en kjøring som ble pushet sist foran en som
    kjørte senere. Sorteringen er stabil, så like tidspunkt beholder rekkefølgen.
    """
    path = (directory or odds_dir()) / "runs.csv"
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return sorted(csv.DictReader(f), key=lambda r: r.get("run_at") or "")


def append_run(row: Dict[str, Any], directory: Optional[Path] = None) -> Path:
    path = (directory or odds_dir()) / "runs.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RUN_FIELDS, extrasaction="ignore")
        if new:
            writer.writeheader()
        writer.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in RUN_FIELDS})
    return path


def last_quota_remaining(now: datetime, directory: Optional[Path] = None) -> Optional[int]:
    """
    Siste kjente gjenstående kvote i inneværende måned (UTC), eller None.
    Kvoten nullstilles månedlig, så en lav verdi fra forrige måned teller ikke.
    """
    month = now.astimezone(timezone.utc).strftime("%Y-%m")
    for row in reversed(read_runs(directory)):
        if not (row.get("run_at") or "").startswith(month):
            return None
        raw = row.get("quota_remaining")
        if raw not in (None, ""):
            try:
                return int(float(raw))
            except ValueError:
                continue
    return None
