# NHL Prediction Model - Full Stack Setup

Dette prosjektet består av:
1. **FastAPI Backend** - REST API for prediksjoner
2. **Next.js Frontend** - Moderne web-app

## 🚀 Komme i gang

### 1. Start Backend (FastAPI)

```bash
# Gå til NHL-mappen
cd NHL

# Kjør API-serveren
python api.py
```

API-en vil kjøre på `http://localhost:8000`

Du kan besøke `http://localhost:8000/docs` for å se automatisk API-dokumentasjon!

### 2. Start Frontend (Next.js)

I et nytt terminalvindu:

```bash
# Gå til frontend-mappen
cd nhl-frontend

# Installer dependencies (første gang)
npm install

# Start utviklingsserver
npm run dev
```

Frontend vil kjøre på `http://localhost:3000`

## 📋 API Endpoints

- `GET /` - API info
- `GET /teams` - Liste over alle tilgjengelige lag
- `POST /predict` - Gjør en prediksjon
  ```json
  {
    "home_team": "BOS",
    "away_team": "MTL"
  }
  ```
- `GET /value-report` - Modell + odds + value-gap for de neste dagene
- `GET /portfolio` - Henter lagret bet-historikk og tidsserie for graf
- `POST /portfolio/update` - Kjører daglig oppdatering (henter nye value-bets og avregner ferdige)

## 🎨 Features

### Frontend
- ✅ Moderne UI med Tailwind CSS
- ✅ Responsivt design
- ✅ Velg hjemme- og bortelag
- ✅ Viser prediksjoner med sannsynligheter
- ✅ Viser siste 5 kamper for begge lag
- ✅ Viser statistikk (mål, record, vinn%)

### Backend
- ✅ FastAPI REST API
- ✅ Automatisk API-dokumentasjon
- ✅ CORS-støtte for frontend
- ✅ Data caching for raskere respons
- ✅ Validering med Pydantic

## 🛠️ Teknologi

**Backend:**
- Python 3.8+
- FastAPI
- Pandas
- Scikit-learn

**Frontend:**
- Next.js 14
- TypeScript
- Tailwind CSS
- React

## 📁 Prosjektstruktur

```
Prediction Model/
├── NHL/
│   ├── api.py                    # FastAPI backend
│   ├── predict.py                # CLI prediksjon
│   ├── train_model.py            # Modelltrening
│   ├── requirements-api.txt      # Python dependencies
│   ├── data/
│   │   ├── game.csv
│   │   └── team_info.csv
│   ├── models/
│   │   └── nhl_model.pkl
│   └── utils/
│       ├── data_loader.py
│       ├── feature_engineering.py
│       └── model_utils.py
└── nhl-frontend/
    ├── app/
    │   └── page.tsx              # Hovedside
    ├── components/
    │   ├── TeamSelector.tsx      # Lag-velger
    │   └── PredictionResults.tsx # Resultat-visning
    ├── types/
    │   └── index.ts              # TypeScript types
    └── package.json
```

## 🎯 Bruk

1. Start både backend og frontend
2. Åpne `http://localhost:3000` i nettleseren
3. Velg hjemmelag og bortelag
4. Klikk "Prediker resultat"
5. Se prediksjoner og statistikk!

## 🔁 Automatisk value-tracking

1. **Data lagres i** `NHL/data/bet_history.csv` (opprettes automatisk).
2. **Kjør daglig oppdatering** (cron, scheduled job eller manuelt):
   ```bash
   cd NHL
   python bet_tracker.py
   ```
   Dette:
   - Avregner ferdige kamper og oppdaterer profit.
   - Legger til beste value-bet per dag frem i tid (standard stake 100 kr).
3. **Graf / frontend**: hent `GET /portfolio` fra backend for data (investert vs. verdi). `POST /portfolio/update` kan brukes fra et cron kall hvis du vil trigge via API.
4. **Tilpasninger**: juster stake/minimum value i `bet_tracker.update_daily_bets` eller ved å sende body til `/portfolio/update`:
   ```json
   { "days_ahead": 1, "stake_per_bet": 100, "min_value": 0.01 }
   ```

## 🐛 Feilsøking

### Backend starter ikke
- Sjekk at alle dependencies er installert: `pip install -r requirements-api.txt`
- Sjekk at du er i riktig mappe (NHL/)

### Frontend viser feil
- Sjekk at backend kjører på port 8000
- Sjekk nettverkstaben i browser developer tools
- Prøv å restart frontend: `npm run dev`

## 📝 Videre utvikling

Ideer til forbedringer:
- [ ] Legg til flere statistikker (powerplay, shots, etc.)
- [ ] Historikk av prediksjoner
- [ ] Sammenligning av lag
- [ ] Grafer og visualiseringer
- [ ] Lagre favorittlag
- [ ] Dark mode
- [ ] Deploy til produksjon (Vercel + Railway/Render)
