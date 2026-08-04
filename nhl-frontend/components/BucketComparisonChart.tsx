import { useMemo } from 'react';

import { BucketStat } from '@/lib/analysis';
import { formatCurrency } from '@/lib/format';

type BucketComparisonChartProps = {
  buckets: BucketStat[];
  /** Hvordan bøttegrensene skal skrives ut på x-aksen. */
  formatBucket: (bucket: BucketStat) => string;
  axisLabel: string;
};

const WIDTH = 480;
const HEIGHT = 250;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 22;
const PAD_BOTTOM = 56;

const MODEL_COLOR = '#38bdf8';
const ACTUAL_COLOR = '#34d399';

/**
 * Forventet mot faktisk antall treff per bøtte. Poenget er ikke nivået på hver
 * søyle, men at det ikke finnes noen stigende trend når man går utover i
 * bøttene – og at modellsøyla står jevnt over den faktiske.
 */
export default function BucketComparisonChart({
  buckets,
  formatBucket,
  axisLabel,
}: BucketComparisonChartProps) {
  const maxValue = useMemo(() => {
    const all = buckets.flatMap((b) => [b.modelExpected, b.hits, b.ci.hi * b.n]);
    return Math.max(1, ...all);
  }, [buckets]);

  const yTicks = useMemo(() => {
    const step = maxValue > 40 ? 10 : maxValue > 20 ? 5 : 2;
    const out: number[] = [];
    for (let v = 0; v <= maxValue; v += step) out.push(v);
    return out;
  }, [maxValue]);

  if (buckets.length === 0) {
    return <div className="h-32 text-white/60">Ingen spill i utvalget.</div>;
  }

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const groupWidth = plotWidth / buckets.length;
  const barWidth = Math.min(groupWidth / 3, 34);

  const toY = (value: number) => PAD_TOP + plotHeight - (value / maxValue) * plotHeight;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <Swatch color={MODEL_COLOR} label="Modellen forventet" />
        <Swatch color={ACTUAL_COLOR} label="Faktisk antall treff" />
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img">
        <title>{`Forventet mot faktisk antall treff per ${axisLabel}-bøtte`}</title>

        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#1f2937"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text x={PAD_LEFT - 6} y={toY(tick) + 3} fill="#cbd5e1" fontSize="9" textAnchor="end" opacity="0.7">
              {tick}
            </text>
          </g>
        ))}

        {buckets.map((bucket, i) => {
          const centre = PAD_LEFT + groupWidth * i + groupWidth / 2;
          const modelX = centre - barWidth - 2;
          const actualX = centre + 2;
          const positive = bucket.roi >= 0;

          return (
            <g key={`bucket-${i}`}>
              <rect
                x={modelX}
                y={toY(bucket.modelExpected)}
                width={barWidth}
                height={Math.max(PAD_TOP + plotHeight - toY(bucket.modelExpected), 1)}
                fill={MODEL_COLOR}
                opacity="0.55"
                rx="2"
              >
                <title>{`Modellen forventet ${bucket.modelExpected.toFixed(1)} treff`}</title>
              </rect>
              <rect
                x={actualX}
                y={toY(bucket.hits)}
                width={barWidth}
                height={Math.max(PAD_TOP + plotHeight - toY(bucket.hits), 1)}
                fill={ACTUAL_COLOR}
                opacity="0.9"
                rx="2"
              >
                <title>{`Faktisk ${bucket.hits} treff av ${bucket.n}`}</title>
              </rect>

              {/* Wilson-intervall på den faktiske søyla, i antall treff. */}
              <line
                x1={actualX + barWidth / 2}
                x2={actualX + barWidth / 2}
                y1={toY(bucket.ci.hi * bucket.n)}
                y2={toY(bucket.ci.lo * bucket.n)}
                stroke="#0f172a"
                strokeWidth="1.5"
                opacity="0.8"
              />
              <line
                x1={actualX + barWidth / 2 - 4}
                x2={actualX + barWidth / 2 + 4}
                y1={toY(bucket.ci.hi * bucket.n)}
                y2={toY(bucket.ci.hi * bucket.n)}
                stroke="#0f172a"
                strokeWidth="1.5"
                opacity="0.8"
              />
              <line
                x1={actualX + barWidth / 2 - 4}
                x2={actualX + barWidth / 2 + 4}
                y1={toY(bucket.ci.lo * bucket.n)}
                y2={toY(bucket.ci.lo * bucket.n)}
                stroke="#0f172a"
                strokeWidth="1.5"
                opacity="0.8"
              />

              <text
                x={centre}
                y={Math.min(toY(bucket.modelExpected), toY(bucket.ci.hi * bucket.n)) - 6}
                fill={positive ? '#6ee7b7' : '#fda4af'}
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
              >
                {`${bucket.roi >= 0 ? '+' : ''}${(bucket.roi * 100).toFixed(1)} %`}
              </text>

              <text x={centre} y={HEIGHT - PAD_BOTTOM + 15} fill="#cbd5e1" fontSize="9" textAnchor="middle" opacity="0.8">
                {formatBucket(bucket)}
              </text>
              <text x={centre} y={HEIGHT - PAD_BOTTOM + 28} fill="#94a3b8" fontSize="9" textAnchor="middle">
                {`n=${bucket.n}`}
              </text>
              <text
                x={centre}
                y={HEIGHT - PAD_BOTTOM + 41}
                fill={positive ? '#6ee7b7' : '#fda4af'}
                fontSize="9"
                textAnchor="middle"
                opacity="0.85"
              >
                {formatCurrency(bucket.profitFlat)}
              </text>
            </g>
          );
        })}

        <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={toY(0)} y2={toY(0)} stroke="#334155" strokeWidth="1" />
      </svg>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-white/80">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
