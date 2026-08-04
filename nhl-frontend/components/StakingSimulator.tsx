import { useMemo, useState } from 'react';

import ValueOverTimeChart from '@/components/ValueOverTimeChart';
import {
  BootstrapResult,
  SettledBet,
  STAKING_RULES,
  START_BANKROLL,
  applyRule,
  bootstrapVsFlat,
  compoundBankroll,
  equityCurve,
  kellyFraction,
} from '@/lib/analysis';
import { formatCurrency } from '@/lib/format';
import { PortfolioPoint } from '@/types';

const OVERLAY_COLOR = '#f472b6';

type StakingSimulatorProps = {
  bets: SettledBet[];
};

/**
 * «Hva hvis»-simulator. Alle regler normaliseres til samme totale omsetning som
 * flat innsats, ellers ville en regel som satser mer på alt sett bedre ut uten
 * å være en bedre regel.
 *
 * Poenget med å kunne klikke mellom reglene er ikke å finne en vinner, men å se
 * at bootstrap-intervallene overlapper hverandre fullstendig.
 */
export default function StakingSimulator({ bets }: StakingSimulatorProps) {
  const [ruleKey, setRuleKey] = useState('kelly');
  const rule = STAKING_RULES.find((r) => r.key === ruleKey) ?? STAKING_RULES[0];

  const flatRule = STAKING_RULES[0];

  const baselinePoints: PortfolioPoint[] = useMemo(() => {
    return equityCurve(bets, flatRule.weight).map((point) => ({
      date: point.date,
      invested: point.invested,
      value: point.value,
      settled_return: 0,
      open_stake: 0,
      open_bets: 0,
      bets_placed: point.bets,
      bets_won: 0,
      bets_settled: point.bets,
    }));
  }, [bets, flatRule.weight]);

  const overlayValues = useMemo(
    () => equityCurve(bets, rule.weight).map((point) => point.value),
    [bets, rule.weight],
  );

  const flatResult = useMemo(() => applyRule(bets, flatRule.weight), [bets, flatRule.weight]);
  const ruleResult = useMemo(() => applyRule(bets, rule.weight), [bets, rule.weight]);
  const bootstrap: BootstrapResult = useMemo(
    () => (rule.key === 'flat' ? { mean: 0, lo: 0, hi: 0, pBetter: 0 } : bootstrapVsFlat(bets, rule.weight)),
    [bets, rule],
  );

  const kellyWeight = (bet: SettledBet) => kellyFraction(bet.model_prob, bet.odds);
  const compounding = useMemo(
    () => [
      { label: 'Full Kelly', result: compoundBankroll(bets, kellyWeight, 1) },
      { label: 'Halv Kelly', result: compoundBankroll(bets, kellyWeight, 0.5) },
      { label: 'Kvart Kelly', result: compoundBankroll(bets, kellyWeight, 0.25) },
    ],
    [bets],
  );

  const flatEnd = START_BANKROLL + flatResult.profit;
  const delta = ruleResult.profit - flatResult.profit;

  if (bets.length === 0) {
    return <div className="text-white/60">Ingen avregnede spill å simulere på.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STAKING_RULES.map((option) => {
          const active = option.key === rule.key;
          return (
            <button
              key={option.key}
              onClick={() => setRuleKey(option.key)}
              aria-pressed={active}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-pink-400/50 bg-pink-500/20 text-pink-100'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-white/60">{rule.note}</p>

      <ValueOverTimeChart
        points={baselinePoints}
        trimIncomplete={false}
        showInvested={false}
        valueLabel="Flat innsats"
        overlay={
          rule.key === 'flat'
            ? null
            : { label: rule.label, color: OVERLAY_COLOR, values: overlayValues }
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Resultat" value={formatCurrency(ruleResult.profit)} tone={ruleResult.profit >= 0 ? 'positive' : 'negative'} />
        <Metric label="ROI" value={`${ruleResult.roi >= 0 ? '+' : ''}${(ruleResult.roi * 100).toFixed(1)} %`} tone={ruleResult.roi >= 0 ? 'positive' : 'negative'} />
        <Metric
          label="Mot flat innsats"
          value={`${delta >= 0 ? '+' : ''}${formatCurrency(delta)}`}
          tone={rule.key === 'flat' ? 'neutral' : delta >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label="Innsats min–maks"
          value={`${Math.round(ruleResult.minStake)}–${Math.round(ruleResult.maxStake)} kr`}
        />
      </div>

      {rule.key !== 'flat' && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          <span className="font-semibold text-white">Bootstrap mot flat innsats:</span>{' '}
          snitt {formatCurrency(bootstrap.mean)}, 95 %-intervall [{formatCurrency(bootstrap.lo)},{' '}
          {formatCurrency(bootstrap.hi)}]. Bedre enn flat i {(bootstrap.pBetter * 100).toFixed(0)} % av
          trekningene.
          {bootstrap.lo < 0 && bootstrap.hi > 0 && (
            <span className="text-amber-300">
              {' '}
              Intervallet dekker null – forskjellen er ikke skilt fra varians.
            </span>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Ekte Kelly med sammensatt bankrull (start {formatCurrency(START_BANKROLL)}, tak 25 % per dag)
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {compounding.map((entry) => (
            <Metric
              key={entry.label}
              label={entry.label}
              value={formatCurrency(entry.result.end)}
              note={`${entry.result.growth >= 0 ? '+' : ''}${(entry.result.growth * 100).toFixed(1)} %`}
              tone={entry.result.growth >= 0 ? 'positive' : 'negative'}
            />
          ))}
          <Metric
            label="Flat (referanse)"
            value={formatCurrency(flatEnd)}
            note={`${flatResult.profit >= 0 ? '+' : ''}${((flatEnd / START_BANKROLL - 1) * 100).toFixed(1)} %`}
            tone={flatResult.profit >= 0 ? 'positive' : 'negative'}
          />
        </div>
        <p className="mt-2 text-xs text-white/50">
          Kelly forutsetter kalibrerte sannsynligheter. Med en modell som forventer flere treff enn
          den får, overinvesterer den systematisk – derfor faller bankrullen selv om de samme
          spillene går i pluss med flat innsats.
        </p>
      </div>
    </div>
  );
}

function Metric({
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
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      {note && <div className="text-xs text-white/60">{note}</div>}
    </div>
  );
}
