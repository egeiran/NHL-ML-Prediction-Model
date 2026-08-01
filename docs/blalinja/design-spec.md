# Blålinja — implementerbar designspesifikasjon

Denne fila står på egne ben. Du skal ikke måtte åpne prototypen eller handoff-README-en
for å bygge en skjerm. Alle tall er hentet fra den fungerende prototypen
(`NHL Modell.dc.html`) og verifisert mot skjermbildene.

Rangordning ved konflikt: `docs/blalinja/DECISIONS.md` → denne fila → handoff-README.
Kjente uenigheter mellom README og prototype er samlet i **§H**.

Enheter: alle piksler er CSS-piksler. Alle rammer er `1px solid` der ikke annet står.
Ingen `border-radius` unntatt de eksplisitt navngitte prikkene (§D). Ingen `box-shadow`
unntatt `inset 0 -2px 0` på mobil bunnnav.

---

## A. Tokens

### A.1 Farger — lim inn i `app/tokens.css`

```css
:root {
  /* grunnflater */
  --paper:        #F2EDE4;   /* sideflate, knappeflate, tooltip-tekst */
  --ink:          #17150F;   /* primærtekst, sterke linjer, aktiv pillefyll */
  --body:         #4A453B;   /* brødtekst */
  --muted:        #7A7364;   /* etiketter, kickers, sekundære tall */
  --faint:        #9A9284;   /* akseetiketter, tidsstempler, tertiær tekst */
  --fainter:      #B0A794;   /* meta-krom */

  /* linjer */
  --rule-strong:  #17150F;   /* seksjonstopplinjer, headerkant */
  --rule:         #D8CFBC;   /* kolonneskiller, kontrollbunn */
  --rule-light:   #E4DCCB;   /* radskillere, barspor */
  --tint:         #EAE3D5;   /* radhover, innfelte paneler, callout-flate */
  --tint-rule:    #DCD3C1;   /* linjer inne i et tintet panel */
  --dash:         #C9BFA9;   /* logo-placeholder, nullinje, diagonal, skjemaramme */
  --chart-grid:   #E0D7C5;   /* KUN rutenettet i kurvelabben */

  /* semantikk — aldri dekorativt */
  --teal:         #0E4B47;   /* gevinst, modell, value, SPILL, fokusring */
  --vermillion:   #B23A1B;   /* tap, risiko, advarsel */

  /* tooltip */
  --tooltip-bg:   #17150F;
  --tooltip-fg:   #F2EDE4;
  --tooltip-muted:#A8A091;

  /* diverse */
  --selection:      #DCE5E2;
  --link-underline: #B6C7C3;

  /* opasiteter på grafflater */
  --area-op-hero: .12;
  --area-op-lab:  .13;
  --bar-op:       .85;
}
```

Semantikken er streng: **teal = gevinst / modell / value / SPILL. Vermillion = tap og
risiko.** Ingen av dem brukes dekorativt.

### A.2 Sidetekstur

Legges på det ytterste wrapper-elementet, ikke på `body`:

```css
.app-ground {
  min-height: 100vh;
  background-color: var(--paper);
  background-image: radial-gradient(rgba(23, 21, 15, .045) 1px, transparent 1px);
  background-size: 5px 5px;
}
```

### A.3 Globalt (fra prototypens `<style>`)

```css
* { box-sizing: border-box }
html, body { margin: 0; padding: 0 }
body {
  background: var(--paper); color: var(--ink);
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--teal); text-decoration: none; border-bottom: 1px solid var(--link-underline) }
a:hover { color: var(--ink); border-bottom-color: var(--ink) }
button { font-family: inherit; cursor: pointer; background: none; border: none; padding: 0; color: inherit }
select, input { font-family: inherit; color: inherit }
button:focus-visible, select:focus-visible, input:focus-visible,
a:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }
::selection { background: var(--selection) }
::-webkit-scrollbar { width: 10px; height: 10px }
::-webkit-scrollbar-thumb { background: var(--rule) }
::-webkit-scrollbar-track { background: var(--tint) }
@keyframes rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
```

### A.4 Typografi-skala — navngitte klasser

Tre familier, selvhostet via `next/font/google`:
Instrument Serif (400, 400 italic) · IBM Plex Sans (400, 500, 600) · IBM Plex Mono (400, 500).

| Klasse | font-family | vekt | størrelse/line-height | letter-spacing | transform | farge |
| --- | --- | --- | --- | --- | --- | --- |
| `.kicker` | Mono | 500 | 10px / 1 | `.18em` | uppercase | `--muted` |
| `.screen-title` | Serif | 400 | 38px / 1.05 | normal | — | `--ink` |
| `.hero-headline` | Serif | 400 | `clamp(38px,4.4vw,62px)` / 1.05 | `-.02em` | — | `--ink` |
| `.hero-figure` | Serif | 400 | 52px / 0.85 | `-.03em` | — | teal/vermillion |
| `.calib-figure` | Serif | 400 | `clamp(56px,6vw,82px)` / 0.9 | normal | — | settes per celle |
| `.team-name-list` | Serif | 400 | 22px / 1.12 | normal | — | `--ink` |
| `.team-name-table` | Serif | 400 | 15px / 1.2 | normal | — | `--ink` |
| `.body` | Sans | 400 | 15px / 1.7 | normal | — | `--body` (+ `text-wrap: pretty`) |
| `.body-small` | Sans | 400 | 13px / 1.6 | normal | — | `--body` |
| `.row-label` | Sans | 400 | 14.5px / 1.25 | normal | — | `--ink` |
| `.nav-item` | Mono | 500 | 10px / 1 | `.15em` | uppercase | `--muted` → `--ink` aktiv |
| `.control-pill` | Mono | 500 | 9.5px / 1 | `.10em` | uppercase | `--muted` / `--paper` aktiv |
| `.stat-label` | Mono | 500 | 9px / 1 | `.14em` | uppercase | `--muted` |
| `.table-header` | Mono | 500 | 8.5px / 1.3 | `.14em` | uppercase | `--muted` |
| `.table-figure` | Mono | 400 | 12.5px / 1.3 | normal | — | `--ink` |
| `.stat-figure` | Mono | 400 | 19px / 1 | normal | — | `--ink` |
| `.stat-figure--lg` | Mono | 400 | 24px / 1 | normal | — | `--ink` |
| `.axis-label` | Mono | 400 | 10px / 1 | normal | — | `--faint` |

Eksempel på implementasjon (bruk `font`-shorthand, det er slik prototypen er skrevet):

```css
.kicker { font: 500 10px/1 'IBM Plex Mono', monospace; letter-spacing: .18em;
          text-transform: uppercase; color: var(--muted) }
.hero-headline { font: 400 clamp(38px,4.4vw,62px)/1.05 'Instrument Serif', serif;
                 letter-spacing: -.02em }
```

### A.5 Øvrige faste typo-verdier (brukes ordrett, får ikke egen klasse i tabellen over)

| Bruk | Spesifikasjon |
| --- | --- |
| Ordmerke «Blålinja» | Serif 400 · 34px/0.9 · `-.015em` |
| Masthead-undertittel | Mono 400 · 10px/1.5 · `.16em` · uppercase · `--muted` |
| Masthead metaetikett | Mono 500 · 9px/1 · `.16em` · uppercase · `--muted` |
| Masthead metaverdi | Mono 400 · 13px/1 |
| Seksjonstittel (kurvelab) | Serif 400 · 30px/1.1 |
| Kampanalyse-tittel | Serif 400 · 34px/1.1 |
| Panelheading (Elo, Kamp, Skygge) | Mono 500 · 9.5px/1 · `.14em` · uppercase · `--muted` |
| Vindusnetto (hero) | Mono 400 · 30px/1 · teal/vermillion |
| EV på spillkort | Serif 400 · 32px/0.9 · `--teal` |
| Sannsynlighet (Kampanalyse) | Serif 400 · `clamp(44px,5vw,66px)`/0.9 |
| Skyggelogg-figur | Serif 400 · `clamp(48px,5.4vw,72px)`/0.9 |
| Tomtilstand-headline Verdi | Serif 400 · `clamp(46px,5.6vw,80px)`/0.95 · `-.02em` |
| Tomtilstand-linje hero | Serif 400 · `clamp(24px,2.4vw,32px)`/1.2 · `--body` |
| Tagg (SPILL/NEI/UTELATT) | Mono 500 · 8.5px/1.5 · `.14em` · uppercase |
| Tabellcelle med kampnavn | Sans 400 · 13.5px/1.3 |
| Skjemaetikett | Mono 500 · 9.5px/1 · `.14em` · uppercase · `--muted` |
| Skjemafelt (select) | Sans 400 · 15px/1.2 |
| Skjemafelt (number) | Mono 400 · 14px/1, høyrestilt |
| Footer | Mono 400 · 11px/1.7 |

### A.6 Tallformat (repetert her fordi det brukes i hver eneste celle)

`Intl.NumberFormat('nb-NO')`. Negativt fortegn er alltid U+2212 `−`. Fortegnsatte
verdier alltid eksplisitt fortegnet. Mellomrom foran `%`.

| Hjelper | Utfall |
| --- | --- |
| `nf(n, d)` | `20 200`, `1 578`, `0,70` — `Intl` med `d` desimaler, alle `-` byttet til `−` |
| `kr(n, d=0)` | `+35 kr`, `−640 kr` |
| `krp(n)` | `20 200 kr` (uten fortegn) |
| `pc(n, d=1)` | `33,7 %` (n er brøk) |
| `sgn(n, d=1)` | `+21,8 %`, `−3,2 %` (n er brøk) |
| `sgnRaw(n, d=0)` | `+80`, `−34` |
| `ds(iso)` | `10. jun` |
| `dl(iso)` | `10. jun 2026` |

Månedsforkortelser: `jan feb mar apr mai jun jul aug sep okt nov des`.

---

## B. Layout-primitiver

### B.1 Innholdskolonne

```css
.shell { max-width: 1440px; margin: 0 auto; padding: 0 48px }
main   { max-width: 1440px; margin: 0 auto; padding: 0 48px 96px }
```

Designbredden er 1440px. Mellom 768px og 1440px smalner rutenettene bare inn.

### B.2 Header — masthead + nav

```
header  position:sticky; top:0; z-index:30; background:paper; border-bottom:1px solid ink
├─ .masthead  max-width:1440; margin:0 auto; padding:18px 48px 14px;
│             display:flex; align-items:flex-end; justify-content:space-between;
│             gap:32px; flex-wrap:wrap
│  ├─ venstre: display:flex; align-items:flex-end; gap:16px
│  │  ├─ ordmerke «Blålinja»
│  │  └─ undertittel «NHL-modell<br>Porteføljerapport»  (padding-bottom:3px)
│  └─ høyre:   display:flex; gap:36px; align-items:flex-end
│     └─ 3 × blokk (flex column, gap:3px): etikett + verdi
│        Sesong · 2025/26 | Sist oppdatert · {meta.generated_at[0:10]} | Status · Sesongpause
└─ nav   max-width:1440; margin:0 auto; padding:0 48px;
         display:flex; gap:26px; overflow-x:auto; border-top:1px solid var(--rule)
   └─ 7 knapper, padding:11px 0 9px, .nav-item, border-bottom:2px solid transparent
      + skille: <span style="width:1px;background:var(--rule);margin:9px 0">
```

Navrekkefølge: **Oversikt · Verdi i dag · Kampanalyse** — skille — **Historikk · Elo ·
Modell · Skyggelogg**. Ruter i samme rekkefølge: `/`, `/verdi`, `/kamp`, `/historikk`,
`/elo`, `/modell`, `/skygge`.

Aktiv: `color: var(--ink); border-bottom-color: var(--ink)`.
Inaktiv: `color: var(--muted); border-bottom-color: transparent`.

Samlet headerhøyde er **~108px**; bruk verdien ordrett i `calc(100vh - 108px)` på hero.
(Boksmodellen gir målt ~95px — se §H.)

### B.3 Footer

```
footer  border-top:1px solid ink
└─ div  max-width:1440; margin:0 auto; padding:26px 48px 44px;
        display:flex; justify-content:space-between; gap:32px; flex-wrap:wrap
   ├─ Mono 11px/1.7 muted, white-space:nowrap
   │  «Random Forest + Elo · 29 606 kamper · Elo t.o.m. 2026-04-16»
   └─ Mono 11px/1.7 faint  «Blålinja · arbeidsnavn»
```

### B.4 Linjehierarki

| Nivå | Farge | Brukes til |
| --- | --- | --- |
| `rule-strong` `#17150F` | 1px | headerkant, seksjonstopp/-bunn, tabellhode over datarader, hero-bunn |
| `rule` `#D8CFBC` | 1px | kolonneskille i to-kolonners splitt, navtopp, filterrad-bunn, panelheading-bunn |
| `rule-light` `#E4DCCB` | 1px | radskillere i lister og tabeller, celleskiller i statraden |
| `tint-rule` `#DCD3C1` | 1px | radskillere inne i et `--tint`-panel (kun Skyggelogg høyre) |

Seksjoner skilles med linjer, aldri med kort, skygger eller runde hjørner. Søskengrupper
bruker `gap`, aldri marginer mellom elementer.

### B.5 To-kolonners splitt

Mønsteret er alltid det samme:

```css
.split { display: grid; gap: 0; grid-template-columns: /* per skjerm */ }
.split > :first-child { border-right: 1px solid var(--rule); padding-right: <gutter> }
.split > :last-child  { padding-left: <gutter> }
```

Venstre kolonne bærer skillelinja som `border-right`; det er aldri et eget element og
aldri `gap`. Gutteret er alltid samme tall på begge sider (36/40/44/48 px).

### B.6 Alle `grid-template-columns` per skjerm

| Skjerm | Sted | `grid-template-columns` | gap | gutter |
| --- | --- | --- | --- | --- |
| Oversikt | herokropp | `minmax(300px,.62fr) minmax(0,1fr)` | 0 | 44px |
| Oversikt | statrad under kurve | `repeat(4, minmax(0,1fr))` | 0 | — |
| Oversikt | «Siste avgjorte»-rad | `62px minmax(0,1fr) 56px 66px 76px` | 14px | — |
| Verdi | tomtilstand | `minmax(0,1fr) minmax(0,1fr)` | 0 | 48px |
| Verdi | kamprad | `minmax(280px,.85fr) minmax(0,2fr)` | 0 | 40px |
| Verdi | utfallstabell (hode + rader) | `minmax(0,1fr) 74px 74px 82px 92px` | 14px | — |
| Kampanalyse | hovedsplitt | `minmax(300px,.8fr) minmax(0,1.6fr)` | 0 | 44px |
| Kampanalyse | tre utfallskolonner | `repeat(3, minmax(0,1fr))` | 0 | 22px |
| Kampanalyse | Elo + Siste fem | `minmax(0,1fr) minmax(0,1fr)` | 44px | — |
| Historikk | tabell (hode + rader) | `76px minmax(0,1.5fr) 66px 60px 72px 72px 76px 80px 92px` | 12px | — |
| Elo | hovedsplitt | `minmax(0,1fr) 280px` | 0 | 44px / 36px |
| Elo | tabell (hode + rader) | `32px 42px minmax(0,1fr) 54px minmax(120px,1.1fr) 64px` | 14px | — |
| Modell | tre tall | `repeat(3, minmax(0,1fr))` | 0 | 32px |
| Modell | hovedsplitt | `minmax(340px,.8fr) minmax(0,1.2fr)` | 0 | 44px |
| Modell | bøttetabell | `minmax(0,1fr) 54px 78px 78px 78px` | 14px | — |
| Modell | utfallstypetabell | `minmax(0,1fr) 46px 70px 70px 56px 84px` | 12px | — |
| Modell | «Neste steg»-punkt | `30px minmax(0,1fr)` | 16px | — |
| Skyggelogg | panelsplitt | `minmax(0,1fr) minmax(0,1fr)` | 0 | 40px |
| Skyggelogg | forklaringssplitt | `minmax(0,1.2fr) minmax(0,.8fr)` | 0 | 44px |
| Mobil | bunnnav | `repeat(4, 1fr)` | 0 | — |

---

## C. Skjermene

Fellesmønster for skjermhode (alle unntatt Oversikt):

```
section  padding:48px 0 14px; border-bottom:1px solid var(--rule-strong);
         display:flex; align-items:flex-end; justify-content:space-between;
         gap:32px; flex-wrap:wrap        ← flex kun når hodet har en kontroll til høyre
├─ .kicker
└─ .screen-title  (margin-top:10px)
```

### Fellestilstander

| Tilstand | Utseende |
| --- | --- |
| **Lastende** | Skjermens ramme (kicker, tittel, linjer, tabellhoder) rendres. Der første figur skal stå settes `<span class="laster">Laster …</span>`: Mono 400 11px/1, `.12em`, uppercase, `--faint`. Ingen spinner, ingen skjelettanimasjon — designet skal ikke bevege seg. |
| **Feil** | Panel: `padding:18px 20px; background:var(--tint); border-left:3px solid var(--vermillion)`. Etikett `.stat-label` i `--vermillion`: «Kunne ikke laste data». Brødtekst `.body-small`: «{filnavn} svarte ikke. Tallene under kan være utdaterte.» Deretter sekundær outline-knapp «Prøv igjen». |
| **Tom** | Spesifisert per skjerm nedenfor. Tom er hovedtilstanden på Verdi og Skyggelogg — bygg den først. |

---

### C.1 Oversikt (`/`)

```
main
├─ section.hero  min-height:calc(100vh - 108px); flex column; border-bottom:1px ink; padding:36px 0 0
│  ├─ .hero-top  flex:0 0 auto; flex; align-items:flex-start; space-between; gap:32px; wrap; padding-bottom:30px
│  │  └─ div max-width:60ch → .kicker + .hero-headline (margin-top:16px)
│  └─ .hero-body flex:1 1 auto; min-height:0; grid minmax(300px,.62fr) minmax(0,1fr); gap:0; border-top:1px ink
│     ├─ .picks  flex column; padding:22px 44px 24px 0; border-right:1px rule; min-height:0
│     │  ├─ .kicker «Dagens spill» (flex:0 0 auto)
│     │  ├─ [populert] div flex:1 1 auto; overflow-y:auto; min-height:0; margin-top:6px
│     │  │  └─ ≤3 × .pick-row  padding:20px 0; border-bottom:1px rule-light
│     │  │     ├─ flex space-between/baseline gap:14px → tid Mono 400 11px/1 .1em faint («01:00»)
│     │  │     │                                       | EV Serif 400 32px/0.9 teal («+21,8 %»)
│     │  │     ├─ flex align-center gap:13px margin-top:14px → logo 38×38 (flex:0 0 38px)
│     │  │     │  + .team-name-list + undertekst margin-top:4px Mono 400 10px/1.3 .1em uppercase faint
│     │  │     └─ flex gap:24px margin-top:14px → «modell 49,7 %» · «odds 2,45» Mono 400 11px/1 muted
│     │  └─ [tom] div flex:1 1 auto; flex column; justify-content:center; min-height:0
│     │     ├─ Serif clamp(24px,2.4vw,32px)/1.2; max-width:18ch; color:body
│     │     └─ .actions margin-top:26px; flex; gap:12px; wrap
│     └─ .curve  flex column; padding:22px 0 0 44px; min-height:0
│        ├─ hoderad flex:0 0 auto; flex; align-items:flex-end; space-between; gap:20px; wrap
│        │  → [.kicker {winLabel} + vindusnetto Mono 30px/1 (flex baseline gap:16px)] | pillegruppe 60D/90D/ALT
│        ├─ .chart-wrap flex:1 1 auto; min-height:140px; position:relative; margin-top:16px
│        ├─ .stat-row flex:0 0 auto; grid repeat(4,minmax(0,1fr)); border-top:1px rule; margin-top:14px
│        │  celle 1 padding:15px 16px 20px 0 · celle 2–3 15px 16px · celle 4 15px 0 15px 16px
│        │  celle 2–4 border-left:1px rule-light; innhold .stat-label + .stat-figure (margin-top:9px)
│        └─ [showBig] flex:0 0 auto; padding:18px 0 22px; flex baseline gap:14px
│           → .hero-figure «+35» + Serif 22px/1 muted «kr siden start»
├─ section.lab     padding:44px 0 0
│  ├─ hoderad flex align-items:flex-end space-between gap:32px wrap; border-bottom:1px ink; padding-bottom:12px
│  │  → [.kicker «Kurver» + Serif 30px/1.1 {tittel} margin-top:8px]
│  │  | [flex gap:22px wrap: modusfaner (flex gap:18px) + pillegruppe ALT/60D/20D]
│  └─ div border-bottom:1px rule > div padding:8px 0 0
│     ├─ .chart-wrap position:relative        (SVG + absolutt HTML, §D.2)
│     └─ div height:22px                      ← plass til x-etikettene
└─ section.recent  padding-top:44px
   ├─ .kicker «Siste avgjorte»
   └─ div margin-top:18px → 9 rader (bets.slice(-9).reverse())
      grid 62px minmax(0,1fr) 56px 66px 76px; gap:14px; align-items:baseline; padding:11px 0; border-bottom:1px rule-light
      1 dato Mono 400 11px/1 faint «10. jun» · 2 kamp Sans 400 13.5px/1.2 «Away hos Home»
      3 side Mono 500 9.5px/1 .1em uppercase muted «Hjem|Borte|OT/SO»
      4 odds Mono 400 12px/1 muted høyre · 5 netto Mono 400 13px/1 høyre, farget
```

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker (dagsetikett) | `Sesongpause` · ellers datoen, f.eks. `14. mars 2026` |
| Headline, ingen kamper | `Ingen kamper i dag` |
| Headline, kamper men ingen over terskel | `Ingen spill over terskel` |
| Headline, ett spill | `Ett spill over terskel` |
| Headline, flere | `3 spill over terskel` |
| Kicker venstre kolonne | `Dagens spill` |
| Tomlinje venstre kolonne | `Neste sesongstart i oktober. Elo oppdateres gjennom pausen.` |
| Knapper i tomtilstand | `Analyser en kamp` (primær) · `Se hele dagen` (sekundær) |
| Vinduetikett | `Siste 60 dager` · `Siste 90 dager` · `Hele historikken` |
| Statetiketter | `Spill i perioden` · `Treffrate` · `Beste dag` · `Svakeste dag` |
| Stort tall-suffiks | `kr siden start` |
| Kurvelab kicker | `Kurver` |
| Kurvelab titler | `Netto resultat over tid` (Verdikurve) · `Resultat per kampdag` (Daglig P&L) |
| Modusfaner | `Verdikurve` · `Daglig P&L` |
| Rekkeviddepiller | `ALT` · `60D` · `20D` (hero: `60D` · `90D` · `ALT`) |
| Siste seksjon | `Siste avgjorte` |
| Tooltip undertekst | `3 spill · 1 traff` |

**Undertrykkingsregler (skal ikke «forbedres»)**

- `+35 kr siden start` vises kun når `|profit| >= 1000`.
- ROI-figuren vises kun når `|roi * 100| >= 5`.
- **Vindusnettoen skjules når den er negativ.** Etiketten og kurven blir stående; det
  røde tallet gjør ikke. `showWin = winNet >= 0`.

**Tilstander**

| Tilstand | Utfall |
| --- | --- |
| Tom (`value-report.json === []`) | Venstre kolonne sentrerer tomlinja + to knapper. Kurven og statraden rendres som vanlig — historikken finnes. |
| Populert | Inntil 3 rader i venstre kolonne, sortert på EV synkende. Overflow scroller inne i kolonnen. |
| Lastende | Kicker/headline vises som `Laster …`; kurveflaten står tom; statfigurene viser `—`. |
| Feil | Feilpanel over hero-body; hero-body rendres ikke. |

---

### C.2 Verdi i dag (`/verdi`)

```
main
├─ section (skjermhode) → .kicker «Value-rapport · terskel EV ≥ 20 %» + .screen-title «29. juli 2026»
├─ [TOM] section grid minmax(0,1fr) minmax(0,1fr); gap:0; border-bottom:1px rule
│  ├─ venstre padding:80px 48px 88px 0; border-right:1px rule
│  │  ├─ Serif clamp(46px,5.6vw,80px)/0.95; -.02em; max-width:16ch  «Ingen kamper å prise»
│  │  ├─ .body margin-top:26px; max-width:52ch
│  │  └─ .actions margin-top:32px; flex; gap:14px; wrap
│  └─ høyre padding:80px 0 88px 48px; flex column; justify-content:center
│     ├─ .kicker «Siste kjøring»; padding-bottom:16px; border-bottom:1px rule
│     └─ 5 rader flex space-between/baseline gap:24px; padding:13px 0; border-bottom:1px rule-light
│        nøkkel Mono 500 9.5px/1.4 .13em uppercase muted | verdi Mono 400 13.5px/1.3 høyre
└─ [POPULERT] section padding:26px 0 0
   ├─ filterrad flex gap:26px align-center wrap; padding-bottom:22px; border-bottom:1px rule
   │  → pillegruppe «Bare value»|«Alle kamper» + telling Mono 400 12px/1.5 muted
   ├─ [ingen treff] div padding:64px 0 72px; border-bottom:1px rule
   └─ .game-row × n  grid minmax(280px,.85fr) minmax(0,2fr); gap:0; border-bottom:1px rule;
      │                animation:rise .3s ease both
      ├─ venstre padding:30px 40px 30px 0; border-right:1px rule-light
      │  ├─ metalinje flex gap:14px align-center; Mono 400 10px/1 .14em uppercase muted; «·» i dash
      │  ├─ lag margin-top:20px; flex column gap:14px — bortelag først
      │  │  hvert: flex align-center gap:13px → logo 38×38 + Serif 18px/1.15 navn
      │  │  + Mono 400 10px/1.4 .1em uppercase faint «Borte · Elo 1 559» / «Hjemme · Elo 1 514»
      │  └─ nøkkeltall margin-top:20px; flex gap:20px → .stat-label + Mono 400 14px/1.3 margin-top:4px
      │     («Elo-diff», «Form B/H» — formstrengen har letter-spacing .08em)
      └─ høyre padding:30px 0 30px 40px
         ├─ tabellhode grid minmax(0,1fr) 74px 74px 82px 92px; gap:14px; padding-bottom:9px;
         │  border-bottom:1px rule-light; .table-header men 9px
         └─ 3 rader samme grid; align-items:center; padding:13px 0; border-bottom:1px rule-light; opacity per rad
            k1 flex baseline gap:10px → .row-label + tagg; + stolpe margin-top:7px height:3px bg rule-light position:relative
               · markedslag absolute inset-y:0 left:0 bg:dash width:implied%
               · modellag  absolute top:-1px bottom:-1px left:0 bg:teal (SPILL) ellers ink, width:model%
            k2 Mono 14px/1 høyre (modell) · k3 Mono 13px/1 høyre muted (marked)
            k4 Mono 14px/1 høyre (odds)   · k5 Mono 15px/1 høyre farget (EV)
```

**Tagger**

| Tagg | Vilkår | Tekstfarge | Rammefarge | Radopasitet |
| --- | --- | --- | --- | --- |
| `SPILL` | `ev >= evTerskel` og ikke OT/SO | `--teal` | `--teal` | 1 |
| `NEI` | ellers, ikke OT/SO | `--muted` | `--rule` | 1 |
| `UTELATT` | alltid for OT/SO-raden | `--muted` | `--rule` | **0.5** |

Taggstil: `.tag { font:500 8.5px/1.5 'IBM Plex Mono',monospace; letter-spacing:.14em;
text-transform:uppercase; padding:2px 6px; border:1px solid }`. Kildestrengene er små
bokstaver (`spill`, `nei`, `utelatt`); `text-transform` gjør dem store.

EV-farge: `ev >= terskel → teal`, ellers `ev > 0 → ink`, ellers `--muted`.

OT/SO-raden vises alltid, alltid `UTELATT`, alltid `opacity: .5` — prisen skal likevel
stå der, fordi skyggeloggen trenger den.

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker | `Value-rapport · terskel EV ≥ 20 %` (terskelen formateres `nf(th*100,0) + ' %'`) |
| Tomtilstand-headline | `Ingen kamper å prise` |
| Tomtilstand-brødtekst | `Modellen kjører hver morgen, men kampprogrammet er tomt.` |
| Tomtilstand-knapp | `Analyser en kamp selv` (primær, → `/kamp`) |
| «Siste kjøring»-rader | `Kjørt` · `Horisont` · `Kamper funnet` · `Value-spill` · `Feilede jobber` |
| Verdier | `2026-07-29 10:48` · `3 døgn` · `0` · `0` · `ingen` |
| Filterpiller | `Bare value` · `Alle kamper` (**standard: Alle kamper**) |
| Tellelinje | `5 av 5 kamper · 1 spill over terskel` |
| Ingen treff-headline | `Ingen utfall over terskel` |
| Ingen treff-brødtekst | `Markedet priser alle fem kampene som modellen. Senk EV-terskelen eller vis alle kamper.` |
| Ingen treff-knapp | `Vis alle kamper` |
| Tabellhode | `Utfall` · `Modell` · `Marked` · `Odds` · `EV` |
| Utfallsetiketter | `{Lag} vinner` · `OT/SO` · `{Lag} vinner` |
| Lagundertekst | `Borte · Elo 1 559` / `Hjemme · Elo 1 514` |
| Nøkkeltall | `Elo-diff` · `Form B/H` |

**Tilstander**

| Tilstand | Utfall |
| --- | --- |
| Tom (`[]`) | To-kolonners tomtilstand. Dette er hovedtilstanden mesteparten av året. |
| Populert | Filterrad + kampradene. Nye rader animeres med `rise`. |
| Populert, filter «Bare value» uten treff | Ingen treff-blokken, med knapp tilbake til «Alle kamper». |
| Lastende | Skjermhodet vises; kroppen erstattes av `Laster …`. |
| Feil | Feilpanel i stedet for kroppen; skjermhodet står. |

---

### C.3 Kampanalyse (`/kamp`)

```
main
├─ section padding:48px 0 14px; border-bottom:1px ink
│  → .kicker «Kampanalyse · egendefinert oppgjør» + .screen-title «Sett to lag mot hverandre»
└─ section grid minmax(300px,.8fr) minmax(0,1.6fr); gap:0
   ├─ venstre padding:36px 44px 36px 0; border-right:1px rule
   │  ├─ div flex column gap:20px → felt «Hjemmelag» | knapp «⇅ Bytt» | felt «Bortelag»
   │  │  knapp: align-self:flex-start; Mono 500 9.5px/1 .14em uppercase muted; border:1px rule; padding:9px 13px
   │  └─ div margin-top:34px; padding-top:22px; border-top:1px rule
   │     ├─ heading «Odds fra bookmaker»
   │     └─ 3 rader margin-top:14px; flex space-between align-center gap:16px; padding:10px 0;
   │        border-bottom:1px rule-light (siste uten) → etikett Sans 400 13.5px/1.2 + <input>
   └─ høyre padding:36px 0 36px 44px
      ├─ tittelrad flex baseline gap:16px wrap → Serif 34px/1.1 «{Away} hos {Home}»
      │  + Mono 400 11px/1.4 .12em uppercase muted «Modellens anbefaling: hjemmeseier»
      ├─ utfallsgrid margin-top:30px; repeat(3,minmax(0,1fr)); gap:0; border-top:1px ink
      │  celle padding:24px 22px 24px 0; border-right:1px rule-light
      │  ├─ etikett Mono 500 9.5px/1.3 .14em uppercase muted; min-height:2.6em
      │  ├─ figur Serif clamp(44px,5vw,66px)/0.9; margin-top:12px; teal|ink — tall uten «%»: «44,0»
      │  ├─ stolpe margin-top:14px; height:4px; bg rule-light; fyll absolute inset-y:0 left:0, width p%
      │  ├─ rader margin-top:16px; flex column gap:7px → «Marked»/«Odds»/«EV»
      │  │  nøkkel Mono 400 10.5px/1.3 muted | verdi Mono 400 12px/1.3 (EV 13px, farget)
      │  └─ tagg margin-top:14px; display:inline-block; padding:3px 7px
      └─ bunn margin-top:36px; grid minmax(0,1fr) minmax(0,1fr); gap:44px
         ├─ «Elo» heading + 4 rader flex space-between/baseline; padding:11px 0; border-bottom:1px rule-light
         │  nøkkel Sans 400 13px/1.3 body | verdi Mono 400 14px/1
         └─ «Siste fem» heading + 2 rader (bortelag først); padding:13px 0; border-bottom:1px rule-light
            → flex space-between/baseline gap:12px: navn Sans 400 13px/1.3 | sekvens Mono 400 11px/1.3 .14em muted
            → resultater margin-top:6px; Mono 400 11px/1.4 faint
```

**Skjemakontroller**

```css
select { width:100%; padding:12px; background:var(--paper); border:1px solid var(--dash);
         border-radius:0; font:400 15px/1.2 'IBM Plex Sans',sans-serif }
input[type=number] { width:88px; padding:8px 10px; text-align:right;
         background:var(--paper); border:1px solid var(--dash); border-radius:0;
         font:400 14px/1 'IBM Plex Mono',monospace }
```
`<input type="number" step="0.05" min="1.01">`. Etikett over select:
Mono 500 9.5px/1, `.14em`, uppercase, `--muted`, `margin-bottom: 8px`.

Lagvalg: alle 32 lag, sortert med `localeCompare(..., 'nb')` på fullt navn, merket
`Boston Bruins (BOS)`.

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker | `Kampanalyse · egendefinert oppgjør` |
| Tittel | `Sett to lag mot hverandre` |
| Etiketter | `Hjemmelag` · `Bortelag` |
| Byttknapp | `⇅ Bytt` |
| Oddsheading | `Odds fra bookmaker` |
| Oddsrader | `Hjemmeseier` · `OT/SO` · `Borteseier` |
| Kamptittel | `{Bortelag} hos {Hjemmelag}` |
| Anbefaling | `Modellens anbefaling: hjemmeseier` \| `OT/SO` \| `borteseier` |
| Utfallsetiketter | `{Hjemmelag} vinner (hjemme)` · `Uavgjort etter ordinær tid (OT/SO)` · `{Bortelag} vinner (borte)` |
| Kolonnerader | `Marked` · `Odds` · `EV` |
| Elo-headings | `Elo` · `Siste fem` |
| Elo-rader | `{Hjemmelag} (hjemme)` · `{Bortelag} (borte)` · `Hjemmefordel` (`+50`) · `Justert differanse` (`+80` / `−34`) |
| Tom formsekvens | `—` |

Alt regnes om ved `change` — ingen «Beregn»-knapp, ingen submit.

**Tilstander**

| Tilstand | Utfall |
| --- | --- |
| Standard | `home = BOS`, `away = TOR`, `oh = 2,20`, `od = 3,90`, `oa = 3,10`. |
| Ukjent paring | Slå opp `"HOME-AWAY"`, deretter `"AWAY-HOME"`, ellers fallback `{h:.33, o:.25, a:.42}` og en `.body-small`-note i `--faint` under kamptittelen: `Ingen lagret modellpris for denne paringen.` |
| Ugyldig odds (`<= 1`) | Implisitt sannsynlighet settes til 0, EV til `−100,0 %`, taggen blir `NEI`. Feltet får ikke rød ramme. |
| Lastende | Kroppen erstattes av `Laster …`; selectene rendres deaktivert. |
| Feil | Feilpanel; skjemaet vises ikke. |

---

### C.4 Historikk (`/historikk`)

```
main
├─ section (skjermhode, flex-varianten) padding:48px 0 14px; border-bottom:1px solid ink
│  ├─ venstre: .kicker «Beslutningslogg» + .screen-title «Hvert spill som er lagt inn»
│  └─ høyre: flex gap:34px align-items:flex-end
│     3 × (.stat-label + .stat-figure--lg margin-top:7px)
│     «Utvalg» 202 · «Treffrate» 33,7 % · «Netto» +35 kr (farget)
├─ section (filtre) flex gap:30px wrap align-center; padding:18px 0;
│           border-bottom:1px solid var(--rule)
│  ├─ pillegruppe status  «Alle» «Vunnet» «Tapt»
│  ├─ pillegruppe utfall  «Alle utfall» «Hjemme» «Borte» «OT/SO»
│  ├─ pillegruppe sort    «Nyeste» «Høyest EV» «Beste netto»
│  │  (alle: padding 8px 12px, Mono 500 9.5px/1, .1em, uppercase)
│  └─ note margin-left:auto; Mono 400 11.5px/1.5 --faint  «Alle spill 100 kr»
└─ section (tabell)
   ├─ hode grid 76px minmax(0,1.5fr) 66px 60px 72px 72px 76px 80px 92px; gap:12px;
   │       padding:12px 0 10px; border-bottom:1px solid ink; .table-header
   └─ rader samme grid; gap:12px; align-items:baseline; padding:12px 0;
      border-bottom:1px solid var(--rule-light); hover background:var(--tint)
      1 Dato     Mono 400 11px/1.3 --faint            «10. jun»
      2 Kamp     Sans 400 13.5px/1.3, ellipsis nowrap «Carolina Hurricanes hos …»
      3 Spill    Mono 500 9.5px/1.3 .1em uppercase --body  «Hjem»|«Borte»|«OT/SO»
      4 Odds     .table-figure høyrestilt
      5 Modell   .table-figure høyrestilt
      6 Marked   .table-figure høyrestilt --faint
      7 EV       .table-figure høyrestilt
      8 Resultat Mono 500 9.5px/1.3 .1em uppercase, farget
      9 Netto    Mono 400 13px/1.3 høyrestilt, farget
```

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker / tittel | `Beslutningslogg` / `Hvert spill som er lagt inn` |
| Nøkkeltall | `Utvalg` · `Treffrate` · `Netto` |
| Statusfilter | `Alle` · `Vunnet` · `Tapt` |
| Utfallsfilter | `Alle utfall` · `Hjemme` · `Borte` · `OT/SO` |
| Sortering | `Nyeste` · `Høyest EV` · `Beste netto` |
| Note | `Alle spill 100 kr` |
| Tabellhode | `Dato` · `Kamp` · `Spill` · `Odds` · `Modell` · `Marked` · `EV` · `Resultat` · `Netto` |
| Spillkolonne | `Hjem` · `Borte` · `OT/SO` |
| Resultat | `Vunnet` (teal) · `Tapt` (vermillion) · `Åpen` (muted) |
| Tomtilstand ved filter | `Ingen spill matcher filteret` (Serif `clamp(30px,3.4vw,46px)`/1.1) + `.body-small` `Løsne på ett av filtrene.` + sekundærknapp `Nullstill filtre` |

Sortering: `Nyeste` = dato synkende, `Høyest EV` = `ev` synkende, `Beste netto` = `pr`
synkende. 202 rader rendres uten virtualisering. Ingen innsatskolonne — alle spill er
100 kr, og det står i noten.

**Tilstander**: populert (normalen) · filtrert-tom (over) · lastende · feil.

---

### C.5 Elo (`/elo`)

```
main
├─ section (skjermhode, flex-varianten)
│  ├─ .kicker «Elo · t.o.m. 2026-04-16» + .screen-title «Styrkeforholdet modellen ser»
│  └─ pillegruppe «Alle» «Øst» «Vest» (padding 9px 14px, 10px, .12em)
└─ section grid minmax(0,1fr) 280px; gap:0
   ├─ venstre padding:22px 44px 0 0; border-right:1px solid var(--rule)
   │  ├─ hode grid 32px 42px minmax(0,1fr) 54px minmax(120px,1.1fr) 64px; gap:14px;
   │  │       padding-bottom:10px; border-bottom:1px solid ink; .table-header
   │  └─ rader samme grid; align-items:center; padding:9px 0;
   │     border-bottom:1px solid var(--rule-light); hover background:var(--tint)
   │     1 rank    Mono 400 12px/1 --faint
   │     2 logo    30×30, 1px dashed var(--dash), Mono 500 9px/1 --muted, sentrert
   │     3 navn    .team-name-table
   │     4 konf.   Mono 400 10px/1 .1em uppercase --faint  («Øst» | «Vest»)
   │     5 stolpe  se under
   │     6 rating  Mono 400 13.5px/1 høyrestilt
   └─ høyre padding:22px 0 0 36px
      ├─ heading «Parametere» padding-bottom:12px; border-bottom:1px solid var(--rule)
      ├─ 6 rader flex space-between/baseline; padding:11px 0;
      │  border-bottom:1px solid var(--rule-light)
      │  nøkkel Sans 400 12.5px/1.3 --body · verdi Mono 400 13.5px/1
      └─ caveat margin-top:26px; padding:18px 20px; background:var(--tint);
         border-left:3px solid var(--vermillion)
         ├─ Mono 500 9px/1 .14em uppercase --vermillion  «Kjent datavindu»
         └─ margin-top:9px; Sans 400 12.5px/1.65 --body; text-wrap:pretty
```

**Divergerende stolpe rundt 1500**

```
spor:      display:block; height:4px; background:var(--rule-light); position:relative
midtlinje: position:absolute; top:-3px; bottom:-3px; left:50%; width:1px;
           background:var(--dash); display:block
fyll:      position:absolute; top:0; bottom:0; display:block;
           background: dv >= 0 ? var(--teal) : var(--vermillion);
           left:  dv >= 0 ? '50%' : (50 - w) + '%'
           width: w + '%'
der  dv = rating − 1500  og  w = min(|dv| / 100, 1) * 46
```

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker | `Elo · t.o.m. 2026-04-16` |
| Tittel | `Styrkeforholdet modellen ser` |
| Filter | `Alle` · `Øst` · `Vest` |
| Tabellhode | `#` · (tom) · `Lag` · `Konf.` · `Avvik fra 1500` · `Rating` |
| Parameterheading | `Parametere` |
| Parameterrader | `Grunnrating` `1 500` · `K-faktor` `6` · `Hjemmefordel` `+50` · `Skala` `400` · `Sesongregresjon` `0,70` · `OT-seiersvekt` `0,60` |
| Caveat-etikett | `Kjent datavindu` |
| Caveat-tekst | `Utah ligger lagret under ARI. Fram til 17. april 2026 ble formtallene lest speilvendt.` |

Merk: alias-logikken `UTA → ARI` gjøres i eksport-steget, ikke i frontend. Forklarings-
notatet blir likevel stående.

**Tilstander**: populert · filtrert til null (skal ikke skje med 32 lag; hvis det gjør
det: `Ingen lag i denne konferansen`) · lastende · feil.

---

### C.6 Modell (`/modell`)

```
main
├─ section padding:48px 0 14px; border-bottom:1px solid ink
│  ├─ .kicker «Modellkvalitet · 202 spill» + .screen-title «Er modellen god?»
├─ section grid repeat(3,minmax(0,1fr)); gap:0; border-bottom:1px solid ink
│  celler: 1: padding 38px 32px 34px 0, border-right:1px solid var(--rule)
│          2: padding 38px 32px 34px,   border-right:1px solid var(--rule)
│          3: padding 38px 0 34px 32px
│  hver: Mono 500 9.5px/1.4 .14em uppercase --muted
│      + .calib-figure margin-top:12px  (farge: vermillion | muted | teal)
│      + margin-top:10px Sans 400 13px/1.6 --body  «treff»
└─ section grid minmax(340px,.8fr) minmax(0,1.2fr); gap:0
   ├─ venstre padding:36px 44px 36px 0; border-right:1px solid var(--rule)
   │  ├─ .kicker «Kalibrering» + Serif 24px/1.2 margin-top:8px «Predikert mot faktisk»
   │  ├─ .plot-wrap position:relative; margin-top:20px      (se §D.3)
   │  ├─ tegnforklaring margin-top:14px; flex gap:20px wrap
   │  │  hver: flex align-center gap:8px; Mono 400 11px/1 --body
   │  │  · fylt prikk 10×10 border-radius:50% bg ink   «Modellen»
   │  │  · hul prikk 10×10 border-radius:50% border:1.6px solid var(--faint) «Markedet»
   │  └─ note margin-top:12px; Sans 400 12.5px/1.65 --faint; text-wrap:pretty
   └─ høyre padding:36px 0 36px 44px
      ├─ .kicker «Per sannsynlighetsintervall»
      ├─ hode margin-top:16px; grid minmax(0,1fr) 54px 78px 78px 78px; gap:14px;
      │       padding-bottom:9px; border-bottom:1px solid ink; .table-header
      ├─ rader samme grid; align-items:baseline; padding:12px 0;
      │  border-bottom:1px solid var(--rule-light)
      │  1 Mono 400 13.5px/1.3  «25–32 %»   (tankestrek U+2013)
      │  2 .table-figure høyre --faint      (N)
      │  3 .table-figure høyre              (snitt modell)
      │  4 .table-figure høyre --faint      (snitt marked)
      │  5 Mono 400 14px/1.3 høyre, teal hvis faktisk ≥ snitt modell, ellers vermillion
      ├─ .kicker margin-top:34px «Per utfallstype»
      ├─ hode grid minmax(0,1fr) 46px 70px 70px 56px 84px; gap:12px;
      │       padding-bottom:9px; border-bottom:1px solid ink
      ├─ 3 rader samme grid; padding:12px 0; border-bottom:1px solid rule-light
      │  1 .team-name-table · 2 12.5px --faint · 3 12.5px · 4 12.5px --faint
      │  5 Mono 13.5px høyre · 6 Mono 13px høyre farget
      ├─ .kicker margin-top:34px «Neste steg»
      └─ 2 punkter grid 30px minmax(0,1fr); gap:16px; padding:16px 0;
         border-bottom:1px solid var(--rule-light)  (første punkt: margin-top:12px)
         ├─ Serif 400 24px/0.9 --dash  «01» / «02»
         └─ Serif 400 17px/1.3 tittel + margin-top:6px Sans 400 13px/1.6 --body
```

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker / tittel | `Modellkvalitet · 202 spill` / `Er modellen god?` |
| Tre tall | `Modellen forventet` **85,5** (vermillion) · `Markedet forventet` **66,4** (muted) · `Faktisk` **68** (teal) — hver etterfulgt av `treff` |
| Plottkicker / tittel | `Kalibrering` / `Predikert mot faktisk` |
| Tegnforklaring | `Modellen` · `Markedet` |
| Plottnote | `Under den stiplede linja betyr sjeldnere enn anslått.` |
| Bøttetabell-hode | `Modell sa` · `N` · `Snitt modell` · `Snitt marked` · `Faktisk` |
| Utfallstabell-hode | `Utfall` · `N` · `Modell` · `Marked` · `Faktisk` · `Netto` |
| Utfallsrader | `Hjemmeseier` · `Borteseier` · `OT/SO` |
| Neste steg-kicker | `Neste steg` |
| Punkt 01 | `Kalibrer sannsynlighetene` — `Isotonisk eller Platt på en kronologisk holdout, før EV regnes ut.` |
| Punkt 02 | `Logg alle tre utfall` — `I dag lagres bare utfallet vi spilte. Det gir seleksjonsskjevhet i all etteranalyse.` |

**Bøtteinndeling:** DECISIONS overstyrer prototypen. Bruk **kvantilbøtter** (fra issue #7),
ikke prototypens faste `[[.25,.32],[.32,.37],[.37,.42],[.42,.47],[.47,.55],[.55,.80]]`.
Geometri og tabellform er uendret; bare bøttegrensene i kolonne 1 endres.

**Tilstander**: populert · tom (`bets = []` → tre tall viser `—`, plottet erstattes av
`.body-small` `Ingen avgjorte spill å kalibrere mot ennå.`) · lastende · feil.

---

### C.7 Skyggelogg (`/skygge`)

```
main
├─ section padding:48px 0 14px; border-bottom:1px solid ink
│  ├─ .kicker «Skyggelogg»
│  ├─ .screen-title margin-top:10px; max-width:26ch  «Spillene vi sluttet å ta»
│  └─ .body margin-top:16px; max-width:60ch
├─ section grid minmax(0,1fr) minmax(0,1fr); gap:0; border-bottom:1px solid var(--rule)
│  ├─ venstre padding:36px 40px 36px 0; border-right:1px solid var(--rule)
│  │  ├─ Mono 500 9.5px/1.4 .14em uppercase --teal  «Faktisk portefølje»
│  │  ├─ Serif clamp(48px,5.4vw,72px)/0.9 margin-top:14px, farget  «+675 kr»
│  │  ├─ stolpe margin-top:12px; height:5px; background:var(--rule-light)
│  │  │  fyll: height:5px; background = tallets farge; width = barW
│  │  ├─ .body-small margin-top:12px; max-width:42ch
│  │  └─ 4 rader margin-top:22px; flex space-between; padding:10px 0;
│  │     border-bottom:1px solid var(--rule-light) (siste uten)
│  │     nøkkel Mono 500 9.5px/1.3 .13em uppercase --muted · verdi Mono 400 14px/1
│  └─ høyre padding:36px 0 36px 40px; background:var(--tint)
│     samme struktur, men: tittel i --vermillion, stolpespor var(--tint-rule),
│     radskillere var(--tint-rule), ROI-verdien farget
└─ section grid minmax(0,1.2fr) minmax(0,.8fr); gap:0; padding-top:40px
   ├─ venstre padding-right:44px; border-right:1px solid var(--rule)
   │  ├─ Serif 24px/1.35; max-width:30ch
   │  └─ margin-top:14px; max-width:60ch; Sans 400 14px/1.7 --body; text-wrap:pretty
   └─ høyre padding-left:44px
      ├─ .kicker «Utah-vinduet»
      └─ panel margin-top:14px; padding:22px 24px; background:var(--tint);
         border-left:3px solid var(--vermillion)
         ├─ flex gap:26px wrap → 3 × (.stat-label + Serif 26px/1 margin-top:6px)
         └─ margin-top:14px; Sans 400 12.5px/1.7 --body; text-wrap:pretty
```

Stolpeskala: `m = max(|nettoFaktisk|, |nettoSkygge|, 1)`,
`barW = (|netto| / m * 100).toFixed(1) + '%'` — samme nevner i begge paneler.

**Norske strenger**

| Element | Streng |
| --- | --- |
| Kicker / tittel | `Skyggelogg` / `Spillene vi sluttet å ta` |
| Ingress | `OT/SO-spill legges ikke inn lenger, men føres videre med full innsats.` |
| Venstre paneltittel | `Faktisk portefølje` |
| Venstre undertekst | `Hjemme- og borteseier — spillene som faktisk ble lagt inn` |
| Høyre paneltittel | `Skyggelogg` |
| Høyre undertekst | `OT/SO-spill som modellen ville tatt, ført med full innsats` |
| Nøkkeltallsrader | `Spill` · `ROI` · `Treffrate` · `Modellen anslo` |
| Forklaringstittel | `Feilen lå i seleksjonen, ikke i modellen` |
| Forklaringstekst | `Modellen anslo 33 % sjanse for OT/SO på kampene den flagget. Faktisk endte 22 % slik. På backtest treffer den 22,6 % mot 20,6 % predikert — skjevheten oppstår fordi vi bare spiller når modellen sier et ekstremt tall.` |
| Utah-kicker | `Utah-vinduet` |
| Utah-etiketter | `Spill` · `Treff` · `Netto` (netto i vermillion) |
| Utah-note | `En audit anslår at cirka −280 kr kan tilskrives feilen; resten er varians.` |
| Kildelinje (ny) | `Kilde: shadow.json` \| `Kilde: portfolio.json · OT/SO-rader` |

**Kildelinja** finnes ikke i prototypen, men er påkrevd av DECISIONS: når `shadow.json`
er tom (`[]`) skal skjermen falle tilbake på `selection === 'draw'`-radene i
`portfolio.json` og si fra hvilken kilde som brukes. Plasser den som en `.axis-label`
rett under ingressen i skjermhodet.

**Tilstander**

| Tilstand | Utfall |
| --- | --- |
| `shadow.json` har rader | Bruk dem. Kildelinje: `Kilde: shadow.json`. |
| `shadow.json === []` | Bruk `draw`-radene fra `portfolio.json`. Kildelinje: `Kilde: portfolio.json · OT/SO-rader`. |
| Begge tomme | Høyre panel viser `—` som figur, tom stolpe, og `.body-small` `Ingen OT/SO-spill registrert.` Venstre panel rendres normalt. |
| Lastende / feil | Som fellestilstandene. |

---

## D. SVG-geometri

Fire graftyper. Alle er håndskrevet inline SVG — ingen bibliotek, ingen avhengighet.

Fellesregler:
- Alle streker som skal holde seg hårfine under strekk har `vector-effect="non-scaling-stroke"`.
- Ingen `<text>` i SVG. Alle etiketter er absolutt posisjonert HTML over SVG-en (§D.5).
- Tooltips og hover-prikker er HTML, ikke SVG (§D.5).

### D.1 Hero-kurve

| Egenskap | Verdi |
| --- | --- |
| `viewBox` | `0 0 1200 200` |
| `preserveAspectRatio` | `none` |
| `style` | `width:100%; height:100%; display:block` |
| Wrapper | `flex:1 1 auto; min-height:140px; position:relative; margin-top:16px` |
| Padding i viewBox | `PT = 12`, `PB = 12`, ingen horisontal padding |

```
mn = min(0, min(vals));  mx = max(0, max(vals))
hvis mn === mx: mn -= 1; mx += 1
pad = (mx - mn) * 0.12;  mn -= pad;  mx += pad
X(i) = n < 2 ? 600 : (i / (n - 1)) * 1200
Y(v) = 12 + 176 - ((v - mn) / (mx - mn)) * 176
zero = Y(0)
line = punktene som «M x y L x y …», alle koordinater toFixed(1)
area = line + `L1200 ${zero}L0 ${zero}Z`
```

Elementrekkefølge i SVG-en:

```xml
<clipPath id="eUp"><rect x="0" y="0"    width="1200" height="{zero}"/></clipPath>
<clipPath id="eDn"><rect x="0" y="{zero}" width="1200" height="200"/></clipPath>
<path d="{area}" fill="#0E4B47" opacity=".12" clip-path="url(#eUp)"/>
<path d="{area}" fill="#B23A1B" opacity=".12" clip-path="url(#eDn)"/>
<line x1="0" x2="1200" y1="{zero}" y2="{zero}" stroke="#C9BFA9" stroke-width="1"
      stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
<path d="{line}"  fill="none" stroke="#17150F" stroke-width="1.6"
      vector-effect="non-scaling-stroke"/>
<path d="{cross}" stroke="#17150F" stroke-width="1" stroke-dasharray="2 3"
      fill="none" opacity="{hOp}" vector-effect="non-scaling-stroke"/>
```

**Todelt areafyll:** samme `d` tegnes to ganger, én gang klippet til alt over nullinja
(`eUp`, teal 12 %) og én gang til alt under (`eDn`, vermillion 12 %). Rektanglene deler
høyden nøyaktig ved `zero`. Bruk unike `id`-er per instans hvis flere kurver kan
sameksistere på siden.

`cross = 'M' + X(hi) + ' 0V200'` (full høyde, ikke innenfor padding).

### D.2 Kurvelab

| Egenskap | Verdi |
| --- | --- |
| `viewBox` | `0 0 1000 300` |
| `preserveAspectRatio` | `none` |
| `style` | `width:100%; height:300px; display:block; overflow:visible` |
| Padding i viewBox | `PL = 58`, `PR = 10`, `PT = 18`, `PB = 28` → `pw = 932`, `ph = 254` |
| Wrapper | `position:relative`, inne i `padding:8px 0 0`, med `height:22px`-spacer etter |

```
mn = min(0, min(vals));  mx = max(0, max(vals));  hvis like: ±1
pad = (mx - mn) * 0.10;  mn -= pad;  mx += pad
X(i)   = 58 + (n < 2 ? 466 : (i / (n - 1)) * 932)
Y(v)   = 18 + 254 - ((v - mn) / (mx - mn)) * 254
zeroY  = Y(0)
grid   = for k = 0..4:  y = Y(mn + (mx - mn) * k / 4)  →  `M58 ${y}H990`
zeroPath = `M58 ${zeroY}H990`
```

| Element | Stil |
| --- | --- |
| rutenett | `stroke=#E0D7C5 stroke-width=1 fill=none` + `vector-effect` |
| nullinje | `stroke=#17150F stroke-width=1 fill=none` + `vector-effect` |
| areafyll opp | `fill=#0E4B47 opacity=.13 clip-path=url(#clipUp)` |
| areafyll ned | `fill=#B23A1B opacity=.13 clip-path=url(#clipDn)` |
| søyler positive | `fill=#0E4B47 opacity=.85` — **én samlet path** |
| søyler negative | `fill=#B23A1B opacity=.85` — **én samlet path** |
| linje | `stroke=#17150F stroke-width=1.7 stroke-linejoin=round fill=none` + `vector-effect` |
| crosshair | `stroke=#17150F stroke-width=1 stroke-dasharray="2 3" fill=none` + `vector-effect` |

`clipUp = rect(0, 0, 1000, zeroY)`, `clipDn = rect(0, zeroY, 1000, 300)`.

**Modus «Verdikurve»**: `line` + `area = line + 'L' + X(n-1) + ' ' + zeroY + 'L' + X(0) + ' ' + zeroY + 'Z'`.
`barsPos` og `barsNeg` er tomme strenger.

**Modus «Daglig P&L» (standard)**: `line` og `area` er tomme.

```
bw = max(2, (932 / max(n, 1)) * 0.62)
per punkt i:
  x   = X(i) - bw / 2
  top = min(zeroY, Y(v))
  h   = max(|Y(v) - zeroY|, 0.8)
  seg = `M${x} ${top}h${bw}v${h}h-${bw}Z`
  v >= 0 → barsPos += seg,  ellers barsNeg += seg
```

Alle søyler i samme fortegn samles i **én** `<path>`. Aldri individuelle `<rect>`.

`cross = 'M' + X(hi) + ' 18V272'` (klemt inn i plottområdet).

**Nedlagte modi:** Drawdown og kumulativ ROI ble designet og bevisst kuttet. Ikke
gjeninnfør dem.

### D.3 Kalibreringsplott

| Egenskap | Verdi |
| --- | --- |
| `viewBox` | `0 0 520 400` |
| `preserveAspectRatio` | **ingen** — standard `xMidYMid meet` |
| `style` | `width:100%; height:auto; display:block` |
| Padding i viewBox | `PL = 46`, `PR = 14`, `PT = 14`, `PB = 40` |

```
lo = .15, hi = .72
X(p) = 46 + ((p - .15) / .57) * 460
Y(p) = 14 + 346 - (p / .72) * 346        ← merk: y-aksen starter på 0, ikke på lo
akseverdier = [.2, .3, .4, .5, .6, .7]
grid  = per a:  `M${X(a)} 14V360`  og  `M46 ${Y(a)}H506`
diag  = `M${X(.15)} ${Y(.15)}L${X(.72)} ${Y(.72)}`
pm    = bøttene i rekkefølge: (X(snittModell), Y(faktisk))
pk    = bøttene sortert stigende på snittMarked: (X(snittMarked), Y(faktisk))
```

| Element | Stil |
| --- | --- |
| rutenett | `stroke=#E4DCCB stroke-width=1 fill=none` |
| diagonal (perfekt kalibrering) | `stroke=#C9BFA9 stroke-width=1 stroke-dasharray="4 4" fill=none` |
| markedets kurve `pk` | `stroke=#9A9284 stroke-width=1.4 fill=none` |
| modellens kurve `pm` | `stroke=#17150F stroke-width=1.8 fill=none` |

Ingen `vector-effect` her — plottet skaleres proporsjonalt, så strekene forblir riktige.

### D.4 Mobil sparkline

| Egenskap | Verdi |
| --- | --- |
| `viewBox` | `0 0 320 84` |
| `preserveAspectRatio` | `none` |
| `style` | `width:100%; height:84px; display:block; margin-top:14px` |

```
mn = min(vals);  mx = max(vals)          ← ingen null-klemming, ingen padding
X(i) = (i / (n - 1)) * 320
Y(v) = 84 - ((v - mn) / (mx - mn || 1)) * 84
```

Linje: `stroke=#17150F stroke-width=1.4 fill=none` + `vector-effect`.
Nullinje: `<line x1=0 x2=320 y1=Y(0) y2=Y(0) stroke=#C9BFA9 stroke-width=1
stroke-dasharray="3 3">` + `vector-effect`. **Ingen hover på mobil.**

### D.5 Hover, crosshair og tooltip — og hvorfor HTML

**Hover-indeksformelen.** To varianter, fordi de to grafene har ulik horisontal padding.

```js
// Hero-kurven — viewBox har ingen horisontal padding
onHeroMove(e) {
  const r = e.currentTarget.getBoundingClientRect();
  let i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
  i = Math.max(0, Math.min(n - 1, i));
}

// Kurvelabben — plottområdet starter på 58 og er 932 bredt i viewBox-koordinater
onMove(e) {
  const r  = e.currentTarget.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * 1000;
  let i = Math.round(((px - 58) / 932) * (n - 1));
  i = Math.max(0, Math.min(n - 1, i));
}
```

Begge lyttes på **wrapper-diven**, ikke på SVG-en, slik at hele cellen er hover-flate.
`onMouseLeave` nullstiller indeksen. Sett bare state når indeksen faktisk endrer seg.
Å bytte modus eller rekkevidde nullstiller hover.

**Hvor prototypen bruker absolutt posisjonert HTML oppå SVG, og hvorfor:**

| Element | Hvorfor HTML |
| --- | --- |
| Akseetiketter (x og y, begge grafer) | SVG-`<text>` arver ikke fontstacken rent og blir uskarp når `preserveAspectRatio="none"` strekker koordinatsystemet. HTML gir crisp type og riktig `letter-spacing`. |
| Hover-prikk | En `<circle>` blir **elliptisk** under `preserveAspectRatio="none"`. En HTML-div med `border-radius:50%` forblir rund. |
| Tooltip | Flerlinjet tekst med tre ulike typostiler; trivielt i HTML, klumpete i SVG. |
| Kalibreringsprikker | Størrelsen skal være i px (`7 + min(n/8, 9)`), uavhengig av hvordan viewBoxen skaleres. |
| Tickmerker i kalibreringsplottet | Samme fontargument som over. |

**Posisjonering.** Alle overlegg ligger i `position:absolute; inset:0; pointer-events:none`
oppå SVG-en, og posisjoneres i prosent regnet ut fra **samme geometri som pathen**:

```
venstre% = (X(i) / viewBoxBredde  * 100).toFixed(2) + '%'
topp%    = (Y(v) / viewBoxHøyde   * 100).toFixed(2) + '%'
```

| Overlegg | Stil |
| --- | --- |
| Hover-prikk (hero) | `position:absolute; width:9px; height:9px; border-radius:50%; background:var(--paper); border:1.7px solid var(--ink); transform:translate(-50%,-50%); pointer-events:none; opacity:{hOp}; left:{venstre%}; top:{topp%}` |
| Tooltip | `position:absolute; top:0; transform:translateX(-50%); background:var(--tooltip-bg); color:var(--tooltip-fg); padding:8px 11px; white-space:nowrap; pointer-events:none; opacity:{hOp}; left:{venstre%}` |
| Tooltip-linje 1 (dato) | Mono 400 9px/1.4 · `.12em` · uppercase · `--tooltip-muted` — `10. jun 2026` |
| Tooltip-linje 2 (verdi) | Mono 400 15px/1.3 · `margin-top:2px` — `+255 kr` |
| Tooltip-linje 3 (sub) | Mono 400 10px/1.3 · `--tooltip-muted` — `3 spill · 1 traff` |
| Y-etikett (lab) | `position:absolute; left:0; transform:translateY(-50%); top:{topp%}` · `.axis-label` |
| X-etikett (lab) | i en container `position:absolute; left:0; right:0; bottom:-2px; height:26px`, hver `position:absolute; transform:translateX(-50%); left:{venstre%}` · `.axis-label` + `letter-spacing:.06em` |
| Kalibreringsprikk | `position:absolute; transform:translate(-50%,-50%); border-radius:50%; border:1.6px solid; width/height:{størrelse}px` — modell: `background:#17150F; border-color:#17150F`; marked: `background:#F2EDE4; border-color:#7A7364` |
| Kalibrering x-tick | `position:absolute; bottom:2px; transform:translateX(-50%); left:{venstre%}` · `.axis-label` |
| Kalibrering y-tick | `position:absolute; left:0; transform:translateY(-50%); top:{topp%}` · `.axis-label` |

`hOp` er `1` ved aktiv hover, ellers `0`; `left` settes til `-100%` når hover er null, så
elementet aldri kan bli synlig ved en glipp.

Prikkstørrelse i kalibreringsplottet: `(7 + Math.min(n / 8, 9)).toFixed(0) + 'px'` — 7 px
ved n = 0, 16 px ved n ≥ 72.

**X-etikettene i kurvelabben** genereres ved månedsskifte: gå gjennom serien, og hver gang
måneden endrer seg, legg til en etikett på det punktets X med månedsforkortelsen.

---

## E. Interaksjonstilstander

### E.1 Fylte piller

Gruppen er et flex-element der linjene er bakgrunnen som skinner gjennom:

```css
.pill-group { display: flex; gap: 1px; background: var(--rule); padding: 1px }
.pill        { background: var(--paper); color: var(--muted) }
.pill[aria-pressed="true"] { background: var(--ink); color: var(--paper) }
```

| Sted | padding | font-size | letter-spacing | uppercase |
| --- | --- | --- | --- | --- |
| Hero vindusvelger (60D/90D/ALT) | `7px 11px` | 9.5px | `.1em` | (allerede store) |
| Kurvelab rekkevidde (ALT/60D/20D) | `7px 11px` | 10px | `.1em` | (allerede store) |
| Verdi-filter | `9px 14px` | 10px | `.12em` | ja |
| Historikk-filtre (3 grupper) | `8px 12px` | 9.5px | `.1em` | ja |
| Elo konferansefilter | `9px 14px` | 10px | `.12em` | ja |
| Mobil (Verdi/Logg) | `8px 12px` | 9px | `.11em` / `.1em` | ja |
| Mobil (hero-vindu) | `7px 11px` | 9px | `.1em` | — |

Alle piller er Mono 500 med `line-height: 1`.

### E.2 Understrekede faner

```css
.tab { border-bottom: 2px solid transparent; color: var(--muted) }
.tab[aria-current] { border-bottom-color: var(--ink); color: var(--ink) }
```

| Sted | padding | typografi |
| --- | --- | --- |
| Hovednav | `11px 0 9px` | `.nav-item` (`white-space:nowrap`) |
| Kurvelab-modus | `padding-bottom:5px` | Mono 500 10px/1, `.13em`, uppercase |
| Mobil bunnnav | `15px 4px` | Mono 500 8.5px/1, `.10em`, uppercase; understrek som `box-shadow: inset 0 -2px 0 #17150F` |

### E.3 Outline-knapper

```css
.btn-primary {
  border: 1px solid var(--teal); color: var(--teal); padding: 13px 20px;
  font: 500 10px/1 'IBM Plex Mono', monospace; letter-spacing: .14em;
  text-transform: uppercase; background: none;
}
.btn-primary:hover { background: var(--teal); color: var(--paper) }

.btn-secondary { border: 1px solid var(--dash); color: var(--body); /* ellers likt */ }
.btn-secondary:hover { border-color: var(--ink); color: var(--ink) }
```

Standardiser på `13px 20px`. (Prototypen varierer mellom `13px 18px`, `13px 20px` og
`14px 20px` — se §H.)

Byttknappen i Kampanalyse er en tredje, mindre variant: `border:1px solid var(--rule);
color:var(--muted); padding:9px 13px; font:500 9.5px/1 Mono; letter-spacing:.14em;
uppercase`, hover → `border-color:var(--ink); color:var(--ink)`.

### E.4 Radhover

`background: var(--tint)` på: Historikk-rader, Elo-rader, mobile kampkort. Ingen
transition, ingen forflytning. Verdi-kampradene har **ikke** hover.

### E.5 Fokus

`:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }` på hver
interaktive node — knapper, lenker, `select`, `input`. Nettleserens default fjernes aldri
uten erstatning.

### E.6 Lenker

`color: var(--teal); text-decoration: none; border-bottom: 1px solid var(--link-underline)`.
Hover flytter begge til `var(--ink)`.

### E.7 Animasjon

Nøyaktig én keyframe i hele appen:

```css
@keyframes rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
```

Brukes kun som `animation: rise .3s ease both` på kampradene i Verdi i dag. Ingenting
annet beveger seg — ingen transitions på hover, ingen skjelettpuls, ingen sidetransisjoner.
Respekter `prefers-reduced-motion: reduce` ved å nulle den ut.

---

## F. Responsivt

Ett brytepunkt: **768px**.

### F.1 Under 768px

| Område | Endring |
| --- | --- |
| Innholdskolonne | `padding: 0 20px` (fra 48px) |
| Masthead | Ordmerket blir stående; metaklyngen (Sesong / Sist oppdatert / Status) kollapser til bare tidsstempelet |
| Toppnav | Skjules helt |
| Bunnnav | `position:fixed; bottom:0; left:0; right:0; z-index:40; background:var(--paper); border-top:1px solid var(--ink); display:grid; grid-template-columns:repeat(4,1fr)` |
| Bunnnav-elementer | `padding:15px 4px; min-height:44px`, Mono 500 8.5px/1, `.10em`, uppercase; aktiv: `color:var(--ink); box-shadow:inset 0 -2px 0 #17150F`; inaktiv: `color:var(--muted); box-shadow:inset 0 -2px 0 transparent` |
| Bunnnav-elementene | **Oversikt** → `/` · **Verdi** → `/verdi` · **Kamp** → `/kamp` · **Logg** → `/historikk` |
| Analyse-skjermene | Elo, Modell og Skyggelogg nås fra en lenkeliste nederst på Oversikt |
| `main` | `padding-bottom: calc(56px + env(safe-area-inset-bottom))` så bunnnaven ikke dekker innhold |
| Alle to-kolonners grid | `grid-template-columns: minmax(0,1fr)`; `border-right` → `border-bottom: 1px solid var(--rule)`; sidepadding blir blokkpadding |
| Hero | Dropper `min-height: calc(100vh - 108px)` → flyter. Kurven får fast høyde 84–140px |
| Statraden i hero | `repeat(4,minmax(0,1fr))` → stablede nøkkel/verdi-rader: `flex; justify-content:space-between; padding:14px 0; border-bottom:1px solid var(--rule-light)`; etikett Mono 500 9.5px/1 `.13em` uppercase muted, verdi Mono 400 14px/1 |
| Hero-figuren | 52px → `44px/0.9`, suffikset 22px → 17px, gap 14px → 8px |
| Tap-targets | Minimum 44px høyde på alle knapper, piller, `select` og `input` |

### F.2 Korttransformasjon av tabeller

**Historikk-rad → kort:**

```
div  display:flex; justify-content:space-between; align-items:center; gap:12px;
     padding:15px 20px; border-bottom:1px solid var(--rule-light)
├─ venstre (min-width:0)
│  ├─ Sans 400 14.5px/1.2, overflow hidden, ellipsis, nowrap  «Away hos Home»
│  └─ margin-top:5px; Mono 400 10px/1; .08em; uppercase; --faint
│     «10. jun · Borte · 2,40»
└─ høyre  Mono 400 16px/1; white-space:nowrap; farget  «−100 kr»
```

Bare statusfilteret (`Alle` / `Vunnet` / `Tapt`) vises på mobil; utfalls- og
sorteringsfiltrene skjules. Underskriften i skjermhodet blir
`{n} spill · {netto}`, satt som Mono 9.5px `.14em` uppercase muted.

**Elo-tabellen** beholder rutenettet, men avviksstolpen (kolonne 5) skjules under 768px:
`32px 34px minmax(0,1fr) 44px 64px`.

**Modell-tabellene** beholder rutenettet; `Snitt marked`-kolonnen skjules under 768px.

### F.3 Verdi-lista → detaljskjerm

Kampkort (tappbart, hele kortet er én knapp):

```
button  display:block; width:100%; text-align:left; padding:18px 20px;
        border-bottom:1px solid var(--rule-light); background:var(--paper)
        :hover/:active → background:var(--tint)
├─ flex space-between/baseline
│  ├─ tid  Mono 400 10px/1; .14em; uppercase; --faint
│  └─ tagg Mono 500 8.5px/1.5; .14em; uppercase;
│          teal hvis nPlay > 0 ellers muted    «1 spill» | «3 spill» | «ingen»
├─ flex align-center gap:11px margin-top:12px → logo 30×30 + Serif 16px/1.15 (bortelag)
└─ flex align-center gap:11px margin-top:8px  → logo 30×30 + Serif 16px/1.15 (hjemmelag)
```

Detaljskjerm:

```
header   ← knapp Serif 400 20px/1 --muted (hover --ink), padding:0 2px 0 0
         + tittel Serif 24px/1.1 «{Bortelag} – {Hjemmelag}»
         + undertittel margin-top:5px Mono 400 9.5px/1 .14em uppercase --muted
stripe   padding:18px 20px; border-bottom:1px solid var(--rule); flex gap:22px
         2 × (Mono 500 8.5px/1 .14em uppercase --muted + Mono 400 14px/1 margin-top:6px)
         «Elo-diff» · «Form B/H»
3 utfall padding:16px 20px; border-bottom:1px solid var(--rule-light); opacity per rad
         ├─ flex space-between/baseline gap:12px → .row-label + tagg (nowrap)
         ├─ stolpe margin-top:10px, height:3px (samme tolagsoppsett som desktop)
         └─ margin-top:12px; flex space-between gap:10px
            4 × (Mono 500 8.5px/1 .13em uppercase --muted + verdi margin-top:5px)
            «Modell» 13px · «Marked» 13px --faint · «Odds» 13px · «EV» 15px farget, høyre
```

Kampanalyse på mobil: selects stables med `gap:14px`, `padding:11px`, Sans 14px; etiketter
Mono 8.5px `.14em`; utfallene blir tre blokker à `padding:16px 20px` med Serif 40px/0.9
som figur, EV Mono 15px på samme linje til høyre, 4px stolpe, og en fotlinje
`marked 45,5 %  odds 2,20` i Mono 10.5px `--faint` med `gap:18px`.

### F.4 768–1440px

Rutenettene smalner bare inn. Ett unntak: **Verdi-tabellens utfallsetiketter brekker under
ca. 1200px.** Legg inn

```css
@media (max-width: 1200px) {
  .verdi-utfall { grid-template-columns: minmax(0,1fr) 62px 62px 70px 78px; gap: 10px }
}
```

---

## G. Sjekklister per skjerm

### Felles (gjelder alle sju)

- [ ] `max-width:1440px; margin:0 auto; padding:0 48px 96px` på `<main>`.
- [ ] Sticky header, `z-index:30`, `border-bottom:1px solid #17150F`, aktiv fane understreket 2px.
- [ ] Ingen `border-radius` unntatt prikkene i graf/tegnforklaring. Ingen `box-shadow` unntatt mobil bunnnav.
- [ ] Hvert eneste tall i IBM Plex Mono, unntatt de navngitte display-figurene i Instrument Serif.
- [ ] Negative tall bruker U+2212, ikke bindestrek. Mellomrom foran `%`.
- [ ] `:focus-visible` med 2px teal outline på alt interaktivt.
- [ ] Sidetekstur-gradienten ligger på app-wrapperen.
- [ ] Lastende og feil-tilstand finnes og bruker fellesmønsteret.

### Oversikt
- [ ] Hero `min-height: calc(100vh - 108px)`, `padding:36px 0 0`, `border-bottom:1px solid ink`.
- [ ] Kropp er grid `minmax(300px,.62fr) minmax(0,1fr)` med `border-top:1px solid ink`.
- [ ] Venstre kolonne har `border-right:1px solid #D8CFBC` og `padding:22px 44px 24px 0`.
- [ ] Tomtilstanden sentrerer vertikalt, `max-width:18ch`, med to knapper.
- [ ] Vindusnettoen er skjult når den er negativ; etikett og kurve står.
- [ ] Stort tall vises kun ved `|profit| >= 1000`; ROI kun ved `|roi*100| >= 5`.
- [ ] Statraden har fire celler med `border-left:1px solid #E4DCCB` på celle 2–4.
- [ ] Hero-kurven: `viewBox 0 0 1200 200`, `preserveAspectRatio="none"`, todelt clip ved nullinja, dasharray `3 4`.
- [ ] Kurvelabben starter i modus **Daglig P&L**, rekkevidde **ALT**.
- [ ] Søylene er to samlede paths, ikke n `<rect>`.
- [ ] Hover-prikken er HTML, ikke `<circle>`.
- [ ] «Siste avgjorte» viser 9 rader i grid `62px minmax(0,1fr) 56px 66px 76px`.

### Verdi i dag
- [ ] Kicker viser den aktive EV-terskelen: `Value-rapport · terskel EV ≥ 20 %`.
- [ ] Tomtilstanden er standardtilstanden og er bygget ferdig, ikke som ettertanke.
- [ ] «Siste kjøring» leser fem felter fra `meta.json`.
- [ ] Filteret står på **Alle kamper** som standard.
- [ ] Kamprad-grid er `minmax(280px,.85fr) minmax(0,2fr)`; utfallsgrid `minmax(0,1fr) 74px 74px 82px 92px`.
- [ ] Bortelag står over hjemmelag i venstre kolonne.
- [ ] Tolagsstolpen: marked i `--dash` bak, modell i teal/ink foran, `top:-1px; bottom:-1px`.
- [ ] OT/SO-raden har `opacity:.5` og taggen `UTELATT`, alltid.
- [ ] Taggene er `SPILL` / `NEI` / `UTELATT` med riktige rammefarger.
- [ ] `animation: rise .3s ease both` ligger på kampradene og ingenting annet.

### Kampanalyse
- [ ] Grid `minmax(300px,.8fr) minmax(0,1.6fr)`, gutter 44px.
- [ ] 32 lag i begge selects, sortert `localeCompare(…, 'nb')`, merket `Navn (ABC)`.
- [ ] `⇅ Bytt` bytter både lag og odds.
- [ ] Tre `input[type=number] step=0.05 min=1.01`, 88px brede, høyrestilt Mono 14px.
- [ ] Tre utfallskolonner i `repeat(3,minmax(0,1fr))` over `border-top:1px solid ink`.
- [ ] Etikettene har `min-height:2.6em` så figurene ligger på linje.
- [ ] Figuren er tallet uten `%` («44,0»), Serif `clamp(44px,5vw,66px)`/0.9.
- [ ] Elo-panelet viser fire rader, inkludert `Hjemmefordel +50`.
- [ ] «Siste fem» viser bortelag først, med resultatlinje under sekvensen.
- [ ] Alt regnes om på `change`; ingen submit-knapp.

### Historikk
- [ ] Tre nøkkeltall i skjermhodet som Mono 24px, Netto farget.
- [ ] Tre pillegrupper + høyrestilt note `Alle spill 100 kr`.
- [ ] Tabellgrid nøyaktig `76px minmax(0,1.5fr) 66px 60px 72px 72px 76px 80px 92px`, gap 12px.
- [ ] Tabellhodet har `border-bottom:1px solid #17150F`; radene `#E4DCCB`.
- [ ] Radhover `#EAE3D5`.
- [ ] Ingen innsatskolonne.
- [ ] `Resultat` er Mono 9.5px uppercase i teal/vermillion/muted.
- [ ] Alle 202 rader rendres; filtrene og sorteringene virker sammen.

### Elo
- [ ] Grid `minmax(0,1fr) 280px`.
- [ ] Tabellgrid `32px 42px minmax(0,1fr) 54px minmax(120px,1.1fr) 64px`, gap 14px.
- [ ] Stolpen divergerer om 1500: 4px spor, 1px `--dash` midtlinje ved 50 %, fyll `min(|dv|/100,1)*46 %`.
- [ ] Teal til høyre, vermillion til venstre.
- [ ] Seks parametere i høyre kolonne, med `0,70` og `0,60` i to desimaler.
- [ ] Utah-panelet: `--tint` bakgrunn, `border-left:3px solid #B23A1B`, etikett i vermillion.
- [ ] Ingen aliaslogikk i frontend — ratingene kommer ferdig aliaset fra eksporten.

### Modell
- [ ] Tre tall i `repeat(3,minmax(0,1fr))` med `border-bottom:1px solid ink` og `border-right:1px solid #D8CFBC` på celle 1–2.
- [ ] Fargene: 85,5 vermillion · 66,4 muted · 68 teal. Aldri byttet om.
- [ ] Kalibreringsplottet er `viewBox 0 0 520 400` **uten** `preserveAspectRatio`-override.
- [ ] Diagonalen er `stroke-dasharray="4 4"` i `--dash`.
- [ ] Modellkurven ink 1.8px, markedskurven faint 1.4px.
- [ ] Prikkene og tickene er absolutt posisjonert HTML, størrelse `7 + min(n/8, 9)` px.
- [ ] **Kvantilbøtter**, ikke de faste bøttene fra handoffen.
- [ ] «Faktisk»-kolonnen er teal når faktisk ≥ snitt modell, ellers vermillion.
- [ ] To nummererte «Neste steg»-punkter med Serif 24px `--dash`-tall.

### Skyggelogg
- [ ] Panelsplitt `minmax(0,1fr) minmax(0,1fr)`; høyre panel har `background:#EAE3D5`.
- [ ] Høyre panels linjer bruker `--tint-rule` `#DCD3C1`, ikke `--rule-light`.
- [ ] Begge stolper skalert mot samme nevner `max(|a|,|b|,1)`.
- [ ] Figurene i Serif `clamp(48px,5.4vw,72px)`/0.9, farget etter fortegn.
- [ ] Fire nøkkeltallsrader per panel, siste uten bunnramme.
- [ ] Kildelinja sier hvilken datakilde som brukes (`shadow.json` eller `portfolio.json`).
- [ ] Utah-panelet: tre Serif 26px-tall, netto i vermillion, `border-left:3px solid #B23A1B`.
- [ ] Bunnsplitt `minmax(0,1.2fr) minmax(0,.8fr)` med `padding-top:40px`.

### Mobil (under 768px)
- [ ] Bunnnav med nøyaktig fire elementer: Oversikt · Verdi · Kamp · Logg.
- [ ] Aktiv fane bruker `box-shadow: inset 0 -2px 0 #17150F`.
- [ ] `main` har nok `padding-bottom` til at bunnnaven ikke dekker innhold.
- [ ] Alle to-kolonners grid er stablet, `border-right` byttet til `border-bottom`.
- [ ] Verdi-lista er tappbar og åpner et detaljbilde med alle tre utfall og `←` tilbake.
- [ ] Historikk-radene er kort, ikke tabell.
- [ ] Alle tap-targets ≥ 44px.
- [ ] Hero flyter, ingen `100vh`.

---

## H. Der handoff-README og prototype er uenige

Disse er verdt å kjenne til før du velger verdi. Anbefalt valg står i **fet**.

| # | Sak | README sier | Prototypen gjør |
| --- | --- | --- | --- |
| 1 | Hover-indeks i kurvelabben | `round((clientX − left) / width * (n − 1))` | **`round((((clientX − left)/width*1000) − 58) / 932 * (n − 1))`** — README-formelen gjelder bare hero-kurven, som ikke har horisontal padding |
| 2 | Hover-prikk i kurvelabben | HTML-div, 9px, fordi `<circle>` blir elliptisk | SVG `<circle r="4">` — README har rett i argumentet; **bruk HTML-prikken begge steder** |
| 3 | Hero display-figur | `clamp(52px,6vw,88px)`/0.85 | **fast `52px/0.85`** (mobil: `44px/0.9`) |
| 4 | «Aldri symmetrisk 50/50» i to-kolonners splitt | eksplisitt regel | Verdi-tomtilstanden og Skyggelogg-panelene bruker `minmax(0,1fr) minmax(0,1fr)`. **Behold prototypens 50/50 på disse to** |
| 5 | Outline-knapp padding | `13px 20px` | `13px 18px` (Oversikt-hero, mobil), `14px 20px` (Verdi tomtilstand), `13px 20px` (Verdi «Vis alle kamper»). **Standardiser på `13px 20px`** |
| 6 | Rutenettfarge i kurvelabben | ikke i tokenlista | `#E0D7C5` — en farge som ikke finnes i README-tokenene. **Lagt inn som `--chart-grid`** |
| 7 | Areafyll-opasitet | «12 % over, 12 % under» | hero `.12`, **kurvelabben `.13`** |
| 8 | Kalibreringsaksene | «aksene 0.15–0.72» | X går 0.15→0.72, men **Y går 0→0.72**. Aksene er ikke symmetriske |
| 9 | Headerhøyde | «≈ 108px» | Boksmodellen gir ~95px. **Bruk `calc(100vh − 108px)` ordrett**, som prototypen |
| 10 | Kalibreringsbøtter | faste `[[.25,.32] …]` | Prototypen bruker de faste. **DECISIONS + issue #7 overstyrer: bruk kvantilbøtter** |
| 11 | Radetikett line-height | 14.5px/**1.25** | 14.5px/1.2 på desktop, 14.5px/1.25 på mobil. **Bruk 1.25 begge steder** |
| 12 | Kampanalyse, tredje utfallskolonne | — | har også `border-right:1px solid #E4DCCB`, altså en linje mot ingenting. **Behold** (den leser som en avslutning mot kolonnens padding) |
| 13 | Nav | sju elementer | prototypen har åtte — den åttende er «Mobil»-demoen. **Bygges ikke** |
| 14 | «I dag / Eksempeldag»-kontrollen | fjernes | finnes på Oversikt og Verdi. **Fjernes**, sammen med `SAMPLE`-dataene |
