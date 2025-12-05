import { RefreshCw, TrendingUp, Wallet } from 'lucide-react';

import ValueOverTimeChart from '@/components/ValueOverTimeChart';
import { formatCurrency, formatDateLabel, formatPercent, formatRoi } from '@/lib/format';
import { PortfolioResponse } from '@/types';

type PortfolioSectionProps = {
  portfolio: PortfolioResponse | null;
  portfolioError: string;
  loadingPortfolio: boolean;
  updatingPortfolio: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  showRefresh?: boolean;
};

export default function PortfolioSection({
  portfolio,
  portfolioError,
  loadingPortfolio,
  updatingPortfolio,
  onRefresh,
  onRetry,
  showRefresh = true,
}: PortfolioSectionProps) {
  const portfolioSeries = portfolio?.timeseries ?? [];
  const portfolioSummary = portfolio?.summary;
  const latestPoint = portfolioSeries[portfolioSeries.length - 1] || null;
  const settledCount = portfolioSummary ? portfolioSummary.total_bets - portfolioSummary.open_bets : 0;
  const completionPct =
    portfolioSummary && portfolioSummary.total_bets
      ? ((settledCount / portfolioSummary.total_bets) * 100).toFixed(0)
      : '0';

  return (
    <section className="mb-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-900/30 p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
              <Wallet className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <div className="text-sm uppercase tracking-wide text-white/60">Bankroll-spor</div>
              <div className="text-xl font-semibold text-white">Beste value-bets per dag (100 kr flat innsats – kun gevinst legges til)</div>
              <div className="text-sm text-white/60">Data fra /portfolio endepunktet</div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            {showRefresh && (
              <button
                onClick={onRefresh}
                disabled={updatingPortfolio}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${updatingPortfolio ? 'animate-spin' : ''}`} />
                {updatingPortfolio ? 'Oppdaterer...' : 'Oppdater nå'}
              </button>
            )}
            <div className="text-xs text-white/60">
              {loadingPortfolio
                ? 'Henter...'
                : latestPoint
                  ? `Sist registrert: ${formatDateLabel(latestPoint.date)}`
                  : 'Ingen historikk ennå'}
            </div>
          </div>
        </div>

        {portfolioError && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {portfolioError}
            <button
              onClick={onRetry}
              className="rounded bg-red-500/80 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Prøv igjen
            </button>
          </div>
        )}

        {loadingPortfolio && !portfolio && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-white/70">
            Laster portefølje og historikk...
          </div>
        )}

        {!loadingPortfolio && !portfolio && !portfolioError && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-white/80">
            Ingen bets lagret ennå. Trykk &quot;Oppdater nå&quot; for å legge inn dagens beste value-bet.
          </div>
        )}

        {portfolio && portfolioSummary && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/60">
                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                  Resultat og daglig innsats
                </div>
                <div className="text-xs text-white/50">{portfolioSeries.length} datapunkt(er)</div>
              </div>
              <div className="mt-3">
                <ValueOverTimeChart points={portfolioSeries} />
              </div>
              {latestPoint && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/70">
                  <span>Netto resultat: <strong className="text-white">{formatCurrency(latestPoint.value)}</strong></span>
                  <span>Innsats den dagen: <strong className="text-white">{formatCurrency(latestPoint.invested)}</strong></span>
                  <span>Spill den dagen: <strong className="text-white">{latestPoint.bets_placed}</strong></span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBlock
                label="Ferdigstilt"
                value={`${completionPct}%`}
                note={`${settledCount} av ${portfolioSummary.total_bets} spill`}
              />
              <StatBlock
                label="Realisert resultat"
                value={formatCurrency(portfolioSummary.current_value)}
                note={`Åpen eksponering: ${formatCurrency(portfolioSummary.open_stake)}`}
                tone={portfolioSummary.current_value >= 0 ? 'positive' : 'negative'}
              />
              <StatBlock
                label="ROI"
                value={formatRoi(portfolioSummary.roi)}
                note={`Realisert resultat: ${formatCurrency(portfolioSummary.profit)}`}
                tone={portfolioSummary.profit >= 0 ? 'positive' : 'negative'}
              />
              <StatBlock
                label="Treffrate"
                value={formatPercent(portfolioSummary.win_rate)}
                note={`${settledCount} avregnet`}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StatBlock({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-200' : tone === 'negative' ? 'text-rose-200' : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
      {note && <div className="text-xs text-white/60">{note}</div>}
    </div>
  );
}
