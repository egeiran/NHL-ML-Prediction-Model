# Re-prediksjon 2026-27 uten preseason i formen

Generert 2026-10-17 14:58 UTC av `NHL/repredict_season.py`. 133 kamper fra porteføljen og skyggeloggen, med oddsen som faktisk ble logget. Loggene er ikke endret.

## Kontroll: gjenskaper vi det produksjonen gjorde?

Gammel modell + gammel form + Elo-fila fra commiten som la inn raden: snittavvik 0.0003 mot loggede sannsynligheter, største avvik 0.0005 (loggen er avrundet til tre desimaler). Elo-kilde: git 133.

## Hvor mye preseason var det i formen?

Første uke av sesongen var 74 % av kampene i 5-kampersvinduet preseason-kamper. Snittavviket mellom «gjenskapt» og «uten preseason» er 0.030 per utfall over hele perioden.

## Hva ville blitt spilt?

Samme terskler som produksjonen: EV > 0.15 hjemme/borte, > 0.30 uavgjort, odds < 4.00.

| Variant | Spill | Avgjort | Treff | Resultat | ROI | Åpne |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Logget (faktisk portefølje) | 21 | 18 | 2 | -1350 kr | -75.0 % | 3 |
| Gjenskapt (gammel modell, med preseason) | 21 | 18 | 2 | -1350 kr | -75.0 % | 3 |
| Gammel modell uten preseason | 19 | 17 | 3 | -975 kr | -57.4 % | 2 |
| Ny modell | 2 | 2 | 0 | -200 kr | -100.0 % | 0 |
| Ny modell + sperre (< 5 kamper) | 0 | 0 | 0 | +0 kr | +0.0 % | 0 |

Små tall: et par treff fra eller til snur ROI-en. Tabellen viser hva preseason-feilen gjorde med *utvalget*, ikke om modellen har en kant.

## Kamp for kamp (der minst én variant spiller)

| Dato | Kamp | Utfall | Logget | Uten pre | Ny | Ny + sperre | Preseason w5 (H/B) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-29 | FLA @ CAR | draw | home @ 2.25 ✗ | home @ 2.25 ✗ | – | – | 4/4 |
| 2026-09-29 | NYR @ BOS | home | home @ 2.35 ✓ | – | – | – | 4/4 |
| 2026-09-30 | NYI @ TOR | home | – | away @ 2.50 ✗ | – | – | 4/4 |
| 2026-10-01 | PHI @ NJD | draw | away @ 2.95 ✗ | – | – | – | 4/4 |
| 2026-10-01 | SEA @ CGY | away | home @ 2.35 ✗ | – | – | – | 4/4 |
| 2026-10-01 | EDM @ VAN | away | home @ 3.70 ✗ | home @ 3.70 ✗ | home @ 3.70 ✗ | – | 4/4 |
| 2026-10-02 | WSH @ CAR | away | – | home @ 2.05 ✗ | – | – | 4/4 |
| 2026-10-03 | UTA @ CBJ | away | home @ 2.35 ✗ | – | – | – | 4/4 |
| 2026-10-03 | SEA @ EDM | home | away @ 3.35 ✗ | – | – | – | 3/4 |
| 2026-10-03 | BOS @ MIN | home | – | away @ 3.30 ✗ | – | – | 4/3 |
| 2026-10-04 | VGK @ VAN | away | home @ 3.90 ✗ | home @ 3.90 ✗ | – | – | 2/3 |
| 2026-10-05 | PHI @ TBL | home | away @ 3.50 ✗ | – | – | – | 3/2 |
| 2026-10-06 | MIN @ BUF | draw | – | home @ 2.30 ✗ | – | – | 3/3 |
| 2026-10-06 | NSH @ TOR | draw | – | away @ 2.80 ✗ | – | – | 2/3 |
| 2026-10-07 | COL @ WPG | home | – | home @ 3.05 ✓ | – | – | 2/3 |
| 2026-10-08 | DAL @ BUF | away | home @ 2.45 ✗ | home @ 2.45 ✗ | – | – | 2/2 |
| 2026-10-08 | PHI @ OTT | home | away @ 2.95 ✗ | – | – | – | 2/1 |
| 2026-10-08 | COL @ CGY | away | home @ 3.80 ✗ | home @ 3.80 ✗ | home @ 3.80 ✗ | – | 2/2 |
| 2026-10-10 | CAR @ CHI | away | home @ 3.95 ✗ | home @ 3.95 ✗ | – | – | 0/0 |
| 2026-10-10 | DAL @ PIT | draw | home @ 3.00 ✗ | – | – | – | 0/1 |
| 2026-10-11 | CAR @ PHI | away | home @ 3.25 ✗ | home @ 3.25 ✗ | – | – | 0/0 |
| 2026-10-13 | STL @ OTT | away | home @ 2.30 ✗ | home @ 2.30 ✗ | – | – | 0/0 |
| 2026-10-14 | MTL @ WSH | home | home @ 2.15 ✓ | home @ 2.15 ✓ | – | – | 0/0 |
| 2026-10-15 | NYR @ NJD | home | away @ 2.70 ✗ | – | – | – | 0/0 |
| 2026-10-15 | STL @ MIN | home | – | home @ 2.05 ✓ | – | – | 0/0 |
| 2026-10-15 | SJS @ NSH | draw | – | home @ 2.05 ✗ | – | – | 0/0 |
| 2026-10-17 | NJD @ WSH | åpen | home @ 2.20 | – | – | – | 0/0 |
| 2026-10-17 | CAR @ WPG | åpen | home @ 3.05 | home @ 3.05 | – | – | 0/0 |
| 2026-10-17 | PIT @ VGK | åpen | away @ 3.80 | away @ 3.80 | – | – | 0/0 |
