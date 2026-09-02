# Blålinja — NHL-frontend (Next.js 15)

Statisk Next.js-app som viser NHL-modellens value-rapport, portefølje,
kalibrering, Elo og hele beslutningsloggen. All data leses fra ferdiggenerert
JSON i `public/data/`, som den daglige GitHub Actions-workflowen i repo-rota
committer. Se rotas `README.md` for modellen og pipelinen.

## 📦 Kom i gang
Krav: Node 20+.
```bash
npm install
npm run dev
```
Appen kjører på `http://localhost:3000`.

## 🔌 Datakilde
`next.config.ts` står på `output: 'export'` — appen er statisk, uten server
actions, route handlers eller `fs` i komponenter. `lib/data.ts` henter
`public/data/*.json` klientside.

| Miljøvariabel | Virkning |
| --- | --- |
| `NEXT_PUBLIC_BASE_PATH` | Prefiks når siten mountes under en underkatalog. Leses av både `next.config.ts` og `lib/data.ts`. |
| `NEXT_PUBLIC_API_BASE` | Peker datalaget mot en kjørende FastAPI-backend i stedet for JSON-filene. Statisk modus er det prod bruker; API-sporet er for lokal utvikling. |

Tersklene appen viser (`value_min`, `draw_value_min`, `max_odds`) kommer fra
`meta.json`. Python er sannheten — de skal aldri skrives inn i komponentene.

## 🖥️ Skjermene
Sju ruter, i navrekkefølge (`components/shell/nav.ts` er eneste kilde):

| Rute | Skjerm | Viser |
| --- | --- | --- |
| `/` | Oversikt | Dagens spill, kurven og de siste avgjorte |
| `/verdi` | Verdi i dag | Value-rapporten for kampprogrammet, med EV-terskelslider |
| `/kamp` | Kampanalyse | Sett to lag mot hverandre |
| `/historikk` | Historikk | Hvert spill som er lagt inn, med filtre og sortering |
| `/elo` | Elo | Ligaen rangert etter rating, med parametere og datagrunnlag |
| `/modell` | Modell | Kalibrering, EV-/odds-kvartiler, innsatssimulator og åpne funn |
| `/skygge` | Skyggelogg | Kampene som røk på en terskel, avregnet som ekte spill |

## 📂 Viktige filer
- `app/` – én mappe per rute; skjermene selv ligger i `components/`.
- `components/shell/` – header, footer og de to navene.
- `components/ui/` – delte primitiver (tilstander, piller, EV-terskelkontrollen).
- `lib/analysis.ts` – kalibrering, kvantilbøtter, bootstrap og innsatsregler.
- `lib/data.ts` – datalaget (statisk JSON eller API).
- `lib/format.ts` – all tallformatering. Ingen komponent formaterer selv.
- `types/index.ts` – typene for JSON-payloadene.

## 🛠️ Scripts
- `npm run dev` – utviklingsserver.
- `npm run build` – statisk eksport til `out/`. Det er hele produksjonsbygget; det finnes ingen `npm start` for en `output: 'export'`-app.
- `npm run lint` – ESLint. `npm run typecheck` – `tsc --noEmit`.
- `npm test` – de tre enhetstestene. `test:analysis` måler `lib/analysis.ts` mot fasiten i `docs/blalinja/stake_truth.json`, som regenereres av den daglige workflowen.

## 🧰 Stack
Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS v4,
lucide-react. Fontene er selvhostet via `next/font/google`.
