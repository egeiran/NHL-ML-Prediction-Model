import csv
from collections import defaultdict


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


with open("bet_history.csv", "r") as f:
    reader = csv.DictReader(f)
    bets = list(reader)

selection_stats = defaultdict(lambda: {
    "count": 0,
    "wins": 0,
    "profit": 0.0,
    "stake": 0.0,
    "sum_odds": 0.0,
    "sum_model_prob": 0.0,
})

outcome_counts = defaultdict(int)
team_stats = defaultdict(lambda: {
    "count": 0,
    "wins": 0,
    "profit": 0.0,
    "sum_model_prob": 0.0,
})

value_calc_anomalies = []
high_confidence_losses = []
edge_losses = []

for bet in bets:
    selection = (bet.get("selection") or "").strip().lower()
    outcome = (bet.get("actual_outcome") or "").strip().lower()
    odds = to_float(bet.get("odds"))
    model_prob = to_float(bet.get("model_prob"))
    implied_prob = to_float(bet.get("implied_prob"))
    value = to_float(bet.get("value"))
    profit = to_float(bet.get("profit"))
    stake = to_float(bet.get("stake"))

    if outcome:
        outcome_counts[outcome] += 1

    win = selection == outcome and selection in {"home", "away", "draw"}

    stats = selection_stats[selection or "ukjent"]
    stats["count"] += 1
    stats["wins"] += 1 if win else 0
    stats["profit"] += profit
    stats["stake"] += stake
    stats["sum_odds"] += odds
    stats["sum_model_prob"] += model_prob

    if selection == "home":
        team = bet.get("home_abbr")
    elif selection == "away":
        team = bet.get("away_abbr")
    else:
        team = None

    if team:
        team_stat = team_stats[team]
        team_stat["count"] += 1
        team_stat["wins"] += 1 if win else 0
        team_stat["profit"] += profit
        team_stat["sum_model_prob"] += model_prob

    calc_value = (odds * model_prob) - 1
    if abs(value - calc_value) > 0.1:
        value_calc_anomalies.append(bet)

    edge = model_prob - implied_prob
    if profit < 0 and (model_prob >= 0.55 or value >= 0.3):
        high_confidence_losses.append(bet)
    if profit < 0 and edge >= 0.15:
        edge_losses.append(bet)


def print_selection_summary():
    print("\n=== Tap/gevinst per bet-type ===")
    sorted_selections = sorted(
        selection_stats.items(),
        key=lambda item: item[1]["profit"]
    )
    for selection, stats in sorted_selections:
        count = stats["count"]
        win_rate = (stats["wins"] / count) if count else 0
        avg_odds = (stats["sum_odds"] / count) if count else 0
        avg_model_prob = (stats["sum_model_prob"] / count) if count else 0
        profit = stats["profit"]
        roi = (profit / stats["stake"]) if stats["stake"] else 0
        print(
            f"{selection}: antall={count}, winrate={win_rate:.2%}, "
            f"snitt_odds={avg_odds:.2f}, snitt_model_prob={avg_model_prob:.2%}, "
            f"profit={profit:.2f}, ROI={roi:.2%}"
        )


def print_outcome_summary():
    print("\n=== Faktiske utfall ===")
    total = sum(outcome_counts.values())
    for outcome, count in sorted(outcome_counts.items(), key=lambda item: item[1], reverse=True):
        share = (count / total) if total else 0
        print(f"{outcome}: {count} ({share:.2%})")


def print_team_bias(min_count=5, threshold=0.08):
    print("\n=== Mulig overestimering (modell > faktisk) ===")
    overconfident = []
    underconfident = []

    for team, stats in team_stats.items():
        count = stats["count"]
        if count < min_count:
            continue
        win_rate = stats["wins"] / count
        avg_model_prob = stats["sum_model_prob"] / count
        diff = avg_model_prob - win_rate
        if diff >= threshold:
            overconfident.append((team, diff, win_rate, avg_model_prob, stats["profit"], count))
        elif -diff >= threshold:
            underconfident.append((team, diff, win_rate, avg_model_prob, stats["profit"], count))

    for team, diff, win_rate, avg_model_prob, profit, count in sorted(overconfident, key=lambda item: item[1], reverse=True):
        print(
            f"{team}: diff={diff:.2%}, winrate={win_rate:.2%}, "
            f"modell={avg_model_prob:.2%}, profit={profit:.2f}, antall={count}"
        )

    print("\n=== Mulig underestimering (modell < faktisk) ===")
    for team, diff, win_rate, avg_model_prob, profit, count in sorted(underconfident, key=lambda item: item[1]):
        print(
            f"{team}: diff={diff:.2%}, winrate={win_rate:.2%}, "
            f"modell={avg_model_prob:.2%}, profit={profit:.2f}, antall={count}"
        )


def print_anomalies():
    print("\n=== Anomalier ===")
    print(f"Avvik i value-beregning (>0.1): {len(value_calc_anomalies)}")

    def bet_key(bet):
        return to_float(bet.get("profit"))

    print("\nStørste tap med høy modell-sannsynlighet eller høy verdi:")
    for bet in sorted(high_confidence_losses, key=bet_key)[:10]:
        print(
            f"{bet.get('date')} {bet.get('event_id')} {bet.get('selection')} "
            f"odds={bet.get('odds')} model_prob={bet.get('model_prob')} "
            f"value={bet.get('value')} profit={bet.get('profit')}"
        )

    print("\nTap der edge (model_prob - implied_prob) er høy:")
    for bet in sorted(edge_losses, key=bet_key)[:10]:
        edge = to_float(bet.get("model_prob")) - to_float(bet.get("implied_prob"))
        print(
            f"{bet.get('date')} {bet.get('event_id')} {bet.get('selection')} "
            f"edge={edge:.2%} profit={bet.get('profit')}"
        )


print_selection_summary()
print_outcome_summary()
print_team_bias()
print_anomalies()