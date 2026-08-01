# Grunnmurens API

Alt de sju skjermene deler. Skriv ikke egne varianter av noe som står her —
poenget med grunnmuren er at skjermene ikke driver fra hverandre.

## Typografi og farge — globale klasser i `app/globals.css`

```
.t-kicker  .t-screen-title  .t-hero-headline  .t-hero-figure  .t-calib-figure
.t-team-name-list  .t-team-name-table  .t-body  .t-body-small  .t-row-label
.t-nav-item  .t-control-pill  .t-stat-label  .t-table-header  .t-table-figure
.t-stat-figure  .t-stat-figure-lg  .t-axis-label  .t-panel-heading  .t-wordmark
```

Farge: `.c-ink .c-body .c-muted .c-faint .c-teal .c-vermillion`

Hjelpere: `.laster` · `.sr-only` · `.shell` (innholdskolonne) · `.split` ·
`.rund` (eneste tillatte border-radius; `* { border-radius: 0 }` gjelder ellers)

`.t-panel-heading` er Mono 9,5px/0.14em muted — brukt av Elo, Kampanalyse og
Skyggelogg til panelfeltoverskrifter.

### `.split` — to-kolonners oppsett

Tar `--split-cols` og `--split-gutter` som inline custom properties og stabler
seg selv under 768px (`border-right` blir `border-bottom`). Bruk den framfor
egne media queries:

```tsx
<div className="split" style={{'--split-cols': 'minmax(300px,.62fr) minmax(0,1fr)'} as React.CSSProperties}>
```

## Data — `lib/use-data.ts`

```
useTeams() useMeta() useValueReport() usePortfolio() useMatchups() useElo() useShadow()
  → { data: T | null, loading: boolean, error: DataFeil | null, retry: () => void }

kombiner(...tilstander) → { loading, error, retry }
slåOppParing(matchups, home, away)   // kun HOME-AWAY; null ellers
```

Lasterne i `lib/data.ts` memoiserer per fil, så sju skjermer deler ett kall per
datasett. `retry()` invaliderer memoiseringen. `error.fil` mates rett inn i
`<ErrorState>`.

## Formatering — `lib/format.ts`

Alle tar `number | null | undefined` og gir `—` ved nullish/NaN.

```
nf(n,d=0)          sgnRaw(n,d=0)      kr(n,d=0)        krp(n,d=0)
krTabell(n,d=0)    krpTabell(n,d=0)   pc(n,d=1)        sgn(n,d=1)
pcRaw(n,d=1)       pcTall(n,d=1)      odds(n)          sannsynlighet(n)
ds(iso)            dl(iso)            dISO(iso)        klokke(iso)
sistOppdatert(iso)
```

Konstanter: `MANGLER` (—) · `NBSP` (U+00A0) · `MINUS` (U+2212) ·
`MND` (`jan`…`des`, delt med akseetikettene i `components/chart/geometry.ts`)

**Mellomrommet foran `%` og `kr` er U+00A0, ikke vanlig mellomrom.** Ikke
`.split(' ')` på formaterte strenger. Negative tall bruker U+2212.

Formatterne returnerer aldri klassenavn — farge er presentasjon og settes i
komponenten.

## `components/ui/` — importeres fra `@/components/ui`

| Komponent | Props |
| --- | --- |
| `PillGroup` | `{options, value, onChange, size?: 'sm'\|'md'\|'lg', label?, className?}` |
| `Tabs` | `{options, value, onChange, label?}` — understrekede faner |
| `Button` / `ButtonLink` | `{variant?: 'primary'\|'secondary'\|'compact', pad?, …}` · default `13px 20px` |
| `Tag` | `{variant: 'spill'\|'nei'\|'utelatt', children?}` |
| `TeamLogo` | `{abbr, size=38}` — stiplet plassholder som laste- og feiltilstand |
| `TeamCell` | `{abbr, navn?, navnKlasse='t-team-name-list', under?, size=38, gap=13}` |
| `Laster` | — |
| `ErrorState` | `{error?, fil?, melding?, onRetry?}` |
| `EmptyState` | `{headline, body?, actions?, size?: 'lg'\|'md'}` |
| `SectionHeading` | `{kicker, title?, right?, ingress?, as?, titleClassName?, rule?: 'strong'\|'light'\|'none'}` |
| `EvTerskelSlider` | `{label?, visAvvik?}` |

Bruk `as="h2"` på `SectionHeading` for underseksjoner, så overskriftsnivåene
stemmer.

## `components/chart/`

```
lagSkala(vals, HERO_VIEWBOX | LAB_VIEWBOX | SPARKLINE_VIEWBOX) → Skala{X, Y, zeroY, PL, pw, ph, …}

linjePath  areaPath  nullinjePath  rutenettPaths  crosshairPath
søylePaths → {pos, neg, bw}
venstreProsent  toppProsent  månedsTicks

hoverIndeks(clientX, rect, n, {bredde, PL, pw})
useHoverIndeks(n, hoverGeometri(s)) → {hi, hoverProps, nullstill}
```

`hoverIndeks` er **én** padding-parametrisert funksjon. Hero (PL=0, pw=1200)
reduserer den til den enkle formelen; kurvelabben (PL=58, PR=10) trenger
paddingen. Ikke skriv en egen.

React-deler: `<ChartWrap> <SplitArea d skala opacity> <ZeroLine skala stiplet?>
<ChartOverlay> <HoverDot left top synlig> <ChartTooltip left synlig dato verdi sub?>
<XAxis> <XAxisLabel pos> <YAxisLabel pos>`

Hover-prikken er HTML overalt — en SVG-sirkel blir elliptisk under
`preserveAspectRatio="none"`.

## Innstillinger — `lib/config.ts`

```
useEvTerskel() → { evTerskel, setEvTerskel, pipelineTerskel, avviker, tilbakestill }
```

**Dette er eneste lovlige kilde til EV-terskelen.** Provideren står i
`app/layout.tsx`. Leser du den fra noe annet sted, driver skjermene fra
hverandre, og det er en bug.

Samme fil: `TALL_TERSKEL` (1000) · `ROI_TERSKEL` (5) · `FLAT_INNSATS` ·
`avvikerFraPipeline()`

## Spill-logikk — `lib/spill.ts`

Delt av Oversikt, Verdi og Kampanalyse. Skriv ikke egne kopier.

```
erTall(n)                             evAv(modell, odds)
evForUtfall(value, modell, odds)      // value_* når det finnes, ellers formelen
markedAv(implisitt, odds)             overOddstak(odds, maxOdds)   // odds >= max_odds
utelattGrunn(erUavgjort, odds, maxOdds) → 'uavgjort' | 'oddstak' | null
utelattTekst(grunn)                   tagg(ev, evTerskel, grunn) → TagVariant
tid(bet)                              nyesteFørst(a, b)   // kronologi, delt

evKlasse(ev, evTerskel)               stolpeBredde(p)
navnFor(abbr, fallback)               kampTekst(bet)
```

`meta.json:max_odds` er en del av spill-utvelgelsen, ikke bare EV-terskelen:
pipelinen krever `odds < max_odds` (`NHL/bet_tracker.py`). `byggKamper`,
`byggKamp`, `byggAnalyse` og `finnSpill` tar den som siste argument.

`tagg()` avgjør i denne rekkefølgen, og rekkefølgen betyr noe: OT/SO er alltid
`utelatt`; EV under terskel er `nei`; først deretter kan oddstaket gi `utelatt`.
Et utfall som uansett ikke kvalifiserer skal svare «nei», ikke «kunne ikke» —
`utelatt` er reservert for utfall som ellers ville blitt spilt.

Merk at `max_odds` bare lukker én kilde til avvik mot `bet_history.csv`.
`_choose_best_per_day()` tar i tillegg høyst ett spill per dag, bare
`best_value`-utfallet, og bare når alle tre oddsene finnes — siten viser altså
fortsatt flere SPILL enn loggen får.

`lib/utah.ts` eier Utah-datavinduet (`utahVindu`, `UTAH_VINDU_TIL`). Både Elo og
Skyggelogg leser det; ingen av dem skal importere fra den andres mappe.

`components/kamp/beregn.ts` har `evAvHåndskrevet`/`markedAvHåndskrevet` som
bevisst avviker (odds ≤ 1 gir −1/0 fordi feltene er frie tekstfelt), og
`components/skygge/beregn.ts` har en `stolpeBredde` med annen semantikk (felles
nevner mellom to paneler). Begge skal stå.

## Lag — `lib/teams.ts`

```
LAG  ALLE_LAG  lagNavn  lagEtikett  konferanse  lagId  logoUrl
sorterAbbr  sorterPåLag  kollator        // Intl.Collator('nb')
```

## Analyse — `lib/analysis.ts`

Ferdig og verifisert mot `docs/blalinja/stake_truth.json` (330 sjekker).
**Ikke endre den.** Se agentrapporten i git-historikken for full
signaturliste; hovedinngangen er `analyze(bets, options)`.

## Kjente løse tråder

- `--header-h: 99px` er regnet ut av boksmodellen (masthead 65 + nav 33 + 1),
  ikke handoffens omtrentlige 108px. **Ikke hardkod 108** noe sted — bruk
  `var(--header-h)`. Verdien er ikke browserverifisert.
- `logoUrl` bruker `assets.nhle.com/logos/nhl/svg/{ABBR}_light.svg`. Mønsteret
  er **ikke** verifisert mot verten — proxyen svarer 403 på CONNECT. `TeamLogo`
  degraderer til den stiplede plassholderen ved lastefeil, så feil mønster er
  ikke fatalt. Mønsteret ligger ett sted: `LOGO_BASE`.
- `app/favicon.ico` er fortsatt Next-logoen.
