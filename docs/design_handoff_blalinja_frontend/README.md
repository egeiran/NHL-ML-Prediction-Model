# Handoff: Blålinja — NHL-modell frontend

> **Historical document.** This handoff was written against a snapshot of the
> betting history that had 202 settled bets, before the 20 playoff rows were
> removed. Every count and kroner figure below (202 bets, 85.5 / 66.4 / 68,
> +35 kr, 33,7 %) describes that snapshot and is no longer current. It is kept
> as-is because it is the design brief the build was done from; for live numbers
> read `nhl-frontend/public/data/portfolio.json` and
> `docs/blalinja/stake_truth.json`. The visual specification is unaffected.

## Overview

A full frontend rebuild for `egeiran/NHL-ML-Prediction-Model`. The existing app
(`nhl-frontend/`) is a single scrolling page: a bankroll card, a value board and a
custom matchup panel, styled dark-slate with Tailwind defaults.

This design replaces it with a seven-view application in a deliberately editorial
visual language — bone paper, ink, hairline rules, a high-contrast display serif and
monospace figures — and surfaces four datasets the current UI never showed: bet
history, Elo ratings, model calibration, and the shadow log.

The product answers one question first: **am I up or down, and should I bet anything
today?** Everything else is secondary navigation.

Copy is Norwegian throughout. Currency and number formatting is `nb-NO`.

---

## About the design files

The files in this bundle are **design references written in HTML** — a working
prototype of the intended look and behaviour. They are **not production code to copy
into the app.**

`NHL Modell.dc.html` is authored in a proprietary component format that will not run
in your codebase. Open it in a browser to see and click the design; read it to lift
exact values. Then **recreate the design in the target codebase** —
Next.js + React + Tailwind, per the decision below — using that project's own
patterns.

`nhl-data.js` is a compiled snapshot of the repo's real data, used so the prototype
shows true numbers. It is **not** an artefact to ship; the real app reads the JSON
files in `public/data/`.

---

## Fidelity

**High-fidelity.** Colors, typography, spacing, rules and interaction states are
final and exact. Recreate them faithfully. Every number shown in the prototype is
computed from the repo's real data files — no lorem, no invented figures, with one
labelled exception noted under "Sample day" below.

---

## Decisions taken with the client

| Question | Decision |
| --- | --- |
| Stack | Keep Next.js + React + Tailwind. Plain CSS / CSS Modules are fine where Tailwind gets in the way — this design is hairline-rule and typography driven, and much of it reads better as CSS than as utility soup. |
| `evTerskel` (EV threshold) | Ship as a **real user-facing setting** in the UI. |
| `tallTerskel` / `roiTerskel` | Ship as **environment variables**, not UI. Defaults `1000` (kr) and `5` (%). |
| `startVisning`, `tettTabell` | Prototype conveniences. Do not build. |
| Mobile | **One responsive app.** Same routes; the tab bar becomes a fixed bottom nav under 768px. |
| Team logos | Use **NHL API logo URLs**. `teams.json` already carries the numeric team id. |
| Sample day | **Remove.** Build only the real empty state. |
| Product name | **Blålinja.** |
| Scope | All seven views. |
| Data delivery | **No database.** Extend the existing GitHub Actions JSON export. Rationale below. |

---

## Data

### Why no database

The pipeline already writes JSON to `nhl-frontend/public/data/` on a schedule
(`.github/workflows/daily-bet-update.yml`). The data is small (`portfolio.json` is
132 KB at 202 bets), append-only, single-user, and updated once a day. A database or
API layer would add hosting, migrations, auth and failure modes without solving a
problem that exists. Static JSON also means the site can stay a static export.

Revisit only when one of these becomes true: live in-play odds, more than one user,
or writes from the browser.

### Files that already exist

| File | Contains | Used by |
| --- | --- | --- |
| `public/data/portfolio.json` | `timeseries[]` (106 game days), `summary`, `bets[]` (202) | Oversikt, Historikk, Modell, Skyggelogg |
| `public/data/teams.json` | `[{abbreviation, id}]` — 32 teams | Logos, selectors |
| `public/data/matchups.json` | `generated_at`, `teams[abbr].last_5`, `matchups["HOME-AWAY"] = {prob_home_win, prob_ot, prob_away_win}` | Kampanalyse |
| `public/data/value-report.json` | Today's value picks. Currently `[]` (off-season) | Verdi i dag, Oversikt hero |
| `public/data/meta.json` | `generated_at`, `days_ahead`, `files`, `failed` | Header timestamp, empty state |

### Files that must be added to the export

These four jobs must be done before the new screens have anything to render. All are
additions to the existing workflow's `git add` step and its export script.

1. **Elo ratings.** `NHL/models/elo_ratings.json` is tracked in git but never copied
   to `public/data/`. Copy it. Shape:
   ```json
   { "config": { "base_rating": 1500, "home_advantage": 50, "k_factor": 6,
                 "ot_win_score": 0.6, "scale": 400, "season_regression": 0.7 },
     "meta": { "n_games": 29606, "through": "2026-04-16", "updated_at": "..." },
     "ratings": { "ANA": 1464.71, "BOS": 1514.19, ... } }
   ```
   **Utah caveat:** `ratings` has no `UTA` key — Utah is stored under the canonical
   `ARI`. The frontend must alias `UTA → ARI` when reading a rating, and the Elo
   screen carries a note about it. This is the same alias bug documented in
   `PROBLEMS.md`; if it is fixed upstream, drop the alias.

2. **Shadow log.** Export `NHL/data/bet_shadow.csv` as
   `public/data/shadow.json` with the same row shape as `portfolio.bets[]`. The
   Skyggelogg screen currently derives its figures from the draw-selection rows still
   present in `portfolio.json`; once real shadow data exists it should read that
   instead, because new OT/SO bets no longer enter `bet_history.csv`.

3. **Calibration.** Computed **client-side** from `portfolio.json.bets` — no export
   needed. Formulas below. Move it to Python later only if the bin count grows.

4. **All three outcomes per game.** This is open finding 02 in `PROBLEMS.md`:
   `model_prob` and `implied_prob` are stored only for the outcome that was bet.
   Until all three are logged, the calibration screen can only measure the selected
   outcome, which is exactly the selection bias it is trying to expose. Logging all
   three is the single highest-value data change in this handoff.

### Derived metrics — exact formulas

Implement these verbatim; several of them were wrong in an earlier draft.

```
implied_prob      = 1 / odds
EV                = model_prob * odds - 1          // NOT model_prob - implied_prob
is_value          = EV >= evTerskel                // evTerskel stored as fraction
roi               = profit / total_staked

// portfolio.timeseries[].value is CUMULATIVE NET PROFIT, not account balance
daily_pnl[i]      = value[i] - value[i-1]          // value[-1] treated as 0
window_net        = value[last] - value[index_before_window_start]
cumulative_staked = running sum of timeseries[].invested

// Model quality
expected_hits_model  = sum(bets[].model_prob)      // = 85.5 over the 202 bets
expected_hits_market = sum(bets[].implied_prob)    // = 66.4
actual_hits          = count(bets[].status == "won")   // = 68

// Calibration bins, half-open [lo, hi)
bins = [[.25,.32], [.32,.37], [.37,.42], [.42,.47], [.47,.55], [.55,.80]]
per bin: n, mean(model_prob), mean(implied_prob), share won
```

Reference values from the current data, to check your implementation against:
total_bets 202 · total_staked 20 200 · settled_return 20 235 · profit **+35 kr** ·
roi **0,002** · win_rate **0,337** · mean odds **3,14** ·
home 90 bets, away 86, draw 26 · draw bets **−640 kr**, non-draw **+675 kr**.

### Number formatting

`Intl.NumberFormat('nb-NO')` throughout — space as thousands separator, comma as
decimal. Two rules the prototype applies everywhere:

- Negative numbers use the **true minus sign U+2212 (−)**, never a hyphen.
- Signed values are always explicitly signed: `+35 kr`, `−575 kr`, `+21,8 %`.
- Percent has a space before `%`: `33,7 %`.
- Money is suffixed ` kr` in body copy; in table columns the unit lives in the header.

---

## Design tokens

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `paper` | `#F2EDE4` | Page ground |
| `ink` | `#17150F` | Primary text, strong rules, active pill fill |
| `body` | `#4A453B` | Body copy |
| `muted` | `#7A7364` | Labels, kickers, secondary figures |
| `faint` | `#9A9284` | Axis labels, timestamps, tertiary text |
| `fainter` | `#B0A794` | Meta chrome |
| `rule-strong` | `#17150F` | Section top rules, header borders (1px) |
| `rule` | `#D8CFBC` | Column dividers, control track (1px) |
| `rule-light` | `#E4DCCB` | Row separators (1px) |
| `tint` | `#EAE3D5` | Row hover, inset panels, callout ground |
| `tint-rule` | `#DCD3C1` | Rules inside a tinted panel |
| `dash` | `#C9BFA9` | Logo placeholder border, zero line, diagonal reference |
| `teal` | `#0E4B47` | Gain, model, value, "SPILL" |
| `vermillion` | `#B23A1B` | Loss, risk, warnings |
| `tooltip-bg` | `#17150F` | Chart tooltip |
| `tooltip-fg` | `#F2EDE4` | Chart tooltip text |
| `tooltip-muted` | `#A8A091` | Chart tooltip secondary |
| `selection` | `#DCE5E2` | `::selection` |
| `link-underline` | `#B6C7C3` | Inline link border-bottom |

Semantics are strict: **teal is gain, model, and value; vermillion is loss and risk.**
Never use them decoratively.

Page texture: `background-image: radial-gradient(rgba(23,21,15,.045) 1px, transparent 1px); background-size: 5px 5px;`

**No border-radius anywhere — every corner is 0. No box-shadows.** Elevation and
grouping come from hairline rules and whitespace only. The one `box-shadow` in the
design is `inset 0 -2px 0` used as a nav underline.

### Typography

Three families, loaded from Google Fonts:

```
Instrument Serif  400, 400 italic     display, headlines, large figures
IBM Plex Sans     400, 500, 600       UI text, body copy
IBM Plex Mono     400, 500            all numbers, labels, controls
```

**Every figure is monospace.** Money, odds, percentages, counts, dates in tables — all
IBM Plex Mono, so columns align. The only numbers in Instrument Serif are deliberate
display figures (hero total, EV on a bet card, the three calibration numbers).

| Role | Spec |
| --- | --- |
| Wordmark | Instrument Serif 400 · 34px/0.9 · `-0.015em` |
| Kicker | IBM Plex Mono 500 · 10px/1 · `0.18em` · uppercase · `muted` |
| Screen title | Instrument Serif 400 · 38px/1.05 |
| Hero headline | Instrument Serif 400 · `clamp(38px,4.4vw,62px)`/1.05 · `-0.02em` |
| Hero display figure | Instrument Serif 400 · `clamp(52px,6vw,88px)`/0.85 · `-0.03em` |
| Calibration figure | Instrument Serif 400 · `clamp(56px,6vw,82px)`/0.9 |
| Team name (list) | Instrument Serif 400 · 22px/1.12 |
| Team name (table) | Instrument Serif 400 · 15px/1.2 |
| Body | IBM Plex Sans 400 · 15px/1.7 · `body` · `text-wrap: pretty` |
| Body small | IBM Plex Sans 400 · 13px/1.6 · `body` |
| Row label | IBM Plex Sans 400 · 14.5px/1.25 |
| Nav item | IBM Plex Mono 500 · 10px/1 · `0.15em` · uppercase |
| Control / pill | IBM Plex Mono 500 · 9.5px/1 · `0.10em` · uppercase |
| Stat label | IBM Plex Mono 500 · 9px/1 · `0.14em` · uppercase · `muted` |
| Table header | IBM Plex Mono 500 · 8.5px/1.3 · `0.14em` · uppercase · `muted` |
| Table figure | IBM Plex Mono 400 · 12.5px/1.3 |
| Stat figure | IBM Plex Mono 400 · 19–24px/1 |
| Axis label | IBM Plex Mono 400 · 10px/1 · `faint` |

### Layout

- Content column `max-width: 1440px`, centred, `padding: 0 48px`.
- Header is `position: sticky; top: 0`, `z-index: 30`, ground `paper`, 1px `ink`
  bottom border. Two rows: masthead (18px top / 14px bottom padding) and nav
  (1px `rule` top border, items `padding: 11px 0 9px`). Combined height ≈ **108px**.
- Sections are separated by 1px rules, not by cards or gaps.
- Two-column splits use `display: grid` with a 1px `rule` `border-right` on the left
  column and asymmetric `minmax()` tracks — never a symmetric 50/50.
- Sibling groups use flex/grid with `gap`, never margins between items.

---

## Screens

Nav order, left to right: **Oversikt · Verdi i dag · Kampanalyse** — divider —
**Historikk · Elo · Modell · Skyggelogg**. The divider is a 1px `rule` vertical line
with `margin: 9px 0`. Daily-use views sit left of it; analysis views right.

Active nav item: `ink` text with a 2px `ink` bottom border. Inactive: `muted`,
transparent border.

---

### 1. Oversikt

**Purpose:** answer "am I up or down, and is there anything to bet today" without
scrolling.

**Layout.** The hero section is `min-height: calc(100vh - 108px)`, a flex column, with
a 1px `ink` bottom border and `padding: 36px 0 0`.

- **Top band** (`flex: 0 0 auto`, `padding-bottom: 30px`): kicker + headline on the
  left (`max-width: 60ch`), and on the right the day-state control. Once the sample
  day is removed this control goes away, leaving kicker and headline alone.
- **Body** (`flex: 1 1 auto; min-height: 0`), 1px `ink` top border, grid
  `minmax(300px,.62fr) minmax(0,1fr)`:
  - **Left — "Dagens spill"** (`padding: 22px 44px 24px 0`, 1px `rule` right border).
    With picks: a scrolling list of up to three bets. Each row is
    `padding: 20px 0` over a 1px `rule-light` border, containing kick-off time
    (Mono 11px `faint`) opposite EV (**Instrument Serif 32px/0.9 `teal`**), then a
    38px logo square + team name (Serif 22px) with "borte mot New York Rangers"
    beneath (Mono 10px uppercase `faint`), then `modell 49,7 %` and `odds 2,45`
    (Mono 11px `muted`, `gap: 24px`).
    Without picks: the column vertically centres a short statement in Serif
    `clamp(24px,2.4vw,32px)` `body`, plus two buttons.
  - **Right — the curve** (`padding: 22px 0 0 44px`). Header row: window label
    (kicker) + window net (**Mono 30px**, teal/vermillion) on the left, the
    60D / 90D / ALT pills on the right. Then the chart at `flex: 1 1 auto;
    min-height: 140px`. Then a four-cell stat row over a 1px `rule` top border:
    Spill i perioden · Treffrate · Beste dag · Svakeste dag.

**Suppression rules — important.** The all-time total and the ROI percentage are
**hidden unless they clear a threshold**, because +35 kr and +0,2 % read as noise
and flatter nothing:

- Show `+35 kr siden start` (Serif 52px) only when `|profit| >= tallTerskel` (1000 kr).
- Show `+0,2 % avkastning` only when `|roi * 100| >= roiTerskel` (5 %).
- **Also hide the window net when it is negative** — the label and the curve stay, the
  red number does not. The shape carries the bad news; the figure would shout it.

The headline reflects state: `Ett spill over terskel` / `3 spill over terskel` when
picks exist, `Ingen spill over terskel` when games exist but none qualify, and
`Ingen kamper i dag` only in the off-season. The kicker is the day label
(`Sesongpause` or the date).

**Below the fold:** the chart lab (see Charts), then "Siste avgjorte" — nine rows,
grid `62px minmax(0,1fr) 56px 66px 76px`, showing date, "Away hos Home", bet side,
odds, and net in teal/vermillion.

---

### 2. Verdi i dag

**Purpose:** the day's games with the model's price against the market's.

**Header:** kicker `VALUE-RAPPORT · TERSKEL EV ≥ 20 %` and the date as screen title.

**Empty state** (the real state most of the year): a two-column split. Left
(`padding: 80px 48px 88px 0`, 1px `rule` right border) carries
`Ingen kamper å prise` in Serif `clamp(46px,5.6vw,80px)`/0.95 `max-width: 16ch`, a
one-line explanation, and a button to Kampanalyse. Right is a "Siste kjøring" table:
Kjørt, Horisont, Kamper funnet, Value-spill, Feilede jobber — read from `meta.json`.
This is the screen the app shows today; make it good.

**Populated state:** a filter row (Bare value / Alle kamper — **default "Alle
kamper"**, so every game is always listed and value is a filter, not a gate) with a
count line, then one row per game. Grid `minmax(280px,.85fr) minmax(0,2fr)`:

- Left: time · arena, then away and home each as a 38px logo square + Serif 18px name
  + `Borte · Elo 1 559` (Mono 10px uppercase `faint`), then Elo-diff and Form B/H.
- Right: a three-row outcome table, header grid
  `minmax(0,1fr) 74px 74px 82px 92px` — Utfall, Modell, Marked, Odds, EV.
  Each row shows the outcome label plus a tag (`SPILL` teal-bordered, `NEI` and
  `UTELATT` `dash`-bordered), a two-layer probability bar (market in `dash` behind,
  model in `teal` or `ink` in front), then the four figures. **The OT/SO row renders
  at `opacity: 0.5` and is always tagged `UTELATT`** — those bets are no longer
  placed. Show the price anyway; the shadow log needs it.

---

### 3. Kampanalyse

**Purpose:** price any pairing by hand.

Grid `minmax(300px,.8fr) minmax(0,1.6fr)`. Left: home and away `<select>`s (32 teams,
sorted by Norwegian collation, labelled `Boston Bruins (BOS)`), a swap button, and
three odds `<input type="number" step="0.05" min="1.01">` fields. Right: the matchup
title, the model's pick, and three outcome columns in a
`repeat(3, minmax(0,1fr))` grid over a 1px `ink` top border — each with a label, the
probability as **Serif `clamp(44px,5vw,66px)`/0.9**, a 4px bar, then Marked / Odds /
EV rows and a tag. Below: Elo (home, away, +50 home advantage, adjusted difference)
and last-five form with scores.

Everything recalculates on change — no submit button.

Form controls: `background: paper`, `border: 1px solid #C9BFA9`, `border-radius: 0`,
`padding: 12px`, IBM Plex Sans 15px. Number inputs are right-aligned Mono 14px.

---

### 4. Historikk

**Purpose:** every decision that was actually taken.

Header carries Utvalg / Treffrate / Netto as Mono 24px figures. Three filter groups —
status (Alle / Vunnet / Tapt), outcome (Alle utfall / Hjemme / Borte / OT/SO), sort
(Nyeste / Høyest EV / Beste netto) — and a right-aligned note `Alle spill 100 kr`,
which is why there is no stake column.

Table grid: `76px minmax(0,1.5fr) 66px 60px 72px 72px 76px 80px 92px` —
Dato · Kamp · Spill · Odds · Modell · Marked · EV · Resultat · Netto. Rows are
`padding: 12px 0` over 1px `rule-light`, hover `tint`. Resultat is Mono 9.5px
uppercase in teal/vermillion; Netto is Mono 13px, right-aligned, signed and coloured.

202 rows. Virtualise if it costs anything; it did not here.

---

### 5. Elo

Grid `minmax(0,1fr) 280px`. Left is the ranked table, grid
`32px 42px minmax(0,1fr) 54px minmax(120px,1.1fr) 64px` — rank, logo, name,
conference, deviation bar, rating. The bar is **diverging around 1500**: a 4px
`rule-light` track with a 1px `dash` centre line at 50%, and a fill of
`min(|rating-1500|/100, 1) * 46` percent extending right (teal) or left (vermillion).
Right column lists the six Elo parameters from `config`, plus the Utah/ARI caveat in
a `tint` panel with a 3px `vermillion` left border.

Conference filter: Alle / Øst / Vest.

---

### 6. Modell

Opens with three numbers across a `repeat(3, minmax(0,1fr))` grid, 1px `ink` borders
above and below: **Modellen forventet 85,5** (vermillion) · **Markedet forventet 66,4**
(muted) · **Faktisk 68** (teal). That contrast is the screen's entire argument.

Below, grid `minmax(340px,.8fr) minmax(0,1.2fr)`:

- Left: the calibration plot. A 520×400 `viewBox`, axes 0.15–0.72, with a dashed
  `dash` diagonal as the perfect-calibration reference, the model's polyline in `ink`
  1.8px and the market's in `faint` 1.4px. **Points and tick labels are absolutely
  positioned HTML over the SVG, not SVG elements** — filled `ink` dots for the model,
  hollow `faint` dots for the market, sized `7 + min(n/8, 9)` px by sample count.
- Right: the per-bin table, the per-outcome-type table, and the two open findings from
  `PROBLEMS.md` as numbered items (Serif 24px `dash` numeral + Serif 17px title +
  body).

---

### 7. Skyggelogg

Two panels side by side, the shadow one on `tint` ground: **Faktisk portefølje
+675 kr** against **Skyggelogg −640 kr**, each as Serif `clamp(48px,5.4vw,72px)`/0.9
over a 5px comparison bar scaled to the larger absolute value, then Spill / ROI /
Treffrate / "Modellen anslo".

Below: the selection-bias explanation, and the Utah window as a `tint` panel with a
3px `vermillion` left border — 14 bets, 1 hit, −1 165 kr, and the audit's conclusion
that roughly −280 kr is attributable to the bug and the rest is variance.

---

## Charts

Four chart types, all hand-drawn SVG. No chart library was used and none is needed —
these are paths built from the data, and a library would fight the hairline aesthetic.

**Hero curve.** `viewBox="0 0 1200 200"`, `preserveAspectRatio="none"`, stretched to
fill its flex cell. Area fill split at the zero line by two `clipPath`s — teal at 12%
opacity above, vermillion at 12% below — with the line in `ink` 1.6px and
`vector-effect: non-scaling-stroke` so the stroke stays hairline under the stretch.
Zero line is `dash`, 1px, `stroke-dasharray="3 4"`.

**Chart lab** (below the hero): two modes, **Verdikurve** and **Daglig P&L**, with
ALT / 60D / 20D ranges. **Default mode is Daglig P&L**, because the hero already shows
the equity curve and repeating it immediately below is dead space. Daily P&L is drawn
as a single path of rectangles per sign — one `barsPos`, one `barsNeg` — not as
individual `<rect>` elements.

Drawdown and cumulative-ROI modes were designed and then **deliberately cut**: with a
flat 100 kr stake there is no position sizing for drawdown to inform, and ROI at
+0,2 % renders as a flat line on zero. Do not reinstate them without a reason.

**Hover.** `onMouseMove` on the wrapper; index =
`round((clientX - rect.left) / rect.width * (n - 1))`, clamped. Renders a dashed
`ink` crosshair, a 9px round dot as an **HTML element** (an SVG circle turns
elliptical under `preserveAspectRatio="none"`), and a tooltip on `ink` ground with
date, value, and "3 spill · 1 traff". Clear on `onMouseLeave`.

**Axis labels are absolutely positioned HTML**, not SVG `<text>` — positioned by
percentage computed from the same geometry. This keeps the type crisp and lets it
inherit the font stack.

---

## Interaction states

- **Filled pills** (ranges, filters, toggles): active is `ink` ground with `paper`
  text; inactive is `paper` ground with `muted` text. The group sits on a `rule`
  ground with `padding: 1px` and `gap: 1px`, so the dividers are the ground showing
  through.
- **Underline tabs** (main nav, chart modes, mobile bottom nav): active is `ink` text
  with a 2px `ink` underline; inactive is `muted` with a transparent one.
- **Outline buttons:** `1px solid #0E4B47`, teal text, `padding: 13px 20px`, Mono
  10px `0.14em` uppercase. Hover fills teal with `paper` text. Secondary variant uses
  a `#C9BFA9` border and `body` text, hovering to `ink`.
- **Row hover:** `background: #EAE3D5`.
- **Focus:** `:focus-visible { outline: 2px solid #0E4B47; outline-offset: 2px; }` on
  every interactive element. Never leave the browser default.
- **Links:** `color: #0E4B47` with a `1px solid #B6C7C3` bottom border; hover moves
  both to `ink`.
- **Animation:** essentially none. One `rise` keyframe
  (`opacity 0 → 1`, `translateY(10px) → 0`, `0.3s ease`) on value-board rows. This
  design should not move.

---

## State

```
view          which of the seven screens is shown        → route, not state
chart         'netto' | 'dag'                            default 'dag'
range         'alt' | '60' | '20'                        chart lab window
hover         number | null                              chart lab hover index
hWin          '60' | '90' | 'alt'                        hero window, default '60'
hHover        number | null                              hero curve hover index
filt          'value' | 'alle'                           value board, default 'alle'
hStatus       'alle' | 'won' | 'lost'
hSel          'alle' | 'home' | 'away' | 'draw'
hSort         'dato' | 'ev' | 'netto'
home, away    team abbreviations                         Kampanalyse
oh, od, oa    odds numbers                               Kampanalyse
conf          'alle' | 'ost' | 'vest'                    Elo filter
mView         mobile bottom-nav screen                   → route under 768px
mSel          selected game index | null                 mobile detail
```

The seven views should be **real routes** (`/`, `/verdi`, `/kamp`, `/historikk`,
`/elo`, `/modell`, `/skygge`), not local state — the prototype uses state only
because it is a single file. Filter and window selections are fine as local state;
consider query params on Historikk so a filtered view can be linked.

The hero window (`hWin`) and the chart lab window (`range`) are intentionally
separate controls with separate state.

---

## Settings and environment

```
NEXT_PUBLIC_TALL_TERSKEL = 1000   # kr — show the all-time total above this
NEXT_PUBLIC_ROI_TERSKEL  = 5      # %  — show the ROI figure above this
```

`evTerskel` is a user-facing setting, range 5–45 %, default 20 %, step 1. Persist it
in `localStorage`. It must drive the SPILL/NEI tagging on the value board, the hero's
pick list and headline, and the mobile screens **from one source** — in the prototype
a single value feeds all of them, and any drift between screens is a bug. Note that
the Python side has its own threshold; if they disagree, the site will disagree with
`bet_history.csv`. Reading the same value from config on both sides is worth doing.

---

## Responsive

One app. Under **768px**:

- The masthead keeps the wordmark; the meta cluster (sesong, sist oppdatert, status)
  collapses to the timestamp alone.
- The seven-item nav becomes a **fixed bottom bar of four**: Oversikt · Verdi · Kamp ·
  Logg, with the analysis views reachable from within Oversikt. 1px `ink` top border,
  `padding: 15px 4px`, Mono 8.5px `0.10em` uppercase, active gets
  `box-shadow: inset 0 -2px 0 #17150F`.
- All two-column grids stack. The hero drops `100vh` and flows.
- The value board becomes a **tappable list** → a detail screen per game showing all
  three outcomes stacked, with a `←` back control in the header. The prototype's
  Mobil tab demonstrates this flow end to end.
- Tables become cards: Historikk rows show "Away hos Home" on one line with
  `dato · side · odds` beneath and the net right-aligned.
- Minimum tap target 44px.
- The design width is **1440px**; between 768px and 1440px the grids simply narrow.
  Watch the value-board outcome labels — they wrap below roughly 1200px and want a
  smaller `minmax()` first column.

---

## Assets

- **Fonts:** Instrument Serif and IBM Plex Sans/Mono, Google Fonts. Use
  `next/font/google` and self-host rather than the `<link>` the prototype uses.
- **Team logos:** placeholders in the prototype — a 30–40px square with
  `1px dashed #C9BFA9` and the abbreviation in Mono. Replace with NHL API logos;
  `teams.json` carries the numeric `id` per abbreviation. Keep the dashed square as
  the loading and error state, since it is already designed.
- **Icons:** none. The design uses typography and rules instead, and adding an icon set
  would weaken it. The only glyphs are `→`, `←`, `=` and `⇅`, set in the display serif.
- **Images:** none.

---

## Files in this bundle

| File | What it is |
| --- | --- |
| `NHL Modell.dc.html` | The full design. Open in a browser; all seven views and the mobile prototype are clickable. |
| `nhl-data.js` | Compiled real data the prototype reads: summary, 106-point timeseries, 202 bets, 32 Elo ratings, team form, matchup probabilities, team names. Reference for shapes and for checking your numbers. |
| `support.js` | Runtime for the prototype's component format. Not relevant to the rebuild. |
| `screenshots/` | Every screen as rendered (see index below). |

### Screenshot index

| File | Shows |
| --- | --- |
| `01-oversikt-hero.png` | Oversikt, above the fold — off-season state, empty pick column, hoverable curve |
| `02-oversikt-kurver.png` | Oversikt, scrolled — the chart lab on Daglig P&L, and "Siste avgjorte" |
| `03-verdi-tomtilstand.png` | Verdi i dag, real empty state — the state the app is in most of the year |
| `04-verdi-populert.png` | Verdi i dag, populated — game rows with three outcomes, bars and tags |
| `05-kampanalyse.png` | Kampanalyse — selectors, odds inputs, three probability columns, Elo and form |
| `06-historikk.png` | Historikk — filters and the 202-row table |
| `07-elo.png` | Elo — ranked list with diverging bars, parameters, Utah caveat |
| `08-modell-kalibrering.png` | Modell — the three headline numbers and the calibration plot |
| `09-skyggelogg.png` | Skyggelogg — real portfolio against shadow, and the Utah window |
| `10-mobil-oversikt.png` | Mobile prototype, Oversikt |
| `11-mobil-verdi-tom.png` | Mobile, Verdi — empty state |
| `12-mobil-verdi-liste.png` | Mobile, Verdi — tappable game list |
| `13-mobil-kampdetalj.png` | Mobile, game detail with all three outcomes and back control |
| `14-mobil-kampanalyse.png` | Mobile, Kampanalyse |
| `15-mobil-logg.png` | Mobile, Historikk with filters |

Note: screenshots are captured at the preview's viewport width, so the hero reads
shorter than it will at 1440px. The design width is 1440px — trust the README's
measurements over the captures.

Source files in the repo the design was built from are listed in `github.md` at the
project root, screen by screen.

---

## Suggested order of work

1. Add the missing data to the export (Elo copy, shadow JSON) — nothing renders without it.
2. Tokens, fonts, and the shell: masthead, nav, routing, the `nb-NO` formatters.
   Get the minus sign and the mono figures right once, centrally.
3. Oversikt with the real empty state, including the suppression rules.
4. Verdi i dag, then Historikk — the two highest-traffic screens after Oversikt.
5. Kampanalyse, Elo.
6. Modell and Skyggelogg.
7. Responsive pass and the mobile bottom nav.

---

## One caveat worth carrying over

The prototype's numbers are real, and they are not flattering: **+35 kr on 20 200 kr
staked, a 33,7 % hit rate, and a model that expected 85,5 hits where 68 happened.**
The design was built to state that plainly rather than dress it up — that is why the
big number hides below a threshold, why negative window results show as shape rather
than as a red figure, and why Modell and Skyggelogg exist at all. If a future change
makes the app feel more triumphant than the data warrants, it is going the wrong way.
