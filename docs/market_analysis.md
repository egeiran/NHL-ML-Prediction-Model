# Markedsanalyse

_Generert 2026-11-14 21:01 UTC av `NHL/analyze_market.py`. Kun stdlib; tallene kan gjenskapes lokalt._

Basisrater (grunnserie 2005/06–2019/20): hjemme 43,0 %, OT/SO 23,3 %, borte 33,7 %.

## A. Modellen mot NT-markedet (HUB, bet-loggene)

310 avgjorte kamper med full 3-veis NT-odds (2026-09-28 – 2026-11-13).

**NT-margin på HUB:** snitt 11,6 %, median 12,1 %. Spiller man alt flatt, er det marginen man taper.

### Log loss (lavere er bedre)

| Utvalg | n | Basisrater | NT-marked | Modell | Modell − marked (95 % CI) |
| --- | ---: | ---: | ---: | ---: | --- |
| Alle | 310 | 1,0740 | 1,0192 | 1,0372 | 0,0180 [0,0041, 0,0319] – modellen dårligere |
| Før 2026-10-18 (Random Forest) | 133 | 1,0766 | 1,0233 | 1,0623 | 0,0390 [0,0127, 0,0648] – modellen dårligere |
| Fra 2026-10-18 (logistisk, dagens) | 177 | 1,0720 | 1,0161 | 1,0183 | 0,0022 [-0,0123, 0,0163] – ikke signifikant |

### Blanding: p ∝ marked^(1−w) · modell^w (i utvalget, ikke ut-av-utvalg)

| w | Log loss |
| ---: | ---: |
| 0,0 | 1,0192 |
| 0,1 | 1,0202 |
| 0,2 | 1,0214 |
| 0,3 | 1,0227 |
| 0,5 | 1,0260 |
| 0,7 | 1,0299 |
| 1,0 | 1,0372 |

Beste vekt på modellen: **w = 0,0**. Markedet alene er best – modellen tilfører ikke informasjon utover oddsen.

### Linjebevegelse fra beslutning til sluttodds (HUB)

173 kamper med sluttodds. Snitt |Δp(hjemme)| = 0,83 %. Korrelasjon mellom modellens uenighet med markedet og retningen markedet beveger seg: **0,065**. Nær null betyr at markedet ikke beveger seg mot modellen.

### ROI ved å spille alle utfall flatt, per oddsbøtte

| Odds | n | ROI |
| --- | ---: | ---: |
| < 1,70 | 35 | +29,4 % |
| 1,70–2,10 | 149 | -4,7 % |
| 2,10–2,60 | 245 | -14,2 % |
| 2,60–3,30 | 138 | -20,1 % |
| ≥ 3,30 | 53 | -66,7 % |
| Uavgjort | 310 | -8,3 % |

Favoritt/longshot-skjevhet: NT tar mer margin på underdogs enn på favoritter.

### Kalibrering, hjemmeseier (snitt predikert vs. faktisk per tredjedel)

| Kilde | Lav | Midt | Høy |
| --- | --- | --- | --- |
| NT-marked | 32,6 % / 25,2 % | 40,9 % / 35,0 % | 51,0 % / 60,6 % |
| Modell | 35,1 % / 32,0 % | 42,6 % / 35,9 % | 51,3 % / 52,9 % |

## B. Snapshot-loggen (alle NT-markeder + Pinnacle)

0 kjøringer, 0 NT-snapshots, 0 skarpe snapshots.

_Ikke nok data ennå (n=0, trenger 1)._

## C. Skyggestrategien ml-sharp-v1 (vinner inkl. OT mot Pinnacle)

_Ingen kamper vurdert ennå._
