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

- [x] **OT/SO-spill hadde ingen edge.** Modellen anslo i snitt 33 % sjanse for
  OT/SO på de kampene den flagget som value; faktisk endte 22 % slik. Det er
  ikke en generell skjevhet i modellen – på en kronologisk backtest treffer den
  22,6 % faktisk mot 20,6 % predikert i snitt, altså litt for lavt. Feilen
  ligger i *seleksjonen*: vi spiller kun når modellen sier et ekstremt tall, og
  nettopp der er den minst pålitelig.

  `calibrate_draw.py` viser at ingen skalering av draw-proben redder dette. Ved
  den best kalibrerte multiplikatoren (1.15) passerer 291 av 4 436 testkamper
  EV-terskelen med 23,0 % treff – ROI −10 %. Ved dagens 0.95 passerer 60 kamper
  med 16,7 % treff – ROI −35 %. Å skru opp multiplikatoren gjør altså bare at vi
  spiller mer av noe som taper.

  OT/SO-spill legges derfor ikke inn lenger (`NHL_ALLOW_DRAW_BETS=1` skrur dem
  på igjen). I `bet_history.csv` sto de for 26 spill og −640 kr, mens resten av
  porteføljen er +675 kr.

  De forsvinner ikke ut av datagrunnlaget: hvert OT/SO-spill vi *ville* tatt
  føres i `data/bet_shadow.csv` med full innsats og avregnes med samme logikk
  som ekte spill. Da måler vi løpende om beslutningen var riktig i stedet for å
  anta det. Value-rapporten viser OT/SO-odds og EV som før.


## Åpne funn (ikke fikset)
- [ ] **Modellen er globalt overkonfident.** På de 202 spillene i historikken
  forventet modellen 85,5 treff, markedet forventet 66,4, og 68 skjedde.
  Markedet er godt kalibrert på denne porteføljen; modellen ligger cirka 26 %
  for høyt. Det gjelder *hvert* spill vi legger inn, ikke bare OT/SO, og er
  dermed et større problem enn både Utah-feilen og uavgjort-seleksjonen.
  Sannsynlig retning: kalibrer sannsynlighetene (isotonisk eller Platt) på en
  kronologisk holdout før EV regnes ut, i stedet for å bruke Random Forest-ens
  rå `predict_proba`.
- [ ] **Loggene lagrer bare det valgte utfallet.** `model_prob` og
  `implied_prob` finnes kun for utfallet vi spilte, ikke for alle tre. Det gir
  seleksjonsskjevhet i all etteranalyse – vi kan ikke se hva modellen mente om
  de to andre utfallene. Å logge alle tre per kamp ville fjernet den
  begrensningen for framtidige undersøkelser.
