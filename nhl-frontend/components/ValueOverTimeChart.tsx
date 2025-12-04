import { useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { formatCurrency, formatDateLabel, formatShortDate } from '@/lib/format';
import { PortfolioPoint } from '@/types';

type ValueOverTimeChartProps = {
  points: PortfolioPoint[];
};

export default function ValueOverTimeChart({ points }: ValueOverTimeChartProps) {
  const hasPoints = points.length > 0;
  const width = 480;
  const height = 200;
  const pad = 24;

  const { valueCoords, stakeCoords, xStep, min, max } = useMemo(() => {
    if (!hasPoints) {
      return {
        valueCoords: [],
        stakeCoords: [],
        xStep: 1,
        min: 0,
        max: 1,
      };
    }

    const values = points.map((p) => p.value);
    const invested = points.map((p) => p.invested);
    const minVal = Math.min(0, ...values, ...invested); // start alltid fra 0 eller lavere
    const maxVal = Math.max(...values, ...invested);
    const range = maxVal - minVal || 1;
    const xGap = (width - pad * 2) / Math.max(points.length - 1, 1);

    const toCoords = (series: number[]) =>
      series.map((v, i) => {
        const x = pad + i * xGap;
        const y = height - pad - ((v - minVal) / range) * (height - pad * 2);
        return { x, y };
      });

    return {
      valueCoords: toCoords(values),
      stakeCoords: toCoords(invested),
      xStep: xGap,
      min: minVal,
      max: maxVal,
    };
  }, [hasPoints, points]);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const range = max - min || 1;
  const yTicks = useMemo(() => buildNiceTicks(min, max), [min, max]);
  const xTickIndexes = useMemo(() => buildXTicks(points.length), [points.length]);
  const valueToY = (val: number) => height - pad - ((val - min) / range) * (height - pad * 2);

  if (!hasPoints) {
    return <div className="h-32 text-white/60">Ingen datapunkter ennå.</div>;
  }

  const startPoint = points[0];
  const lastIndex = points.length - 1;
  const endPoint = points[lastIndex];
  const activeIndex = hoverIndex ?? lastIndex;
  const activePoint = points[activeIndex];

  const valueX = valueCoords[activeIndex].x;
  const valueY = valueCoords[activeIndex].y;
  const stakeX = stakeCoords[activeIndex].x;
  const stakeY = stakeCoords[activeIndex].y;

  const handleMove = (evt: ReactMouseEvent<SVGSVGElement>) => {
    const bounds = (evt.currentTarget as SVGSVGElement).getBoundingClientRect();
    const relX = evt.clientX - bounds.left;
    const rawIndex = Math.round((relX - pad) / xStep);
    const clamped = Math.min(lastIndex, Math.max(0, rawIndex));
    setHoverIndex(clamped);
  };

  const handleLeave = () => setHoverIndex(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-white/70">
        <LegendSwatch color="#34d399" label="Total verdi" value={formatCurrency(activePoint.value)} />
        <LegendSwatch color="#38bdf8" label="Total innsats" value={formatCurrency(activePoint.invested)} />
        <span className="text-white/50">
          {formatDateLabel(startPoint.date)} – {formatDateLabel(endPoint.date)}
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-44 w-full"
          preserveAspectRatio="none"
          role="img"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          <defs>
            <linearGradient id="valueAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid */}
          <g>
            {yTicks.map((tick) => {
              const y = valueToY(tick);
              return (
                <g key={`y-${tick}`}>
                  <line
                    x1={0}
                    x2={width}
                    y1={y}
                    y2={y}
                    stroke="#1f2937"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <text x={6} y={y - 4} fill="#cbd5e1" fontSize="10" textAnchor="start" style={{ opacity: 0.7 }}>
                    {formatCurrency(tick)}
                  </text>
                </g>
              );
            })}
            {xTickIndexes.map((idx) => {
              const x = valueCoords[idx].x;
              return (
                <g key={`x-${idx}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={pad / 2}
                    y2={height - pad + 4}
                    stroke="#1f2937"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={x}
                    y={height - 4}
                    fill="#cbd5e1"
                    fontSize="10"
                    textAnchor="middle"
                    style={{ opacity: 0.7 }}
                  >
                    {formatShortDate(points[idx].date)}
                  </text>
                </g>
              );
            })}
          </g>

          <polyline
            fill="url(#valueAreaGradient)"
            stroke="none"
            points={`0,${height} ${valueCoords.map((c) => `${c.x},${c.y}`).join(' ')} ${width},${height}`}
            className="opacity-70"
          />
          <polyline
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={valueCoords.map((c) => `${c.x},${c.y}`).join(' ')}
          />
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="6 4"
            points={stakeCoords.map((c) => `${c.x},${c.y}`).join(' ')}
          />

          {hoverIndex !== null && (
            <>
              <line
                x1={valueX}
                x2={valueX}
                y1={pad / 2}
                y2={height - pad / 2}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
            </>
          )}

          <circle cx={valueX} cy={valueY} r="5" fill="#34d399" stroke="#0f172a" strokeWidth="2" />
          <circle cx={stakeX} cy={stakeY} r="4.5" fill="#38bdf8" stroke="#0f172a" strokeWidth="2" />
        </svg>

        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute -translate-x-3/2 -translate-y-4 whitespace-nowrap rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-xs shadow-xl"
            style={{
              left: `${(valueX / width) * 100}%`,
              top: `${(Math.min(valueY, stakeY) / height) * 100}%`,
            }}
          >
            <div className="text-[10px] uppercase tracking-wide text-white/60">Dag {hoverIndex + 1}</div>
            <div className="font-semibold text-white">{formatDateLabel(activePoint.date)}</div>
            <div className="mt-1 text-white/80">Verdi: <span className="font-semibold text-white">{formatCurrency(activePoint.value)}</span></div>
            <div className="text-white/80">Innsats: <span className="font-semibold text-white">{formatCurrency(activePoint.invested)}</span></div>
            <div className="text-white/80">Åpne spill: <span className="font-semibold text-white">{activePoint.open_bets}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-white/80">{label}</span>
      {value && <span className="font-semibold text-white">{value}</span>}
    </span>
  );
}

function buildNiceTicks(min: number, max: number, target = 4) {
  const safeMin = Math.min(0, min);
  const range = max - safeMin || 1;
  const roughStep = range / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1))));
  const stepOptions = [1, 2, 5, 10].map((mult) => mult * magnitude);
  const niceStep = stepOptions.find((s) => s >= roughStep) ?? stepOptions[stepOptions.length - 1] * 2;

  const niceMin = Math.floor(safeMin / niceStep) * niceStep;
  const niceMax = Math.max(niceMin + niceStep, Math.ceil(max / niceStep) * niceStep);

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += niceStep) {
    ticks.push(Math.round((v + Number.EPSILON) * 100) / 100);
    if (ticks.length > 12) break; // guard against runaway loops
  }

  return ticks;
}

function buildXTicks(length: number) {
  if (length <= 5) return Array.from({ length }, (_, i) => i);
  const last = length - 1;
  const indices = [0, Math.floor(length / 3), Math.floor((2 * length) / 3), last];
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}
