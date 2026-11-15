# Modellevaluering (walk-forward)

_Generert av `NHL/evaluate_models.py` på 29918 grunnseriekamper (game.csv + NHL-APIet). Testsesonger: 2015/16, 2016/17, 2017/18, 2018/19, 2019/20, 2020/21, 2021/22, 2022/23, 2023/24, 2024/25, 2025/26, 13524 kamper. Hver sesong er testet med modellen trent på alle sesongene før._

Log loss: lavere er bedre. Δ er forskjellen mot M1 (dagens modell) per kamp med parret bootstrap, 95 %-intervall. Negativ Δ betyr bedre enn i dag. Kalibreringsstigning 1,0 = perfekt; under 1 = overkonfident.

| | Modell | LL ordinær tid (HUB) | Δ mot M1 | LL vinner inkl. OT | Δ mot M1 | Kalibrering ML |
| --- | --- | ---: | --- | ---: | --- | ---: |
| M0 | Basisrater | 1,0669 | 0,0219 [0,0185, 0,0251] | 0,6900 | 0,0203 [0,0171, 0,0234] | – |
| M1 | Dagens: logistisk, Elo + b2b | 1,0451 | – | 0,6697 | – | 1,06 |
| M2 | Binær logistisk på vinner inkl. OT | – | – | 0,6696 | -0,0001 [-0,0003, 0,0001] | 1,09 |
| M3 | Tunet Elo + b2b | 1,0444 | -0,0006 [-0,0011, -0,0002] ✓ | 0,6692 | -0,0005 [-0,0009, -0,0000] ✓ | 1,04 |
| M4 | M3 + hvile/reise | 1,0447 | -0,0003 [-0,0010, 0,0003] | 0,6693 | -0,0004 [-0,0009, 0,0002] | 1,04 |
| M5 | M4 + MoneyPuck (xG, skudd, GSAx) | 1,0411 | -0,0039 [-0,0055, -0,0024] ✓ | 0,6661 | -0,0036 [-0,0050, -0,0021] ✓ | 0,98 |
| M6 | HistGradientBoosting | 1,0461 | 0,0011 [-0,0008, 0,0030] | 0,6695 | -0,0002 [-0,0018, 0,0013] | 1,06 |
| M7 | Poisson-målmodell | 1,0410 | -0,0040 [-0,0055, -0,0025] ✓ | 0,6664 | -0,0033 [-0,0046, -0,0021] ✓ | 1,14 |

✓ = signifikant bedre enn dagens modell (hele intervallet under null).

## Per sesong, vinner inkl. OT (log loss)

| Sesong | n | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2015/16 | 1230 | 0,6923 | 0,6819 | 0,6818 | 0,6827 | 0,6829 | 0,6771 | 0,6776 | 0,6771 |
| 2016/17 | 1230 | 0,6864 | 0,6736 | 0,6734 | 0,6720 | 0,6719 | 0,6700 | 0,6754 | 0,6707 |
| 2017/18 | 1271 | 0,6855 | 0,6704 | 0,6702 | 0,6700 | 0,6696 | 0,6682 | 0,6733 | 0,6689 |
| 2018/19 | 1271 | 0,6908 | 0,6763 | 0,6760 | 0,6765 | 0,6776 | 0,6750 | 0,6770 | 0,6752 |
| 2019/20 | 1094 | 0,6917 | 0,6809 | 0,6804 | 0,6805 | 0,6804 | 0,6792 | 0,6796 | 0,6786 |
| 2020/21 (uten publikum) | 868 | 0,6913 | 0,6594 | 0,6597 | 0,6581 | 0,6584 | 0,6547 | 0,6634 | 0,6568 |
| 2021/22 | 1312 | 0,6907 | 0,6499 | 0,6500 | 0,6486 | 0,6494 | 0,6454 | 0,6546 | 0,6476 |
| 2022/23 | 1312 | 0,6931 | 0,6593 | 0,6595 | 0,6588 | 0,6592 | 0,6545 | 0,6579 | 0,6551 |
| 2023/24 | 1312 | 0,6898 | 0,6592 | 0,6592 | 0,6594 | 0,6588 | 0,6571 | 0,6584 | 0,6567 |
| 2024/25 | 1312 | 0,6859 | 0,6650 | 0,6647 | 0,6644 | 0,6639 | 0,6607 | 0,6632 | 0,6604 |
| 2025/26 | 1312 | 0,6933 | 0,6904 | 0,6903 | 0,6900 | 0,6900 | 0,6854 | 0,6845 | 0,6830 |

## Tidlig i sesongen (vinner inkl. OT, minst antall kamper spilt av de to lagene)

| Kamper spilt | n | M0 | M1 | Beste kandidat |
| --- | ---: | ---: | ---: | ---: |
| 0–4 | 926 | 0,6864 | 0,6696 | 0,6685 (M5) |
| 5–9 | 889 | 0,6892 | 0,6747 | 0,6676 (M5) |
| 10–19 | 1732 | 0,6917 | 0,6818 | 0,6828 (M5) |
| 20–99 | 9977 | 0,6901 | 0,6672 | 0,6629 (M5) |

## Elo-tuning (validering 2010/11–2014/15, log loss ordinær tid)

| | K | Hjemmefordel | Regresjon | OT-score | MoV | LL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 6 | 35 | 0.85 | 0.75 | 1 | 1,0596 |
| 2 | 6 | 50 | 0.85 | 0.75 | 1 | 1,0596 |
| 3 | 6 | 65 | 0.85 | 0.75 | 1 | 1,0596 |
| 4 | 4 | 35 | 0.7 | 0.75 | 1 | 1,0596 |
| 5 | 6 | 35 | 0.7 | 0.75 | 1 | 1,0596 |
| prod | 6 | 50 | 0.7 | 0.6 | 0 | 1,0603 |

## Konklusjon

**M5 slår dagens modell signifikant på vinner inkl. OT** (Δ -0,0036 per kamp, bedre i 11 av 11 sesonger). Forbedringer i log loss på 0,00x-nivå er reelle, men små mot NTs margin (~7 % på vinner inkl. OT): de flytter sjelden et spill over terskelen. Modellen alene blir derfor ikke en spillstrategi; den brukes som tilleggsinformasjon i skyggestrategien.

_xG-, skudd- og keeperdata: [MoneyPuck.com](https://moneypuck.com) (fri for ikke-kommersiell bruk)._

_Kjøretid 161 s._
