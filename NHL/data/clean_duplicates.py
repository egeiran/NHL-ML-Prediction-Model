import csv
from collections import defaultdict

def normalize_team(team):
    """ARI og UTA er samme lag"""
    return 'UTA' if team == 'ARI' else team

def read_bets():
    """Les alle bets og normaliser team-navn"""
    bets = []
    with open("bet_history.csv", "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Normaliser team-navn
            if row['home_abbr']:
                row['home_abbr'] = normalize_team(row['home_abbr'])
            if row['away_abbr']:
                row['away_abbr'] = normalize_team(row['away_abbr'])
            # Oppdater event_id hvis den inneholder ARI
            if 'ARI' in row['event_id']:
                row['event_id'] = row['event_id'].replace('ARI', 'UTA')
            bets.append(row)
    return bets

def remove_duplicates(bets):
    """Fjern duplikater basert på event_id, selection og date"""
    seen = {}
    unique_bets = []
    duplicates_removed = 0
    
    for bet in bets:
        # Lag en unik nøkkel basert på event_id, selection og date
        key = (bet['event_id'], bet['selection'], bet['date'])
        
        if key not in seen:
            seen[key] = bet
            unique_bets.append(bet)
        else:
            # Hvis duplikat, behold den med nyeste updated_at
            existing = seen[key]
            if bet['updated_at'] > existing['updated_at']:
                # Bytt ut med nyere versjon
                unique_bets.remove(existing)
                unique_bets.append(bet)
                seen[key] = bet
            duplicates_removed += 1
            print(f"Duplikat fjernet: {bet['event_id']} - {bet['selection']} på {bet['date']}")
    
    return unique_bets, duplicates_removed

def write_bets(bets):
    """Skriv tilbake til CSV"""
    fieldnames = [
        'date', 'event_id', 'start_time', 'home_abbr', 'away_abbr', 
        'selection', 'odds', 'model_prob', 'implied_prob', 'value', 
        'stake', 'status', 'payout', 'profit', 'actual_outcome', 
        'created_at', 'updated_at'
    ]
    
    with open("bet_history.csv", "w", newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(bets)

if __name__ == "__main__":
    print("Leser bets...")
    bets = read_bets()
    print(f"Totalt {len(bets)} bets lest")
    
    print("\nFjerner duplikater...")
    unique_bets, removed = remove_duplicates(bets)
    print(f"\n{removed} duplikater fjernet")
    print(f"{len(unique_bets)} unike bets gjenstår")
    
    print("\nSkriver tilbake til bet_history.csv...")
    write_bets(unique_bets)
    print("Ferdig! ✓")