# Markedsanalyse

_Generert 2026-11-23 21:37 UTC av `NHL/analyze_market.py`. Kun stdlib; tallene kan gjenskapes lokalt._

Basisrater (grunnserie 2005/06–2019/20): hjemme 43,0 %, OT/SO 23,3 %, borte 33,7 %.

## A. Modellen mot NT-markedet (HUB, bet-loggene)

376 avgjorte kamper med full 3-veis NT-odds (2026-09-28 – 2026-11-22).

**NT-margin på HUB:** snitt 11,5 %, median 12,0 %. Spiller man alt flatt, er det marginen man taper.

### Log loss (lavere er bedre)

| Utvalg | n | Basisrater | NT-marked | Modell | Modell − marked (95 % CI) |
| --- | ---: | ---: | ---: | ---: | --- |
| Alle | 376 | 1,0736 | 1,0269 | 1,0426 | 0,0156 [0,0037, 0,0280] – modellen dårligere |
| Før 2026-10-18 (Random Forest) | 133 | 1,0766 | 1,0233 | 1,0623 | 0,0390 [0,0127, 0,0648] – modellen dårligere |
| Fra 2026-10-18 (logistisk, dagens) | 243 | 1,0720 | 1,0289 | 1,0317 | 0,0028 [-0,0094, 0,0150] – ikke signifikant |

### Blanding: p ∝ marked^(1−w) · modell^w (i utvalget, ikke ut-av-utvalg)

| w | Log loss |
| ---: | ---: |
| 0,0 | 1,0269 |
| 0,1 | 1,0278 |
| 0,2 | 1,0288 |
| 0,3 | 1,0299 |
| 0,5 | 1,0327 |
| 0,7 | 1,0362 |
| 1,0 | 1,0426 |

Beste vekt på modellen: **w = 0,0**. Markedet alene er best – modellen tilfører ikke informasjon utover oddsen.

### Linjebevegelse fra beslutning til sluttodds (HUB)

234 kamper med sluttodds. Snitt |Δp(hjemme)| = 0,82 %. Korrelasjon mellom modellens uenighet med markedet og retningen markedet beveger seg: **0,059**. Nær null betyr at markedet ikke beveger seg mot modellen.

### ROI ved å spille alle utfall flatt, per oddsbøtte

| Odds | n | ROI |
| --- | ---: | ---: |
| < 1,70 | 41 | +18,6 % |
| 1,70–2,10 | 179 | -2,1 % |
| 2,10–2,60 | 300 | -13,8 % |
| 2,60–3,30 | 170 | -20,1 % |
| ≥ 3,30 | 62 | -41,7 % |
| Uavgjort | 376 | -10,4 % |

Favoritt/longshot-skjevhet: NT tar mer margin på underdogs enn på favoritter.

### Kalibrering, hjemmeseier (snitt predikert vs. faktisk per tredjedel)

| Kilde | Lav | Midt | Høy |
| --- | --- | --- | --- |
| NT-marked | 32,8 % / 24,8 % | 41,0 % / 36,0 % | 51,0 % / 57,9 % |
| Modell | 35,0 % / 30,4 % | 42,4 % / 36,8 % | 51,3 % / 51,6 % |

## B. Snapshot-loggen (alle NT-markeder + Pinnacle)

41 kjøringer, 268 NT-snapshots, 300 skarpe snapshots.

### NT-margin per marked (siste snapshot per kamp)

| Marked | Kamper | Snittmargin |
| --- | ---: | ---: |
| HUB (1X2) | 59 | 11,8 % |
| Vinner inkl. OT | 59 | 8,0 % |
| Uavgjort tilbakebetales | 59 | 8,0 % |
| Blir det overtid? | 59 | 7,2 % |
| Over/under 3.5 | 36 | 8,0 % |
| Over/under 4.5 | 59 | 8,1 % |
| Over/under 5.5 | 59 | 8,0 % |
| Over/under 6.5 | 59 | 8,0 % |
| Over/under 7.5 | 59 | 8,4 % |
| Over/under 8.5 | 23 | 8,1 % |

### NT vinner inkl. OT: bevegelse fra morgen (08 UTC) til siste snapshot før start

58 kamper. Snitt |Δp(hjemme)| = 1,17 %, andel kamper som flyttet seg > 1 pp: 50 %.

### NT vinner inkl. OT mot Pinnacle (samme kjøring)

241 parvise snapshots. Pinnacles margin: 2,7 %. NT − Pinnacle i margin-fri P(hjemme): snitt -0,10 %, sd 0,70 %.

Beste side hos NT har EV > 0 mot Pinnacle i **0,0 %** av tilfellene, EV > 3 % i 0,0 %. Snitt beste-EV: -5,5 %.

### Når bør den daglige kjøringen gå? (beslutning 3)

| Tidspunkt (UTC) | Kamper | Spill | Snitt EV mot close per kamp | Senere − 08 (95 % CI) |
| --- | ---: | ---: | ---: | --- |
| 08:xx | 59 | 0 | +0,00 % | – |
| 09:xx | 30 | 0 | +0,00 % | +0,00 % [+0,00 %, +0,00 %] (n=30) |
| 21:xx | 21 | 0 | +0,00 % | – |
| 22:xx | 2 | 0 | +0,00 % | – |
| 23:xx | 41 | 0 | +0,00 % | +0,00 % [+0,00 %, +0,00 %] (n=41) |
| 00:xx | 20 | 0 | +0,00 % | – |
| 01:xx | 6 | 0 | +0,00 % | – |
| 02:xx | 11 | 0 | +0,00 % | – |
| 03:xx | 21 | 0 | +0,00 % | – |
| 04:xx | 11 | 0 | +0,00 % | – |

Ingen senere kjøring slår 08 UTC signifikant på ≥ 300 kamper ennå – behold 08.

## C. Skyggestrategien ml-sharp-v1 (vinner inkl. OT mot Pinnacle)

59 kamper vurdert, 59 med Pinnacle-pris. 0 spill (0 åpne), 0 av 0 avgjorte vunnet, resultat +0 kr (ROI –).

**CLV mot Pinnacle-close:** snitt – på 0 spill, 90 %-CI [–, –]. Fremdrift mot 150 spill: 0 %. Kriteriet er ikke oppfylt ennå.

Grunner til å la være: below_ev 59.
