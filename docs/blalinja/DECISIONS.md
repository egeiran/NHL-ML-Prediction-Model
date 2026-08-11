# Blålinja — bindende beslutninger for alle byggeagenter

Les dette FØRST. Det overstyrer alt annet ved konflikt, bortsett fra der det
eksplisitt peker videre til handoffen.

## Kilder

| Kilde | Rolle |
| --- | --- |
| `docs/design_handoff_blalinja_frontend/README.md` | Designfasit: tokens, typografi, layout, skjermspesifikasjoner. Autoritativ på **utseende**. |
| `docs/design_handoff_blalinja_frontend/NHL Modell.dc.html` | Fungerende prototype. Les for eksakte verdier og SVG-geometri. **Ikke kopier koden** — den er i et proprietært komponentformat. |
| `docs/design_handoff_blalinja_frontend/screenshots/*.png` | Rendret fasit per skjerm. |
| [GitHub issue #7](https://github.com/egeiran/NHL-ML-Prediction-Model/issues/7) | Autoritativ på **kalibrering, EV/odds-bøtter, innsatssimulator og matematikk**. |
| `docs/blalinja/stake_truth.json` | Fasit-tall dumpet fra `NHL/analyze_stake_sizing.py`. Frontend MÅ reprodusere disse. Nøkkel `all` = 182 spill, `no_draw` = 156. Regenereres når `bet_history.csv` endres. |
| `PROBLEMS.md` | Åpne modellfunn som vises på Modell-skjermen. |

## Beslutninger tatt med eier

1. **Ingen database, ingen hostet API.** Next.js `output: 'export'`, statisk på
   Vercel. All data leses fra `public/data/*.json` med `fetch`. Ingen route
   handlers, ingen server actions, ingen `fs` i komponenter.
2. **Full erstatning.** Dagens `app/page.tsx` og alt i `components/` slettes.
   Ingen bakoverkompatibilitet, ingen `/gammel`-rute.
3. **Sju ekte ruter:** `/`, `/verdi`, `/kamp`, `/historikk`, `/elo`, `/modell`,
   `/skygge`. Ikke lokal state for navigasjon.
4. **Kvantilbøtter, ikke faste bøtter**, i all kalibrering. Issue #7 vinner over
   handoffens `bins = [[.25,.32], ...]`. Begrunnelse: utvalget er skjevt, faste
   bøtter gir n=4 i enkelte bøtter.
5. **Utah/ARI aliases i eksport-steget**, ikke i frontend. `public/data/elo.json`
   skrives med visningsforkortelser (UTA). Frontend skal IKKE ha aliaslogikk.
   Elo-skjermen beholder likevel forklaringsnotatet om Utah-vinduet.
6. **EV-terskel**: Python er sannheten (`NHL_VALUE_MIN`, default `0.15`).
   Eksporteres til `meta.json` som `value_min`. Frontend bruker den som
   *default* for brukerinnstillingen, som er en slider 5–45 %, steg 1,
   persistert i `localStorage`. Når brukerens verdi avviker fra pipelinens skal
   UI si fra at siten da viser noe annet enn `bet_history.csv`.
7. **Én PR, logiske commits** i handoffens anbefalte rekkefølge.

## Tekniske rammer — ufravikelige

- **Ingen nye npm-avhengigheter.** Ikke recharts, ikke d3, ikke framer-motion,
  ikke clsx, ikke date-fns. Alle grafer er håndskrevet inline SVG.
  `lucide-react` skal FJERNES fra `package.json` — designet har ingen ikoner.
- **Tailwind v4 er allerede satt opp** (`@import "tailwindcss"` i globals.css,
  ingen tailwind.config-fil). Designet er hårfin-linje- og typografidrevet;
  bruk **CSS Modules** (`Foo.module.css`) for alt som blir stygt som
  utility-suppe. Det er eksplisitt tillatt av handoffen. Tokens ligger som CSS
  custom properties i `globals.css`.
- **Fonter via `next/font/google`**, selvhostet: Instrument Serif (400, 400
  italic), IBM Plex Sans (400, 500, 600), IBM Plex Mono (400, 500). Ikke
  `<link>` til Google Fonts.
- **TypeScript strict.** Ingen `any`, ingen `@ts-ignore`, ingen
  `eslint-disable` uten begrunnelse i kommentar.
- **`npm run lint` og `npm run build` må passere.** Verifiser før du melder
  ferdig.
- **Ingen `border-radius`. Ingen `box-shadow`** (unntatt `inset 0 -2px 0` som
  nav-understrek). Alle hjørner er 0.
- **`:focus-visible { outline: 2px solid #0E4B47; outline-offset: 2px }`** på
  alt interaktivt. Aldri nettleserens default fjernet uten erstatning.
- Minimum tap-target 44px på mobil.

## Filsoneiering — IKKE rør filer utenfor din sone

Flere agenter jobber samtidig. Å skrive i en annen agents fil ødelegger arbeidet
deres. Hvis du trenger en endring i en delt fil: **ikke gjør den** — rapporter
den i sluttrapporten din, så tar orkestratoren den.

Delte filer (kun grunnmur-agenten eier disse):
`app/layout.tsx`, `app/globals.css`, `app/tokens.css`, `lib/format.ts`,
`lib/data.ts`, `lib/config.ts`, `types/index.ts`, `components/shell/*`,
`components/chart/*`, `next.config.ts`, `package.json`

## Tallformatering — nb-NO, sentralt i `lib/format.ts`

- `Intl.NumberFormat('nb-NO')` overalt. Mellomrom som tusenskille, komma som
  desimalskille.
- **Negative tall bruker ekte minustegn U+2212 (−), aldri bindestrek.**
  `Intl` gir allerede U+2212 for `nb-NO`; ikke bygg tall med strengkonkatenering
  som innfører `-`.
- Fortegnsatte verdier alltid eksplisitt fortegnet: `+35 kr`, `−575 kr`,
  `+21,8 %`.
- Mellomrom foran `%`: `33,7 %`.
- Penger får ` kr` som suffiks i brødtekst; i tabellkolonner ligger enheten i
  kolonneoverskriften.
- **Hvert eneste tall settes i IBM Plex Mono.** Unntak: bevisste
  display-figurer i Instrument Serif (hero-total, EV på spillkort, de tre
  kalibreringstallene, sannsynlighetene i Kampanalyse, Skyggelogg-tallene).

## Utledede formler — implementer ordrett

```
implied_prob      = 1 / odds
EV                = model_prob * odds - 1          // IKKE model_prob - implied_prob
is_value          = EV >= evTerskel                // evTerskel lagres som brøk
roi               = profit / total_staked

// portfolio.timeseries[].value er KUMULATIV NETTOGEVINST, ikke saldo
daily_pnl[i]      = value[i] - value[i-1]          // value[-1] behandles som 0
window_net        = value[siste] - value[indeks før vindusstart]
cumulative_staked = løpende sum av timeseries[].invested

expected_hits_model  = sum(bets[].model_prob)      // = 85,5 over de 202 spillene
expected_hits_market = sum(bets[].implied_prob)    // = 66,4
actual_hits          = antall bets[].status == "won"   // = 68
```

Referansetall å sjekke mot (hele historikken, 202 spill):
`total_bets 202 · total_staked 20 200 · settled_return 20 235 · profit +35 kr ·
roi 0,002 · win_rate 0,337 · snittodds 3,14 · hjemme 90, borte 86, uavgjort 26 ·
uavgjort-spill −640 kr, ikke-uavgjort +675 kr.`

## Datatilstand du må håndtere

- `value-report.json` er **tom array** akkurat nå (sesongpause). Den ekte
  tomtilstanden er hovedtilstanden — bygg den godt, ikke som et ettertanke.
- `bet_shadow.csv` er **tom** (0 rader). `shadow.json` blir altså `[]`.
  Skyggelogg-skjermen må falle tilbake på `selection === 'draw'`-radene i
  `portfolio.json` når `shadow.json` er tom, og si fra i UI hvilken kilde som
  brukes.
- `portfolio.json` har topp-nivå `{timeseries, summary, bets}`. Ingen
  `season`/`seasons`/`all_time` — ikke anta at de finnes.
- `matchups.json` har 992 nøkler `"HOME-AWAY"` og 32 lag med `last_5` + `stats`.
- `bets[]` har `created_at`/`updated_at` i tillegg til feltene i `BetEntry`.
- Alle spill har `stake = 100`. Derfor ingen innsatskolonne i Historikk.

## Undertrykkingsregler på Oversikt — ikke «forbedre» dem

Designet er bygget for å ikke smigre dataen. Dette er bevisst:

- Vis `+35 kr siden start` **kun** når `|profit| >= tallTerskel` (1000 kr).
- Vis ROI-figuren **kun** når `|roi * 100| >= roiTerskel` (5 %).
- **Skjul vindusnettoen når den er negativ.** Etiketten og kurven blir stående;
  det røde tallet gjør ikke. Formen bærer den dårlige nyheten.

`NEXT_PUBLIC_TALL_TERSKEL=1000`, `NEXT_PUBLIC_ROI_TERSKEL=5`.

## Tone

Norsk gjennomgående. Appen skal aldri føles mer triumferende enn dataen
forsvarer. Hvis en endring gjør den det, går den feil vei.
