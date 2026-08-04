'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, FlaskConical } from 'lucide-react';

import BucketComparisonChart from '@/components/BucketComparisonChart';
import CalibrationCurveChart from '@/components/CalibrationCurveChart';
import StakingSimulator from '@/components/StakingSimulator';
import { bucketTable, calibrationCurve, correlationWithReturn, selectSettled } from '@/lib/analysis';
import { BetEntry } from '@/types';

const MODEL_COLOR = '#38bdf8';
const MARKET_COLOR = '#fbbf24';

type CalibrationSectionProps = {
  bets: BetEntry[];
};

/**
 * Analyseseksjon: hvorfor flat innsats står seg, og hvor kalibreringen ligger.
 *
 * Alt regnes i nettleseren fra `portfolio.json` sin bets-array. Tallene skal
 * stemme med `python NHL/analyze_stake_sizing.py` for samme utvalg – bortsett
 * fra bootstrap-intervallene, som er stokastiske og bruker en annen RNG.
 */
export default function CalibrationSection({ bets }: CalibrationSectionProps) {
  const [open, setOpen] = useState(false);
  const [includeDraws, setIncludeDraws] = useState(false);

  const settled = useMemo(() => selectSettled(bets, includeDraws), [bets, includeDraws]);

  const modelCurve = useMemo(() => calibrationCurve(settled, (b) => b.model_prob), [settled]);
  const marketCurve = useMemo(() => calibrationCurve(settled, (b) => b.implied_prob), [settled]);
  const evBuckets = useMemo(() => bucketTable(settled, (b) => b.value), [settled]);
  const oddsBuckets = useMemo(() => bucketTable(settled, (b) => b.odds), [settled]);

  const evCorrelation = useMemo(
    () => (open ? correlationWithReturn(settled, (b) => b.value) : null),
    [settled, open],
  );
  const oddsCorrelation = useMemo(
    () => (open ? correlationWithReturn(settled, (b) => b.odds) : null),
    [settled, open],
  );

  const sampleSizes = useMemo(
    () => ({
      withDraws: selectSettled(bets, true).length,
      withoutDraws: selectSettled(bets, false).length,
    }),
    [bets],
  );

  const totals = useMemo(() => {
    const hits = settled.filter((b) => b.status === 'won').length;
    return {
      n: settled.length,
      hits,
      modelExpected: settled.reduce((sum, b) => sum + b.model_prob, 0),
      marketExpected: settled.reduce((sum, b) => sum + b.implied_prob, 0),
    };
  }, [settled]);

  if (bets.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-purple-900/20 p-6 shadow-xl shadow-black/30">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/15 ring-1 ring-purple-400/30">
              <FlaskConical className="h-6 w-6 text-purple-300" />
            </div>
            <div>
              <div className="text-sm uppercase tracking-wide text-white/60">Analyse</div>
              <div className="text-xl font-semibold text-white">
                Kalibrering, EV-bøtter og innsatsregler
              </div>
              <div className="text-sm text-white/60">
                Hvorfor vi holder oss til flat innsats – regnet ut fra {totals.n} avregnede spill
              </div>
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="mt-6 space-y-8">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={includeDraws}
                  onChange={(e) => setIncludeDraws(e.target.checked)}
                  className="h-3.5 w-3.5 accent-purple-400"
                />
                Ta med OT/SO-spill
              </label>
              <span className="text-xs text-white/50">
                Vi spiller ikke uavgjort lenger. {sampleSizes.withoutDraws} spill uten OT/SO,{' '}
                {sampleSizes.withDraws} med.
              </span>
            </div>

            {/* 1. Kalibreringskurve */}
            <Block
              title="1. Er sannsynlighetene riktige?"
              caption={`Modellen forventet ${totals.modelExpected.toFixed(1)} treff, markedet ${totals.marketExpected.toFixed(1)}. Faktisk: ${totals.hits}.`}
            >
              <CalibrationCurveChart
                series={[
                  { key: 'model', label: 'Modellen', color: MODEL_COLOR, points: modelCurve },
                  { key: 'market', label: 'Markedet', color: MARKET_COLOR, points: marketCurve },
                ]}
              />
              <Footnote>
                Markedet ligger på diagonalen, modellen over den: den sier oftere at noe skjer enn
                det faktisk gjør. Merk at kurven gjelder <em>spillene vi tar</em>, ikke modellen
                generelt – loggene lagrer bare det valgte utfallet, så vi ser bare kalibreringen på
                utfall modellen var mest optimistisk om.
              </Footnote>
            </Block>

            {/* 2 + 3. EV- og odds-bøtter */}
            <div className="grid gap-8 xl:grid-cols-2">
              <Block
                title="2. Gir høyere EV høyere avkastning?"
                caption={
                  evCorrelation
                    ? `Korrelasjon EV ↔ avkastning per krone: r = ${evCorrelation.r.toFixed(3)} (permutasjonstest p = ${evCorrelation.pValue.toFixed(2)}).`
                    : ''
                }
              >
                <BucketComparisonChart
                  buckets={evBuckets}
                  axisLabel="EV"
                  formatBucket={(b) => `${b.lo.toFixed(2)}–${b.hi.toFixed(2)}`}
                />
                <Footnote>
                  Ingen stigende trend. Hele resultatet sitter i én bøtte, ikke i den med høyest EV.
                  Da har innsatsskalering på EV ingenting å ta tak i.
                </Footnote>
              </Block>

              <Block
                title="3. Samme figur etter odds"
                caption={
                  oddsCorrelation
                    ? `Korrelasjon odds ↔ avkastning per krone: r = ${oddsCorrelation.r.toFixed(3)} (permutasjonstest p = ${oddsCorrelation.pValue.toFixed(2)}).`
                    : ''
                }
              >
                <BucketComparisonChart
                  buckets={oddsBuckets}
                  axisLabel="odds"
                  formatBucket={(b) => `${b.lo.toFixed(2)}–${b.hi.toFixed(2)}`}
                />
                <Footnote>
                  Mønsteret ser mer monotont ut enn for EV, men korrelasjonen er{' '}
                  <strong className="text-amber-300">ikke signifikant</strong>. Dette er en hypotese
                  å følge med på – vår egen versjon av favourite-longshot bias – ikke et etablert
                  funn. Holder den, er svaret å stramme oddstaket, ikke å skalere innsatsen.
                </Footnote>
              </Block>
            </div>

            {/* 4. Innsatssimulator */}
            <Block
              title="4. Hva hvis vi hadde satset annerledes?"
              caption="Alle regler er normalisert til samme totale omsetning som flat innsats, så det er regelen som sammenlignes – ikke risikonivået."
            >
              <StakingSimulator bets={settled} />
            </Block>

            <p className="text-xs text-white/40">
              Regnet i nettleseren fra de {totals.n} avregnede spillene. Åpne spill er utelatt – de
              har ikke noe utfall å måle. Med et utvalg på denne størrelsen er intervallene brede, og
              det er hele poenget: forskjellene mellom reglene er mindre enn støyen.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Block({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {caption && <p className="mt-1 text-xs text-white/60">{caption}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-white/55">{children}</p>;
}
