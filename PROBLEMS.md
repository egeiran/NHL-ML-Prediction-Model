# PROBLEMS

## Bet selection and value logic
- [x] Value/edge based on normalized implied probabilities could show positive value on negative-EV bets. Now uses EV per unit: `model_prob * odds - 1`.
- [x] Rounding before filtering could include or exclude borderline bets. Selection now uses raw values; rounding is only for display.
- [x] Best-value picks were possible with incomplete odds. Bets are now only considered when all H/D/A odds are present.

## Data integrity and safety checks
- [x] Implied probabilities were normalized even when odds were missing, distorting the displayed market view. Now uses raw `1/odds` and leaves missing odds as `None`.
- [x] Prefetched reports could bypass odds completeness. `record_new_bets` and `_choose_best_per_day` now enforce complete odds.
- [x] Value fields in bet history now match the selection logic (EV), avoiding mismatches between report and stored bets.

## UI and tooling alignment
- [x] Frontend label for value implied a model-minus-market diff. Updated to “Forventet EV” and percent display.
- [x] `NHL/predict_with_odds.py` aligned with EV-based value so CLI reports match API and bet tracker.

## Kjente datavinduer (påvirker evaluering av historikken)
- [x] **Utah-form var feil t.o.m. 2026-04-17.** `build_live_features` sendte den
  kanoniske forkortelsen (`ARI`) til formberegningen, mens kampene fra NHL-APIet
  er merket `UTA`. Hjemme/borte-sjekken traff derfor aldri, og alle Utahs
  hjemmekamper ble lest som bortekamper med mål for/mot byttet om – modellen så
  et lag som tapte hver hjemmekamp. Fikset i `live_feature_builder.py`; låst av
  `test_site_export.py::utah_alias_form`.

  **Konsekvens for `data/bet_history.csv`:** 14 bets med Utah i perioden
  2025-12-06 til 2026-04-17 ble lagt inn på korrupt form-grunnlag (1 av 14 traff,
  −1 165 kr). Radene står bevisst urørt – historikken er en logg over
  beslutninger som faktisk ble tatt, ikke over hva modellen burde ha gjort. Skal
  du måle modellkvalitet på historikken, ekskluder disse radene:

  ```python
  affected = (df["date"] <= "2026-04-17") & (
      df[["home_abbr", "away_abbr"]].isin({"UTA", "ARI"}).any(axis=1)
  )
  ```

  **Men tapet skyldes i hovedsak flaks, ikke feilen.** En audit med 2 304 parvise
  scenarier gjennom den ekte modellen viser at feilen forskyver predikert
  sannsynlighet med typisk 2–3 prosentpoeng, med et snitt på −0,2 pp. Selv om
  form-featurene er kraftig skjeve (seiersrate −8 pp), drukner det i Elo, som
  dominerer nivået. Feilen er altså støy med sd ≈ 3,9 pp, ikke en systematisk
  nedvurdering. Kontrollene bekrefter det:

  - Modellens uenighet med markedet er statistisk identisk for Utah og resten
    (Mann-Whitney p = 0,96), og andelen som passerte EV-terskelen er lik
    (26,5 % mot 27,5 %).
  - Calgary har nesten samme profil – 1 treff av 12, −930 kr – uten at noen feil
    er i nærheten.
  - P(1 treff eller færre av 14) = 2,8 %, men på tvers av 32 lag er det ventet
    at 0,9 lag havner under 2,8 % ved ren tilfeldighet. Vi fant ett.

  Anslått attribusjon: cirka −280 kr (24 %) kan tilskrives feilen i øvre ende,
  resten er varians. Avregnes de 14 spillene med treffraten resten av porteføljen
  faktisk hadde per utfallstype, ender de på −6 kr.

  Ett reelt utslag av feilen står igjen: Utah fikk uforholdsmessig mange
  OT/SO-spill (5 av 14 mot en basisrate på 11,2 %, p = 0,015 ukorrigert). Med
  faste uavgjort-odds rundt 3,90 ligger terskelen langt ute i halen, og støy fra
  feilen løfter kryssingsraten 1,5–5x. Det forklarer −98 kr.

- [x] **Sluttspillkamper ble spilt uten ferske Elo-ratings.** `update_elo_ratings.py`
  henter med `include_playoffs=False`, så ratingene fryser på siste
  grunnseriekamp og blir mer utdaterte for hver runde. Modellen predikerte
  likevel videre, uten å vite at featurene sto stille. I sluttspillet 2026 ga
  det −525 kr på 20 spill (−26 % ROI) mot +3,1 % i grunnserien.

  De 20 radene er fjernet fra `bet_history.csv`, og `bet_tracker` slår nå opp
  NHLs `gameType` og spiller bare grunnserie (2). Preseason (1) er ute av samme
  grunn: Elo oppdateres ikke der heller. `NHL_ALLOW_ALL_GAME_TYPES=1` skrur
  filteret av.


## Åpne funn (ikke fikset)
- [ ] **OT/SO-spill har ingen påvist edge, men spilles igjen.** Modellen anslo i
  snitt 33 % sjanse for OT/SO på kampene den flagget som value; faktisk endte
  22 % slik. Det er ikke en generell skjevhet i modellen – på en kronologisk
  backtest treffer den 22,6 % faktisk mot 20,6 % predikert. Feilen ligger i
  *seleksjonen*: vi spiller kun når modellen sier et ekstremt tall, og nettopp
  der er den minst pålitelig.

  `calibrate_draw.py` viser at ingen skalering av draw-proben redder dette. Ved
  den best kalibrerte multiplikatoren (1.15) passerer 291 av 4 436 testkamper
  EV-terskelen med 23,0 % treff – ROI −10 %. Ved dagens 0.95 passerer 60 kamper
  med 16,7 % treff – ROI −35 %. Å skru opp multiplikatoren gjør bare at vi
  spiller mer av noe som taper.

  Spillene var slått av en periode, men er skrudd på igjen med **egen terskel på
  EV > 0,30** (`NHL_DRAW_VALUE_MIN`). Begrunnelsen er strukturell, ikke
  statistisk: permutasjonstesten på de 26 spillene gir p = 0,151, altså ikke
  signifikant. Men Norsk Tipping holder OT/SO-oddsen praktisk talt fast – alle
  26 lå mellom 3,80 og 3,95, median 3,90 – mens hjemme- og borteoddsen beveger
  seg med markedet. Samme EV-terskel måler derfor to ulike ting. Med odds 3,90
  krever EV > 0,15 at modellen sier p > 29,5 % mot en basisrate på ~22 %; det
  er en påstand den ikke har vist evne til å innfri (19,2 % treff, 33,4 %
  predikert). EV > 0,30 tilsvarer p > 33,6 %.

  Funnet står som åpent fordi tallene over ikke er motbevist – vi har hevet
  lista og måler videre i stedet for å slå dem av. `NHL_ALLOW_DRAW_BETS=0` tar
  dem helt ut.
- [ ] **Modellen er globalt overkonfident.** På de 182 spillene i historikken
  forventet modellen 76,7 treff, markedet forventet 59,5, og 63 skjedde.
  Markedet er godt kalibrert på denne porteføljen; modellen ligger cirka 22 %
  for høyt. Det gjelder *hvert* spill vi legger inn, ikke bare OT/SO, og er
  dermed et større problem enn både Utah-feilen og uavgjort-seleksjonen.
  Sannsynlig retning: kalibrer sannsynlighetene (isotonisk eller Platt) på en
  kronologisk holdout før EV regnes ut, i stedet for å bruke Random Forest-ens
  rå `predict_proba`.
- [ ] **EV er ikke informativ nok til å skalere innsatsen etter.** Undersøkt i
  `NHL/analyze_stake_sizing.py` (teoretisk omregning av de 182 avregnede spillene
  – ingen logger endres). Korrelasjonen mellom EV og realisert avkastning per
  krone er r = −0,02 (permutasjonstest p = 0,81): sammenhengen finnes ikke i
  dataen. Delt i EV-kvartiler ligger ROI på −5 %, −3 %, +32 %, −11 % – hele
  resultatet sitter i tredje kvartil, ikke i den høyeste. Å satse mer på høy EV
  gjør derfor bare varians dyrere: lineær skalering gir −209 kr mot flat innsats,
  kvadratisk −880 kr, ved lik omsetning. Ingen av regimene har et
  bootstrap-intervall som utelukker null.

  To ting er verdt å merke seg videre:
  - Lineær krymping av sannsynligheten mot markedet endrer **ikke** rangeringen.
    Siden `implied_prob = 1/odds` gir λ·(1/o) + (1−λ)·p at p·o − 1 skaleres med
    (1−λ), så «kalibrering mot markedet» *er* fraksjonell Kelly. Skal kalibrering
    flytte på hvilke spill som prioriteres, må den være ikke-lineær (Platt).
  - Kelly slår flat innsats med +606 kr, men gevinsten kommer fra odds-leddet,
    ikke EV-leddet: en regel som satser 1/(odds−1) og **ignorerer EV helt** gir
    +795 kr. Odds-kvartilene peker samme vei (+49 %, −12 %, −25 %, +1 %), men
    korrelasjonen odds ↔ avkastning er heller ikke signifikant (p = 0,20), så
    dette er en hypotese å teste videre – ikke et etablert funn.

  Ekte Kelly med sammensatt bankrull er direkte farlig med dagens overkonfidens:
  full Kelly ender på −73 %, halv Kelly −12 %, kvart Kelly +23 %, mot flat +2,8 %.
  Konklusjon: behold flat innsats til sannsynlighetene er kalibrert.

- [ ] **Loggene lagrer bare det valgte utfallet.** `model_prob` og
  `implied_prob` finnes kun for utfallet vi spilte, ikke for alle tre. Det gir
  seleksjonsskjevhet i all etteranalyse – vi kan ikke se hva modellen mente om
  de to andre utfallene. Å logge alle tre per kamp ville fjernet den
  begrensningen for framtidige undersøkelser.
