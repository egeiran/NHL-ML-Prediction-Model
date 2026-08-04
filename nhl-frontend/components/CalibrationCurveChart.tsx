import { useMemo } from 'react';

import { CalibrationPoint } from '@/lib/analysis';

type Series = {
  key: string;
  label: string;
  color: string;
  points: CalibrationPoint[];
};

type CalibrationCurveChartProps = {
  series: Series[];
};

const SIZE = 360;
const PAD_LEFT = 42;
const PAD_BOTTOM = 34;
const PAD_TOP = 14;
const PAD_RIGHT = 14;

/**
 * Kalibreringskurve: sagt sannsynlighet på X, faktisk treffrate på Y.
 * Diagonalen er perfekt kalibrering – punkter over den betyr at utfallet skjer
 * oftere enn kilden sa, punkter under at kilden var for optimistisk.
 *
 * Aksene deler skala med vilje, slik at diagonalen står i 45° og avviket kan
 * leses som avstand rett opp eller ned fra linja.
 */
export default function CalibrationCurveChart({ series }: CalibrationCurveChartProps) {
  // Skalaen settes av punktene selv, ikke av konfidensintervallene. Med ~35 spill
  // per bøtte er intervallene så brede at de ellers ville presset punktene sammen
  // i et hjørne og gjort avviket fra diagonalen uleselig. Whiskers klippes i stedet.
  const domain = useMemo(() => {
    const all = series.flatMap((s) => s.points.flatMap((p) => [p.predicted, p.actual]));
    if (all.length === 0) return { min: 0, max: 1 };
    const min = Math.max(0, Math.min(...all) - 0.04);
    const max = Math.min(1, Math.max(...all) + 0.04);
    return { min, max: max > min ? max : min + 0.1 };
  }, [series]);

  const span = domain.max - domain.min;
  const plotWidth = SIZE - PAD_LEFT - PAD_RIGHT;
  const plotHeight = SIZE - PAD_TOP - PAD_BOTTOM;

  const toX = (value: number) => PAD_LEFT + ((value - domain.min) / span) * plotWidth;
  const rawY = (value: number) => PAD_TOP + plotHeight - ((value - domain.min) / span) * plotHeight;
  const toY = (value: number) => Math.min(Math.max(rawY(value), PAD_TOP), PAD_TOP + plotHeight);

  const ticks = useMemo(() => {
    const step = span > 0.4 ? 0.1 : 0.05;
    const out: number[] = [];
    for (let v = Math.ceil(domain.min / step) * step; v <= domain.max + 1e-9; v += step) {
      out.push(Math.round(v * 100) / 100);
    }
    return out;
  }, [domain, span]);

  if (series.every((s) => s.points.length === 0)) {
    return <div className="h-32 text-white/60">Ingen avregnede spill å kalibrere på ennå.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        {series.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-white/80"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-white/60">
          <span className="h-0.5 w-5" style={{ backgroundColor: '#94a3b8' }} />
          Perfekt kalibrering
        </span>
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-md" role="img">
        <title>Kalibreringskurve: sagt sannsynlighet mot faktisk treffrate</title>

        {ticks.map((tick) => (
          <g key={`grid-${tick}`}>
            <line
              x1={PAD_LEFT}
              x2={SIZE - PAD_RIGHT}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#1f2937"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <line
              x1={toX(tick)}
              x2={toX(tick)}
              y1={PAD_TOP}
              y2={SIZE - PAD_BOTTOM}
              stroke="#1f2937"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text x={PAD_LEFT - 6} y={toY(tick) + 3} fill="#cbd5e1" fontSize="9" textAnchor="end" opacity="0.7">
              {Math.round(tick * 100)}%
            </text>
            <text x={toX(tick)} y={SIZE - PAD_BOTTOM + 14} fill="#cbd5e1" fontSize="9" textAnchor="middle" opacity="0.7">
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        {/* Diagonalen = perfekt kalibrering */}
        <line
          x1={toX(domain.min)}
          y1={toY(domain.min)}
          x2={toX(domain.max)}
          y2={toY(domain.max)}
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />

        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.85"
              points={s.points.map((p) => `${toX(p.predicted)},${toY(p.actual)}`).join(' ')}
            />
            {s.points.map((p, i) => {
              const x = toX(p.predicted);
              return (
                <g key={`${s.key}-${i}`}>
                  {/* Wilson-intervall. Med ~35 spill per punkt er dette bredt, og det skal det se ut som. */}
                  <line
                    x1={x}
                    x2={x}
                    y1={toY(p.ci.hi)}
                    y2={toY(p.ci.lo)}
                    stroke={s.color}
                    strokeWidth="1.5"
                    opacity="0.45"
                  />
                  <line x1={x - 3} x2={x + 3} y1={toY(p.ci.hi)} y2={toY(p.ci.hi)} stroke={s.color} strokeWidth="1.5" opacity="0.45" />
                  <line x1={x - 3} x2={x + 3} y1={toY(p.ci.lo)} y2={toY(p.ci.lo)} stroke={s.color} strokeWidth="1.5" opacity="0.45" />
                  <circle
                    cx={x}
                    cy={toY(p.actual)}
                    r={Math.min(3 + Math.sqrt(p.n) / 2.5, 8)}
                    fill={s.color}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  >
                    <title>
                      {`Sagt ${(p.predicted * 100).toFixed(1)} % · faktisk ${(p.actual * 100).toFixed(1)} % · n=${p.n}`}
                    </title>
                  </circle>
                </g>
              );
            })}
          </g>
        ))}

        <text x={SIZE / 2} y={SIZE - 2} fill="#94a3b8" fontSize="10" textAnchor="middle">
          Sagt sannsynlighet
        </text>
        <text
          x={12}
          y={SIZE / 2}
          fill="#94a3b8"
          fontSize="10"
          textAnchor="middle"
          transform={`rotate(-90 12 ${SIZE / 2})`}
        >
          Faktisk treffrate
        </text>
      </svg>
    </div>
  );
}
