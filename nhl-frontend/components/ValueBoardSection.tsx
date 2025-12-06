import { RefreshCw, CalendarDays } from 'lucide-react';

import ValueGameCard from '@/components/ValueGameCard';
import { formatDateLabel } from '@/lib/format';
import { ValueGame } from '@/types';

type ValueBoardSectionProps = {
  daysAhead: number;
  loading: boolean;
  error: string;
  sortedDates: string[];
  gamesByDate: Record<string, ValueGame[]>;
};

export default function ValueBoardSection({
  daysAhead,
  loading,
  error,
  sortedDates,
  gamesByDate,
}: ValueBoardSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <CalendarDays className="h-5 w-5 text-blue-300" />
          Oversikt for i dag + neste {daysAhead} dager
        </div>
        <div className="text-xs uppercase tracking-wide text-white/60">
          Modellodds, markedodds og value pr. utfall
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-200 flex gap-2 items-center">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Laster inn kamper og odds...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-red-100">
          {error}
        </div>
      )}

      {!loading && !error && sortedDates.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-200">
          Ingen kamper funnet i perioden.
        </div>
      )}

      {!loading && !error && sortedDates.map((date) => (
        <div key={date} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-semibold text-white">{formatDateLabel(date)}</div>
            <div className="text-xs text-white/60">{gamesByDate[date].length} kamp(er)</div>
          </div>
          <div className="mt-4 space-y-4">
            {gamesByDate[date].map((game) => (
              <ValueGameCard key={game.event_id || `${game.start_time}-${game.home}`} game={game} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
