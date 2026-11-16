# Markedsanalyse

_Generert 2026-11-16 19:45 UTC av `NHL/analyze_market.py`. Kun stdlib; tallene kan gjenskapes lokalt._

Basisrater (grunnserie 2005/06–2019/20): hjemme 43,0 %, OT/SO 23,3 %, borte 33,7 %.

## A. Modellen mot NT-markedet (HUB, bet-loggene)

329 avgjorte kamper med full 3-veis NT-odds (2026-09-28 – 2026-11-15).

**NT-margin på HUB:** snitt 11,6 %, median 12,1 %. Spiller man alt flatt, er det marginen man taper.

### Log loss (lavere er bedre)

| Utvalg | n | Basisrater | NT-marked | Modell | Modell − marked (95 % CI) |
| --- | ---: | ---: | ---: | ---: | --- |
| Alle | 329 | 1,0752 | 1,0231 | 1,0408 | 0,0177 [0,0042, 0,0308] – modellen dårligere |
| Før 2026-10-18 (Random Forest) | 133 | 1,0766 | 1,0233 | 1,0623 | 0,0390 [0,0127, 0,0648] – modellen dårligere |
| Fra 2026-10-18 (logistisk, dagens) | 196 | 1,0742 | 1,0230 | 1,0262 | 0,0032 [-0,0103, 0,0165] – ikke signifikant |

### Blanding: p ∝ marked^(1−w) · modell^w (i utvalget, ikke ut-av-utvalg)

| w | Log loss |
| ---: | ---: |
| 0,0 | 1,0231 |
| 0,1 | 1,0241 |
| 0,2 | 1,0253 |
| 0,3 | 1,0266 |
| 0,5 | 1,0298 |
| 0,7 | 1,0337 |
| 1,0 | 1,0408 |

Beste vekt på modellen: **w = 0,0**. Markedet alene er best – modellen tilfører ikke informasjon utover oddsen.

### Linjebevegelse fra beslutning til sluttodds (HUB)

190 kamper med sluttodds. Snitt |Δp(hjemme)| = 0,82 %. Korrelasjon mellom modellens uenighet med markedet og retningen markedet beveger seg: **0,042**. Nær null betyr at markedet ikke beveger seg mot modellen.

### ROI ved å spille alle utfall flatt, per oddsbøtte

| Odds | n | ROI |
| --- | ---: | ---: |
| < 1,70 | 37 | +26,9 % |
| 1,70–2,10 | 158 | -5,0 % |
| 2,10–2,60 | 259 | -13,6 % |
| 2,60–3,30 | 148 | -19,6 % |
| ≥ 3,30 | 56 | -51,1 % |
| Uavgjort | 329 | -10,0 % |

Favoritt/longshot-skjevhet: NT tar mer margin på underdogs enn på favoritter.

### Kalibrering, hjemmeseier (snitt predikert vs. faktisk per tredjedel)

| Kilde | Lav | Midt | Høy |
| --- | --- | --- | --- |
| NT-marked | 32,6 % / 24,8 % | 40,9 % / 33,6 % | 51,1 % / 59,1 % |
| Modell | 35,0 % / 30,3 % | 42,5 % / 35,5 % | 51,4 % / 51,8 % |

## B. Snapshot-loggen (alle NT-markeder + Pinnacle)

6 kjøringer, 19 NT-snapshots, 19 skarpe snapshots.

### NT-margin per marked (siste snapshot per kamp)

| Marked | Kamper | Snittmargin |
| --- | ---: | ---: |
| HUB (1X2) | 7 | 11,4 % |
| Vinner inkl. OT | 7 | 7,9 % |
| Uavgjort tilbakebetales | 7 | 7,8 % |
| Blir det overtid? | 7 | 7,2 % |
| Over/under 3.5 | 3 | 8,0 % |
| Over/under 4.5 | 7 | 7,9 % |
| Over/under 5.5 | 7 | 7,8 % |
| Over/under 6.5 | 7 | 8,1 % |
| Over/under 7.5 | 7 | 8,1 % |
| Over/under 8.5 | 4 | 8,2 % |

### NT vinner inkl. OT: bevegelse fra morgen (08 UTC) til siste snapshot før start

_Ikke nok data ennå (n=5, trenger 30)._

### NT vinner inkl. OT mot Pinnacle (samme kjøring)

_Ikke nok data ennå (n=18, trenger 30)._

### Når bør den daglige kjøringen gå? (beslutning 3)

_Ikke nok data ennå (n=7, trenger 300)._ Regelen: flytt bare hvis et senere tidspunkt gir høyere EV mot Pinnacle-close, med 95 %-CI som utelukker 0, på minst 300 kamper.

## C. Skyggestrategien ml-sharp-v1 (vinner inkl. OT mot Pinnacle)

7 kamper vurdert, 7 med Pinnacle-pris. 0 spill (0 åpne), 0 av 0 avgjorte vunnet, resultat +0 kr (ROI –).

**CLV mot Pinnacle-close:** snitt – på 0 spill, 90 %-CI [–, –]. Fremdrift mot 150 spill: 0 %. Kriteriet er ikke oppfylt ennå.

Grunner til å la være: below_ev 7.
