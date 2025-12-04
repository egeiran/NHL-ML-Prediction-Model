import { GameInfo, PredictionResponse } from '@/types';
import { Target, BarChart3, Trophy, Home, Plane, Calendar } from 'lucide-react';

interface PredictionResultsProps {
  data: PredictionResponse;
}

export default function PredictionResults({ data }: PredictionResultsProps) {
  const maxProb = Math.max(data.prob_home_win, data.prob_ot, data.prob_away_win);

  return (
    <div className="space-y-6 text-white">
      {/* Prediksjon */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-2xl p-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Target className="w-8 h-8" />
          <h2 className="text-3xl font-bold text-center">
            Prediksjon
          </h2>
        </div>
        <div className="text-center text-5xl font-bold mb-4">
          {data.prediction}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className={`text-center p-4 rounded-lg ${data.prob_home_win === maxProb ? 'bg-white/20' : 'bg-white/10'}`}>
            <div className="text-sm mb-1 opacity-90">Hjemmeseier</div>
            <div className="text-2xl font-bold">{(data.prob_home_win * 100).toFixed(1)}%</div>
          </div>
          <div className={`text-center p-4 rounded-lg ${data.prob_ot === maxProb ? 'bg-white/20' : 'bg-white/10'}`}>
            <div className="text-sm mb-1 opacity-90">OT/SO</div>
            <div className="text-2xl font-bold">{(data.prob_ot * 100).toFixed(1)}%</div>
          </div>
          <div className={`text-center p-4 rounded-lg ${data.prob_away_win === maxProb ? 'bg-white/20' : 'bg-white/10'}`}>
            <div className="text-sm mb-1 opacity-90">Borteseier</div>
            <div className="text-2xl font-bold">{(data.prob_away_win * 100).toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* Statistikk */}
      <div className="bg-slate-900 rounded-2xl shadow-2xl p-8 border border-white/10">
        <div className="flex items-center justify-center gap-3 mb-6">
          <BarChart3 className="w-7 h-7 text-blue-300" />
          <h3 className="text-2xl font-bold text-white text-center">
            Statistikk (siste 5 kamper)
          </h3>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border border-blue-400/40 rounded-lg p-4 bg-slate-800/60">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Home className="w-6 h-6 text-blue-300" />
              <h4 className="text-xl font-bold text-blue-200 text-center">
                {data.home_team}
              </h4>
            </div>
            <div className="space-y-2">
              <StatRow label="Mål for (snitt)" value={data.home_stats.goals_for_avg.toFixed(2)} />
              <StatRow label="Mål mot (snitt)" value={data.home_stats.goals_against_avg.toFixed(2)} />
              <StatRow label="Record" value={`${data.home_stats.wins}-${data.home_stats.losses}`} />
              <StatRow label="Vinn %" value={`${data.home_stats.win_percentage}%`} highlight />
            </div>
          </div>

          <div className="border border-red-400/40 rounded-lg p-4 bg-slate-800/60">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Plane className="w-6 h-6 text-rose-300" />
              <h4 className="text-xl font-bold text-rose-200 text-center">
                {data.away_team}
              </h4>
            </div>
            <div className="space-y-2">
              <StatRow label="Mål for (snitt)" value={data.away_stats.goals_for_avg.toFixed(2)} />
              <StatRow label="Mål mot (snitt)" value={data.away_stats.goals_against_avg.toFixed(2)} />
              <StatRow label="Record" value={`${data.away_stats.wins}-${data.away_stats.losses}`} />
              <StatRow label="Vinn %" value={`${data.away_stats.win_percentage}%`} highlight />
            </div>
          </div>
        </div>
      </div>

      {/* Siste 5 kamper */}
      <div className="bg-slate-900 rounded-2xl shadow-2xl p-8 border border-white/10">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Trophy className="w-7 h-7 text-blue-300" />
          <h3 className="text-2xl font-bold text-white text-center">
            Siste 5 kamper
          </h3>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-bold text-blue-200 mb-4 text-center">
              {data.home_team}
            </h4>
            <div className="space-y-2">
              {data.home_last_5.map((game, idx) => (
                <GameCard key={idx} game={game} />
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-lg font-bold text-rose-200 mb-4 text-center">
              {data.away_team}
            </h4>
            <div className="space-y-2">
              {data.away_last_5.map((game, idx) => (
                <GameCard key={idx} game={game} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center p-2 rounded ${highlight ? 'bg-emerald-500/15 font-bold text-emerald-100' : 'text-white'}`}>
      <span className="text-white/80">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function GameCard({ game }: { game: GameInfo }) {
  const isWin = game.result === 'W';
  const VenueIcon = game.venue === 'H' ? Home : Plane;
  
  return (
    <div className={`p-3 rounded-lg border ${isWin ? 'bg-emerald-500/10 border-emerald-300/40' : 'bg-rose-500/10 border-rose-300/40'}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Calendar className="w-4 h-4" />
          {game.date}
        </div>
        <div className={`font-bold ${isWin ? 'text-emerald-200' : 'text-rose-200'}`}>
          {game.result}
        </div>
      </div>
      <div className="flex justify-between items-center mt-1">
        <div className="flex items-center gap-1 text-xs text-white/60">
          <VenueIcon className="w-3 h-3" />
          {game.venue === 'H' ? 'Hjemme' : 'Borte'}
        </div>
        <div className="font-bold text-lg text-white">{game.score}</div>
      </div>
    </div>
  );
}
