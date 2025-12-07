import csv
from collections import defaultdict

# Les CSV og grupper etter updated_at (avregningstidspunkt)
with open("bet_history.csv", "r") as f:
    reader = csv.DictReader(f)
    
    # Grupper etter updated_at for avregninger
    settlement_by_date = defaultdict(list)
    bets_by_date = defaultdict(list)
    
    for row in reader:
        date = row['date']
        bets_by_date[date].append(row)
        
        if row['status'] != 'pending':
            updated_at = row['updated_at'][:10] if row['updated_at'] else ''
            if updated_at:
                settlement_by_date[updated_at].append(row)
    
    print("=== GRUPPERING ETTER DATE (når bettet ble plassert) ===")
    for date in sorted(bets_by_date.keys()):
        day_bets = bets_by_date[date]
        stake = sum(float(b['stake']) for b in day_bets)
        print(f"{date}: {len(day_bets)} bets, stake={stake:.2f}")
    
    print("\n=== GRUPPERING ETTER UPDATED_AT (når bettet ble avregnet) ===")
    running_profit = 0.0
    for date in sorted(settlement_by_date.keys()):
        day_settled = settlement_by_date[date]
        day_profit = sum(float(b['profit']) for b in day_settled)
        running_profit += day_profit
        print(f"{date}: {len(day_settled)} avregninger, day_profit={day_profit:.2f}, running_profit={running_profit:.2f}")
    
    print("\n=== DIN BEREGNING (profit gruppert etter date) ===")
    for date in sorted(bets_by_date.keys()):
        day_bets = bets_by_date[date]
        day_profit = sum(float(b['profit']) for b in day_bets if b['status'] != 'pending')
        print(f"{date}: day_profit={day_profit:.2f}")
