import { formatOdds, formatPercent, formatTime, formatValue, valueColor } from '@/lib/format';
import { ValueGame, ValueOutcomeKey } from '@/types';

type OutcomeDisplay = {
  key: ValueOutcomeKey;
  label: string;
  teamLabel: string;
  marketOdds?: number | null;
  modelProb: number;
  modelOdds?: number | null;
  impliedProb?: number | null;
  value?: number | null;
};

export default function ValueGameCard({ game }: { game: ValueGame }) {
  const outcomes = buildOutcomes(game);
  const bestKey = pickBestOutcome(game, outcomes);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">
            {(game.home_abbr || game.home) ?? game.home} vs {(game.away_abbr || game.away) ?? game.away}
          </div>
          <div className="text-sm text-white/60">Start: {formatTime(game.start_time)}</div>
        </div>
        {bestKey && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
            Høyest verdi: {labelForOutcome(bestKey, game)}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {outcomes.map((outcome) => (
          <OutcomeCard key={outcome.key} outcome={outcome} isBest={bestKey === outcome.key} />
        ))}
      </div>
    </div>
  );
}

function OutcomeCard({ outcome, isBest }: { outcome: OutcomeDisplay; isBest: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 transition ${
        isBest
          ? 'border-emerald-400/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/20'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/60">{outcome.label}</div>
          <div className="text-base font-semibold text-white">{outcome.teamLabel}</div>
        </div>
        {isBest && <span className="text-[11px] font-semibold text-emerald-200">Beste verdi</span>}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/50">Vår odds</div>
          <div className="text-lg font-semibold text-white">{formatOdds(outcome.modelOdds)}</div>
          <div className="text-xs text-white/60">{formatPercent(outcome.modelProb)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/50">Marked</div>
          <div className="text-lg font-semibold text-white">{formatOdds(outcome.marketOdds)}</div>
          <div className="text-xs text-white/60">{formatPercent(outcome.impliedProb)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/50">Verdi</div>
          <div className={`text-lg font-semibold ${valueColor(outcome.value)}`}>{formatValue(outcome.value)}</div>
          <div className="text-xs text-white/60">Modell - marked</div>
        </div>
      </div>
    </div>
  );
}

function buildOutcomes(game: ValueGame): OutcomeDisplay[] {
  return [
    {
      key: 'home',
      label: 'Hjemme',
      teamLabel: game.home_abbr || game.home,
      marketOdds: game.odds_home,
      modelProb: game.model_home_win,
      modelOdds: game.model_home_odds,
      impliedProb: game.implied_home_prob,
      value: game.value_home,
    },
    {
      key: 'draw',
      label: 'Uavgjort',
      teamLabel: 'OT / SO',
      marketOdds: game.odds_draw,
      modelProb: game.model_draw,
      modelOdds: game.model_draw_odds,
      impliedProb: game.implied_draw_prob,
      value: game.value_draw,
    },
    {
      key: 'away',
      label: 'Borte',
      teamLabel: game.away_abbr || game.away,
      marketOdds: game.odds_away,
      modelProb: game.model_away_win,
      modelOdds: game.model_away_odds,
      impliedProb: game.implied_away_prob,
      value: game.value_away,
    },
  ];
}

function pickBestOutcome(game: ValueGame, outcomes: OutcomeDisplay[]): ValueOutcomeKey | null {
  if (game.best_value) {
    return game.best_value;
  }

  const withValue = outcomes.filter((o) => o.value !== null && o.value !== undefined);
  if (!withValue.length) {
    return null;
  }

  withValue.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return withValue[0].key;
}

function labelForOutcome(key: ValueOutcomeKey, game: ValueGame) {
  if (key === 'home') return game.home_abbr || game.home;
  if (key === 'away') return game.away_abbr || game.away;
  return 'Uavgjort';
}
