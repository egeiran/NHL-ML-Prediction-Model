import csv

with open("bet_history.csv", "r") as f:
    reader = csv.DictReader(f)
    
    bets = list(reader)

    ant = 0
    value_to_bet = {}
    model_probs_over_05 = 0
    odds_over_3 = 0
    for bet in bets:
        if abs(float(bet["value"]) - (float(bet["odds"]) * float(bet["model_prob"]) - 1)) > 0.1:
            print(bet)
            ant += 1
        if float(bet["model_prob"]) > 0.5:
            model_probs_over_05 += 1
            print(bet["date"])
        if float(bet["odds"]) > 3:
            odds_over_3 += 1
    for bet in bets:
        if float(bet["value"]) < 0.2 or float(bet["odds"]) > 4:
            continue
        if bet["value"][:3] not in value_to_bet:
            value_to_bet[bet["value"][:3]] = float(bet["profit"])
        else:
            value_to_bet[bet["value"][:3]] += float(bet["profit"])

    print(f"Number of bets with value > 0.1: {ant}")
    print(f"Number of bets with model_prob > 0.5: {model_probs_over_05}")
    print(f"Number of bets with odds > 3: {odds_over_3}")
    value_to_bet = dict(sorted(value_to_bet.items(), reverse=True))
    total_profit = 0
    for value, profit in value_to_bet.items():
        total_profit += profit
        print(f"Value: {value}, Total Profit: {total_profit}, Profit at this value: {profit}")