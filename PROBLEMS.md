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
