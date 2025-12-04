import { Trophy } from 'lucide-react';

import PredictionResults from '@/components/PredictionResults';
import TeamSelector from '@/components/TeamSelector';
import { PredictionResponse, Team } from '@/types';

type PredictionPanelProps = {
  teams: Team[];
  homeTeam: string;
  awayTeam: string;
  error: string;
  loading: boolean;
  prediction: PredictionResponse | null;
  onHomeChange: (value: string) => void;
  onAwayChange: (value: string) => void;
  onPredict: () => void;
};

export default function PredictionPanel({
  teams,
  homeTeam,
  awayTeam,
  error,
  loading,
  prediction,
  onHomeChange,
  onAwayChange,
  onPredict,
}: PredictionPanelProps) {
  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="mb-4 flex items-center gap-2 text-white">
          <Trophy className="h-5 w-5 text-blue-300" />
          <h2 className="text-xl font-semibold">Egendefinert matchup</h2>
        </div>

        <div className="grid gap-4 text-blue-300">
          <TeamSelector
            label="Hjemmelag"
            teams={teams}
            selectedTeam={homeTeam}
            onChange={onHomeChange}
            iconType="home"
          />
          <TeamSelector
            label="Bortelag"
            teams={teams}
            selectedTeam={awayTeam}
            onChange={onAwayChange}
            iconType="away"
          />
        </div>

        {error && (
          <div className="mt-4 rounded border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <button
          onClick={onPredict}
          disabled={loading || !homeTeam || !awayTeam}
          className="mt-5 w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {loading ? 'Beregner...' : 'Prediker resultat'}
        </button>
      </div>

      {prediction && (
        <div className="rounded-2xl border border-white/20 bg-slate-900/90 p-4 shadow-xl shadow-black/30">
          <PredictionResults data={prediction} />
        </div>
      )}
    </aside>
  );
}
