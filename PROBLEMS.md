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
  2025-12-06 til 2026-04-17 ble lagt inn på feilaktig grunnlag (1 av 14 traff,
  −1 165 kr). Radene står bevisst urørt – historikken er en logg over
  beslutninger som faktisk ble tatt, ikke over hva modellen burde ha gjort. Skal
  du måle modellkvalitet på historikken, ekskluder disse radene:

  ```python
  affected = (df["date"] <= "2026-04-17") & (
      df[["home_abbr", "away_abbr"]].isin({"UTA", "ARI"}).any(axis=1)
  )
  ```

  Merk at tapet ikke kan tilskrives feilen i sin helhet: −500 av −1 165 kr ligger
  på OT/SO-bets, som taper uavhengig av lag (se under). Etter markedets egne odds
  var forventningen 4,6 treff av 14; sannsynligheten for 1 eller færre er 2,8 %,
  så uflaks er usannsynlig, men ikke utelukket.

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
