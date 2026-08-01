# Blålinja — arbeidsplan og gjenopptakelsespunkt

Status per 2026-07-29. Les `DECISIONS.md` i samme mappe først — den er bindende.

## Hva som er gjort

- Handoffen (`docs/design_handoff_blalinja_frontend/README.md`) er lest i sin helhet.
- Python-pipelinen og dagens frontend er kartlagt (funn under).
- Beslutninger avklart med eier → `DECISIONS.md`.
- `NHL/analyze_stake_sizing.py` hentet fra `claude/betting-adjustment-expected-return-73zbom`.
- `PROBLEMS.md` oppdatert med EV-funnet fra samme branch.
- Analysen kjørt; fasit dumpet til `docs/blalinja/stake_truth.json` og verifisert
  mot tallene i issue #7 (EV: r = −0,0247, p = 0,735 · odds: r = −0,083, p = 0,239 ·
  EV-kvartiler n = 50/51/50/51 med ROI −0,9 % / −12,6 % / +31,9 % / −17,1 %).

Ingen frontend-kode er skrevet ennå. Neste sesjon starter på bølge A.

## Kartlegging — det du slipper å finne ut på nytt

### Python / pipeline

- `NHL/export_site_data.py` skriver 5 filer til `nhl-frontend/public/data/`
  (`matchups.json`, `teams.json`, `value-report.json`, `portfolio.json`, `meta.json`).
  Nye eksporter hektes på som én `run(...)`-linje i blokken på `:194-197`.
  Rekkefølge betyr noe: `matchups` må kjøre før `teams`.
  Env: `NHL_EXPORT_DIR` (`:56`), `NHL_EXPORT_DAYS` (`:61`), `MIN_TEAMS_FOR_EXPORT = 24` (`:53`).
- `NHL/api.py` er en FastAPI dev-server. **Ikke i prod-løypa** — ingen workflow
  kaller den. `NHL/report_service.py` er derimot aktivt brukt av både api.py,
  export_site_data.py og test_site_export.py.
- `.github/workflows/daily-bet-update.yml` (cron `0 8 * * *`) kjører pipelinen og
  committer `nhl-frontend/public/data/*.json` på `:160` — **glob, så nye JSON-filer
  blir committet automatisk**. Vercel redeployer på den committen. Ingen deploy-workflow.
- EV-terskel defineres ett sted: `NHL/bet_tracker.py:37`
  `DEFAULT_MIN_VALUE = float(os.environ.get("NHL_VALUE_MIN", "0.15"))`.
  Satt i CI på `daily-bet-update.yml:21`. EV-formelen: `NHL/utils/value_utils.py:32`.
- 3-utfalls-logging (åpent funn 02): kollapsen skjer i
  `NHL/bet_tracker.py::_build_bet_entry` (`:419-489`) — fire lookup-dicts bygges for
  alle tre utfall på `:444-463`, men bare `[selection]` plukkes ut på `:465, 479-481`.
  Endringspunkter: `BET_FIELDS` (`:57-76`), return-dicten (`:470-489`).
  Samme radbygger brukes av shadow (`:607`) og below_threshold (`:492`), så alle tre
  CSV-ene får feltene gratis. `_write_csv` bruker fast `BET_FIELDS`, så gamle rader
  får tomme felt uten å knekke.
- `NHL/models/elo_ratings.json`: 34 lag (inkl. historiske ATL/PHX), nøkkelen er
  `ARI`, ikke `UTA`. Aliasing skal skje i eksport-steget (se DECISIONS pkt. 5).
- Datastatus: `bet_history.csv` 202 rader · `bet_shadow.csv` **0 rader** ·
  `bet_below_threshold.csv` 388 rader, alle `status=below_threshold`.

### Frontend

- Next.js 15 App Router, `output: 'export'`, `images.unoptimized: true`,
  betinget `basePath` via `NEXT_PUBLIC_BASE_PATH`. `vercel.json` i repo-rot:
  `outputDirectory: out`.
- Én rute (`/`), `'use client'` på hele `app/page.tsx`. All data hentes med `fetch`
  i `useEffect`. Ingen tester i frontend. tsconfig `strict: true`. Alias `@/* → ./*`.
- `package-lock.json` er i sync. `lucide-react` er eneste ikke-triviell avhengighet
  og skal fjernes.
- `app/layout.tsx:16` har fortsatt boilerplate-metadata (`title: "Create Next App"`).
- `app/globals.css:25` setter `font-family: Arial` og overstyrer fontene fra layout.
- `lib/data.ts` har allerede et dual-mode datalag (statisk JSON vs. `NEXT_PUBLIC_API_BASE`).
  Det statiske sporet beholdes; API-sporet kan forenkles bort siden vi har bestemt statisk.
- `components/ValueOverTimeChart.tsx` er et håndskrevet inline-SVG-linjediagram
  (480×200, pad 24) — mønsteret gjenbrukes, men visuelt språk byttes helt.

## Bølgeplan

Filsoner er disjunkte per agent. Delte filer eies kun av grunnmur-agenten.

**Bølge A — parallelt, uavhengig**
- A1 · Designekstraksjon: les `NHL Modell.dc.html` + skjermbildene, skriv
  `docs/blalinja/design-spec.md` med eksakte tokens, per-skjerm DOM-struktur,
  SVG-geometri og alle norske UI-strenger. Ingen kodeendringer.
- A2 · Pipeline: `elo.json`-eksport (med UTA-alias), `shadow.json`-eksport,
  `value_min` inn i `meta.json`, 3-utfalls-felt i `BET_FIELDS`, utvid
  `NHL/test_site_export.py`. Sone: `NHL/**`, `.github/workflows/**`.

**Bølge B — etter A1, serielt (eier delte filer)**
- B1 · Grunnmur: tokens i `globals.css`, `next/font/google`, app-shell (masthead,
  nav, mobil bunnnav), sju ruter, `lib/format.ts` (nb-NO, U+2212), `lib/data.ts`,
  `lib/config.ts` (evTerskel + env-terskler), `types/index.ts`, delte
  chart-primitiver. Sletter gammel `page.tsx` og `components/*`.
- B2 · `lib/analysis.ts` — ren matematikk, ingen React: kvantilbøtting, Wilson,
  bootstrap (~10 000 trekninger), Pearson-r + permutasjonstest, de sju
  innsatsreglene med omsetningsnormalisering. Verifiseres mot `stake_truth.json`.
  Kan kjøre parallelt med B1 (disjunkt fil).

**Bølge C — etter B, parallelt, én agent per skjerm**
C1 Oversikt · C2 Verdi i dag · C3 Historikk · C4 Kampanalyse · C5 Elo ·
C6 Modell (kalibrering + EV/odds-bøtter + innsatssimulator, issue #7) ·
C7 Skyggelogg

**Bølge D** — responsiv gjennomgang, mobil bunnnav, `npm run lint` + `npm run build`.

**Bølge E** — `code-review`- og `security-review`-agenter parallelt, fiks, gjenta
til begge er rene.

## Åpne punkter for eier

- `bet_below_threshold.csv`: nye rader skrives med `status="pending"` og
  `stake=100` (`bet_tracker.py:483,499`), men `update_daily_bets` avregner dem
  aldri (`:693-695`). De blir liggende pending permanent. Reell databug, men i
  innsatslogikken — ikke rørt.
- Backfill av de 388 below-threshold-radene (`backfill_shadow_results.py`) ville
  nesten tredoble analyseutvalget, men da stemmer ikke lenger fasiten i issue #7.
  Egen jobb, etter denne PR-en.
