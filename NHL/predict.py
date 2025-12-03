# predict.py
import sys
import pandas as pd

from utils.data_loader import load_and_prepare_games
from utils.feature_engineering import (
    DEFAULT_WINDOWS,
    build_team_long_df,
    add_multiwindow_form,
    get_latest_team_form,
    get_feature_columns,
)
from utils.model_utils import load_model


LABELS = ["Home Win", "OT / SO", "Away Win"]


def display_last_5_games(long_df: pd.DataFrame, home_abbr: str, away_abbr: str):
    """
    Viser de siste 5 kampene for home og away lag side ved side.
    """
    print("\n" + "="*80)
    print(f"SISTE 5 KAMPER: {home_abbr} (hjemme) vs {away_abbr} (borte)")
    print("="*80)
    
    # Hent siste 5 kamper for hvert lag
    home_games = long_df[long_df["team"] == home_abbr].sort_values("date").tail(5)
    away_games = long_df[long_df["team"] == away_abbr].sort_values("date").tail(5)
    
    # Forbered data for visning
    def format_game_row(row):
        venue = "H" if row["is_home"] == 1 else "A"
        result = "W" if row["win"] == 1 else "L"
        date_str = row["date"].strftime("%Y-%m-%d")
        score = f"{row['goals_for']}-{row['goals_against']}"
        return f"{date_str} ({venue}) {result} {score}"
    
    # Vis lagene side ved side
    print(f"\n{home_abbr:^40} | {away_abbr:^40}")
    print("-"*40 + "|" + "-"*40)
    
    home_list = [format_game_row(row) for _, row in home_games.iterrows()]
    away_list = [format_game_row(row) for _, row in away_games.iterrows()]
    
    # Fyll opp med tomme hvis det er færre enn 5 kamper
    while len(home_list) < 5:
        home_list.insert(0, "Ingen data")
    while len(away_list) < 5:
        away_list.insert(0, "Ingen data")
    
    for h, a in zip(home_list, away_list):
        print(f"{h:40} | {a:40}")
    
    # Beregn statistikk for siste 5
    def calc_stats(games_df):
        if games_df.empty:
            return {"GF": 0, "GA": 0, "W": 0, "L": 0, "Win%": 0}
        gf = games_df["goals_for"].mean()
        ga = games_df["goals_against"].mean()
        wins = games_df["win"].sum()
        losses = len(games_df) - wins
        win_pct = (wins / len(games_df) * 100) if len(games_df) > 0 else 0
        return {
            "GF": round(gf, 2),
            "GA": round(ga, 2),
            "W": wins,
            "L": losses,
            "Win%": round(win_pct, 1)
        }
    
    home_stats = calc_stats(home_games)
    away_stats = calc_stats(away_games)
    
    # Formater strings utenfor f-string for å unngå backslash-problemer
    home_record = f"{home_stats['W']}-{home_stats['L']}"
    away_record = f"{away_stats['W']}-{away_stats['L']}"
    home_win_pct = f"{home_stats['Win%']}%"
    away_win_pct = f"{away_stats['Win%']}%"
    
    print("-"*80)
    print(f"\n{'STATISTIKK (siste 5)':^80}")
    print("-"*80)
    print(f"{'Stat':<20} | {home_abbr:^25} | {away_abbr:^25}")
    print("-"*80)
    print(f"{'Mål for (snitt)':<20} | {home_stats['GF']:^25} | {away_stats['GF']:^25}")
    print(f"{'Mål mot (snitt)':<20} | {home_stats['GA']:^25} | {away_stats['GA']:^25}")
    print(f"{'Record':<20} | {home_record:^25} | {away_record:^25}")
    print(f"{'Vinn %':<20} | {home_win_pct:^25} | {away_win_pct:^25}")
    print("="*80 + "\n")


def build_feature_row(
    home_abbr: str,
    away_abbr: str,
    games_df: pd.DataFrame,
    long_df_with_form: pd.DataFrame,
    abbr_to_id: dict,
    windows=DEFAULT_WINDOWS,
):
    """
    Lager én rad med features for en gitt matchup.
    Bruker samme featurer som under trening.
    """
    home_form = get_latest_team_form(long_df_with_form, home_abbr, windows=windows)
    away_form = get_latest_team_form(long_df_with_form, away_abbr, windows=windows)

    row = {}
    for w in windows:
        row[f"home_form_goals_for_w{w}"] = home_form[f"form_goals_for_w{w}"]
        row[f"home_form_goals_against_w{w}"] = home_form[f"form_goals_against_w{w}"]
        row[f"home_form_win_rate_w{w}"] = home_form[f"form_win_rate_w{w}"]

        row[f"away_form_goals_for_w{w}"] = away_form[f"form_goals_for_w{w}"]
        row[f"away_form_goals_against_w{w}"] = away_form[f"form_goals_against_w{w}"]
        row[f"away_form_win_rate_w{w}"] = away_form[f"form_win_rate_w{w}"]

    row["home_team_id"] = abbr_to_id[home_abbr]
    row["away_team_id"] = abbr_to_id[away_abbr]

    return pd.DataFrame([row], columns=get_feature_columns(windows))


def predict_match(
    home_abbr: str,
    away_abbr: str,
    game_path: str = "data/game.csv",
    team_path: str = "data/team_info.csv",
    model_path: str = "models/nhl_model.pkl",
):
    print(f"Loading games and teams...")
    games_df, id_to_abbr, abbr_to_id = load_and_prepare_games(
        game_path, team_path
    )

    print("Building long dataframe and forms...")
    long_df = build_team_long_df(games_df)
    long_df = add_multiwindow_form(long_df, windows=DEFAULT_WINDOWS)
    
    # Vis siste 5 kamper for begge lagene
    display_last_5_games(long_df, home_abbr, away_abbr)

    print("Loading model...")
    model = load_model(model_path)

    print(f"Building feature row for {home_abbr} vs {away_abbr}...")
    X_input = build_feature_row(
        home_abbr,
        away_abbr,
        games_df,
        long_df,
        abbr_to_id,
        windows=DEFAULT_WINDOWS,
    )

    probs = model.predict_proba(X_input)[0]
    pred_class = probs.argmax()

    result = {
        "home_team": home_abbr,
        "away_team": away_abbr,
        "prob_home_win": float(round(probs[0], 3)),
        "prob_ot": float(round(probs[1], 3)),
        "prob_away_win": float(round(probs[2], 3)),
        "prediction": LABELS[pred_class],
    }

    return result


if __name__ == "__main__":
    if len(sys.argv) == 3:
        home = sys.argv[1].upper()
        away = sys.argv[2].upper()
    else:
        print("Usage: python predict.py HOME_ABBR AWAY_ABBR")
        print("Example: python predict.py BOS MTL")
        sys.exit(1)

    res = predict_match(home, away)
    print("\n" + "="*80)
    print(f"PREDIKSJON: {res['home_team']} vs {res['away_team']}")
    print("="*80)
    print(f"Hjemmeseier:  {res['prob_home_win']*100:.1f}%")
    print(f"OT/SO:        {res['prob_ot']*100:.1f}%")
    print(f"Borteseier:   {res['prob_away_win']*100:.1f}%")
    print(f"\nForventet resultat: {res['prediction']}")
    print("="*80 + "\n")
