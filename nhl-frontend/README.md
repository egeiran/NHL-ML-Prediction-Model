# NHL Frontend (Next.js 15)

Next.js-app som viser modellens NHL-odds, value-board og bankroll/portefølje basert på FastAPI-backenden i `../NHL`.

## 📦 Kom i gang
Krav: Node 20+. Installer avhengigheter og start dev-server:
```bash
cd nhl-frontend
npm install
# pek mot API-et hvis det ikke kjører lokalt:
export NEXT_PUBLIC_API_BASE=http://localhost:8000
npm run dev
```
Appen kjører på `http://localhost:3000`. Prod: `npm run build && npm start`.

## 🔌 API-tilkobling
- Default i utvikling: `http://localhost:8000`. Sett `NEXT_PUBLIC_API_BASE` for et annet endepunkt.
- Bruker backend-rutene `/teams`, `/predict`, `/value-report` (alias `/value_report`), `/portfolio` og `/portfolio/update`.

## 🖥️ Funksjoner
- **Value board:** Kampene for i dag + 7 dager, med modellodds, markedodds og “best value” per utfall.
- **Portefølje:** Viser investert vs. verdi over tid (graf) og nøkkelstatistikk/ROI. Manuell oppdatering kaller `/portfolio/update`.
- **Egendefinert matchup:** Velg hjemmelag/bortelag, få sannsynligheter (Home/OT/Away), siste 5 kamper og nøkkelstatistikk.

## 📂 Viktige filer
- `app/page.tsx` – Hovedsiden.
- `components/` – Value board, portefølje, matchup-komponenter.
- `lib/format.ts` – Formatteringshjelpere.
- `types/index.ts` – Frontend-typer for API-responsene.

## 🛠️ Scripts
- `npm run dev` – Start utviklingsserver.
- `npm run build` – Bygg for produksjon.
- `npm start` – Start produsert build.
- `npm run lint` – ESLint.

## 🧰 Stack
- Next.js 15 (App Router), React 19, TypeScript.
- Tailwind CSS v4, lucide-react.
