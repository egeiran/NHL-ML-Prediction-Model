/**
 * Kalibrerings- og innsatsanalyse — rene funksjoner, klientside.
 *
 * Ingen React, ingen npm-avhengigheter, ingen I/O. Modulen er en numerisk
 * speiling av `NHL/analyze_stake_sizing.py`; fasiten ligger i
 * `docs/blalinja/stake_truth.json` og verifiseres av `lib/analysis.test.mjs`.
 *
 * Typene under er bevisst lokale og strukturelle (`status`/`selection` er
 * `string`, ikke unioner) slik at `BetEntry` fra `types/index.ts` kan sendes
 * rett inn uten konvertering, uansett hvordan den fila utvikler seg.
 *
 * Ingenting memoiseres her. Kalleren pakker inn i `useMemo`.
 */

// --------------------------------------------------------------------------- //
// Typer
// --------------------------------------------------------------------------- //

/** Minimumsfeltene analysen trenger fra en rad i `portfolio.json:bets[]`. */
export interface AnalysisBet {
  date: string;
  selection: string;
  odds: number;
  model_prob: number;
  implied_prob: number;
  value: number;
  stake: number;
  status: string;
  profit: number;
  /**
   * Kun brukt til stabil sortering, slik Python-skriptet gjør. Valgfri.
   *
   * `null` er tillatt fordi `BetEntry` i `types/index.ts` bruker det for
   * manglende forkortelse, og hele poenget er at en rad derfra kan sendes rett
   * inn uten en konverteringsrunde hos hver kaller.
   */
  home_abbr?: string | null;
  away_abbr?: string | null;
}

export interface SettleOptions {
  /** Utelat `selection === 'draw'` (OT/SO). 202 spill → 176. */
  excludeDraw?: boolean;
}

export interface Interval {
  lo: number;
  hi: number;
}

export interface CorrelationResult {
  n: number;
  /** Pearson-r mellom nøkkelen og avkastning per krone. */
  r: number;
  /** Regresjonshelning (samme fortegn som r). */
  slope: number;
  /** Tosidig p-verdi fra permutasjonstest: (ekstreme + 1) / (runder + 1). */
  p_value: number;
}

export interface CalibrationBucket {
  /** Nedre/øvre observerte `model_prob` i bøtta (inklusive grenser). */
  lo: number;
  hi: number;
  n: number;
  hits: number;
  /** Snitt modellsannsynlighet i bøtta. */
  model_mean: number;
  /** Snitt implisert (markeds-)sannsynlighet for de samme spillene. */
  implied_mean: number;
  /** Faktisk treffrate. */
  hit_rate: number;
  /** Wilson-intervall for treffraten, z = 1.96. */
  wilson: Interval;
}

export interface ValueBucket {
  /** Nedre/øvre observerte verdi av bøttenøkkelen (EV eller odds). */
  lo: number;
  hi: number;
  n: number;
  hits: number;
  hit_rate: number;
  /** Sum `model_prob` — hvor mange treff modellen ventet i bøtta. */
  model_expected: number;
  /** Sum `implied_prob` — hvor mange treff markedet ventet. */
  market_expected: number;
  /** Avkastning per krone, snitt over bøtta. */
  roi: number;
  /** Resultat i kroner ved flat innsats (100 kr). */
  profit_flat: number;
  wilson: Interval;
}

export type StakeWeightFn = (bet: AnalysisBet) => number;

export interface StakeRule {
  id: string;
  /** Navnet Python-skriptet bruker, der regelen finnes der. */
  label: string;
  weight: StakeWeightFn;
}

export interface StakeRuleResult {
  n: number;
  /** Total omsetning. Alltid lik flat innsats (100 kr × n) etter normalisering. */
  staked: number;
  profit: number;
  roi: number;
  min_stake: number;
  max_stake: number;
  /** Innsats per spill, i samme rekkefølge som inn-lista. */
  stakes: number[];
}

export interface BootstrapResult {
  mean: number;
  lo: number;
  hi: number;
  /** Andel trekninger der regelen slår flat innsats. */
  p_better: number;
}

export interface StakeRuleRow {
  id: string;
  label: string;
  staked: number;
  profit: number;
  roi: number;
  min_stake: number;
  max_stake: number;
  /** Differanse mot flat innsats, i kroner. */
  delta_vs_flat: number;
  bootstrap: BootstrapResult;
}

export interface EquityPoint {
  date: string;
  /** Kumulativ nettogevinst i kroner til og med datoen. */
  value: number;
}

export interface AnalysisSummary {
  n: number;
  hits: number;
  /** Sum `model_prob` = 85,5 over de 202 spillene. */
  expected_hits_model: number;
  /** Sum `implied_prob` = 66,4. */
  expected_hits_market: number;
  staked: number;
  profit: number;
  roi: number;
  hit_rate: number;
  wilson: Interval;
}

export interface AnalysisResult {
  summary: AnalysisSummary;
  calibration: CalibrationBucket[];
  ev_buckets: ValueBucket[];
  odds_buckets: ValueBucket[];
  ev_correlation: CorrelationResult;
  odds_correlation: CorrelationResult;
  rules: StakeRuleRow[];
}

export interface AnalyzeOptions extends SettleOptions {
  /** Antall kvantilbøtter i kalibreringen. Default 6. */
  calibrationBuckets?: number;
  /** Antall bootstrap-trekninger per regel. Default `BOOTSTRAP_ROUNDS`. */
  bootstrapRounds?: number;
  /** Antall permutasjoner i korrelasjonstesten. Default `PERMUTATION_ROUNDS`. */
  permutationRounds?: number;
  seed?: number;
}

// --------------------------------------------------------------------------- //
// Konstanter
// --------------------------------------------------------------------------- //

export const FLAT_STAKE = 100;

/**
 * Seed-valg: samme heltall som `BOOTSTRAP_SEED` i `analyze_stake_sizing.py`
 * (20260729 — datoen analysen ble kjørt). PRNG-en er *ikke* den samme (Python
 * bruker Mersenne Twister, vi bruker mulberry32), så trekningene blir ikke
 * identiske — men de er deterministiske på tvers av rendringer, noe
 * `Math.random()` ikke ville vært. Bootstrap- og permutasjonstall skal derfor
 * ligne fasiten innenfor Monte Carlo-støy, ikke matche siffer for siffer.
 */
export const BOOTSTRAP_SEED = 20260729;

/** Python-skriptet bruker 20 000; 10 000 er nok her og halverer regnetiden. */
export const BOOTSTRAP_ROUNDS = 10_000;
export const PERMUTATION_ROUNDS = 10_000;

/** z for 95 % tosidig normalapproksimasjon. */
export const Z_95 = 1.96;

// --------------------------------------------------------------------------- //
// PRNG — deterministisk, implementert lokalt
// --------------------------------------------------------------------------- //

/** mulberry32: 32-bits, seedet, uniform på [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/** Fisher-Yates in-place, med seedet PRNG. */
function shuffleInPlace(values: number[], rng: () => number): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1);
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
}

// --------------------------------------------------------------------------- //
// Utvalg
// --------------------------------------------------------------------------- //

function compareBets(a: AnalysisBet, b: AnalysisBet): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ah = a.home_abbr ?? '';
  const bh = b.home_abbr ?? '';
  if (ah !== bh) return ah < bh ? -1 : 1;
  const aa = a.away_abbr ?? '';
  const ba = b.away_abbr ?? '';
  if (aa !== ba) return aa < ba ? -1 : 1;
  return 0;
}

/**
 * Kun avregnede spill — `pending` har ikke noe utfall å måle.
 * Sorteres på (dato, hjemmelag, bortelag) som i Python, slik at like verdier
 * på en bøttegrense havner i samme rekkefølge her som der.
 */
export function settledBets(
  bets: readonly AnalysisBet[],
  options: SettleOptions = {},
): AnalysisBet[] {
  const out = bets.filter((b) => {
    if (b.status !== 'won' && b.status !== 'lost') return false;
    if (options.excludeDraw === true && b.selection === 'draw') return false;
    return true;
  });
  out.sort(compareBets);
  return out;
}

export function isWon(bet: AnalysisBet): boolean {
  return bet.status === 'won';
}

/** Resultat per krone satset: odds−1 ved treff, −1 ellers. */
export function profitPerKrone(bet: AnalysisBet): number {
  return isWon(bet) ? bet.odds - 1 : -1;
}

// --------------------------------------------------------------------------- //
// Kvantilbøtting
// --------------------------------------------------------------------------- //

/**
 * Deler et sortert utvalg i `k` posisjonsbestemte kvantilbøtter, nøyaktig som
 * `ev_buckets` i Python: `chunk[i*n//k : (i+1)*n//k]` etter en *stabil* sort på
 * nøkkelen. Med n = 202 og k = 4 gir det 50/51/50/51.
 *
 * Like verdier på en bøttegrense får ingen særbehandling — de splittes på
 * posisjon, og rekkefølgen mellom dem er inn-rekkefølgen (stabil sort).
 * Derfor er `settledBets()` sin sortering en del av fasiten: odds har ekte
 * duplikater på grensene 2,70 og 3,10.
 */
export function quantileBucketsBy<T>(
  items: readonly T[],
  k: number,
  key: (item: T) => number,
): T[][] {
  if (items.length === 0 || k <= 0) return [];
  const ordered = items.slice().sort((a, b) => key(a) - key(b));
  const out: T[][] = [];
  for (let i = 0; i < k; i += 1) {
    const start = Math.floor((i * ordered.length) / k);
    const end = Math.floor(((i + 1) * ordered.length) / k);
    const chunk = ordered.slice(start, end);
    if (chunk.length > 0) out.push(chunk);
  }
  return out;
}

/** Samme bøtting, for rene talllister. */
export function quantileBuckets(values: readonly number[], k: number): number[][] {
  return quantileBucketsBy(values, k, (v) => v);
}

// --------------------------------------------------------------------------- //
// Intervaller
// --------------------------------------------------------------------------- //

/** Wilson-score-intervall for en andel. z = 1.96 gir 95 %. */
export function wilsonInterval(hits: number, n: number, z: number = Z_95): Interval {
  if (n <= 0) return { lo: 0, hi: 0 };
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Percentilintervall fra bootstrap over snittet av `values`.
 * Deterministisk: seedet mulberry32.
 */
export function bootstrapMeanInterval(
  values: readonly number[],
  options: { rounds?: number; seed?: number; level?: number } = {},
): Interval & { mean: number } {
  const rounds = options.rounds ?? BOOTSTRAP_ROUNDS;
  const level = options.level ?? 0.95;
  if (values.length === 0) return { mean: 0, lo: 0, hi: 0 };
  const rng = mulberry32(options.seed ?? BOOTSTRAP_SEED);
  const means: number[] = [];
  for (let r = 0; r < rounds; r += 1) {
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) sum += values[randInt(rng, values.length)];
    means.push(sum / values.length);
  }
  return { ...percentiles(means, level), mean: means.reduce((a, b) => a + b, 0) / means.length };
}

/** Percentilgrenser slik Python tar dem: `d[int(a*len)]` og `d[int(b*len)-1]`. */
function percentiles(samples: number[], level: number): Interval {
  const sorted = samples.slice().sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const lo = sorted[Math.floor(alpha * sorted.length)];
  const hi = sorted[Math.floor((1 - alpha) * sorted.length) - 1];
  return { lo, hi };
}

// --------------------------------------------------------------------------- //
// Korrelasjon + permutasjonstest
// --------------------------------------------------------------------------- //

export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * Pearson-r mellom `key` (EV eller odds) og avkastning per krone, med tosidig
 * permutasjonstest på kovariansen — samme test som Python-skriptet.
 */
export function correlationTest(
  bets: readonly AnalysisBet[],
  key: 'value' | 'odds' = 'value',
  options: { rounds?: number; seed?: number } = {},
): CorrelationResult {
  const n = bets.length;
  if (n < 3) return { n, r: 0, slope: 0, p_value: 1 };

  const xs = bets.map((b) => b[key]);
  const ys = bets.map(profitPerKrone);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  const slope = sxx > 0 ? sxy / sxx : 0;

  const rounds = options.rounds ?? PERMUTATION_ROUNDS;
  const rng = mulberry32(options.seed ?? BOOTSTRAP_SEED);
  const shuffled = ys.slice();
  const target = Math.abs(sxy);
  let extreme = 0;
  for (let round = 0; round < rounds; round += 1) {
    shuffleInPlace(shuffled, rng);
    let s = 0;
    for (let i = 0; i < n; i += 1) s += (xs[i] - mx) * (shuffled[i] - my);
    if (Math.abs(s) >= target) extreme += 1;
  }
  return { n, r, slope, p_value: (extreme + 1) / (rounds + 1) };
}

// --------------------------------------------------------------------------- //
// Bøtter
// --------------------------------------------------------------------------- //

function bucketFrom(chunk: readonly AnalysisBet[], key: 'value' | 'odds'): ValueBucket {
  const n = chunk.length;
  let hits = 0;
  let pnl = 0;
  let modelExpected = 0;
  let marketExpected = 0;
  for (const b of chunk) {
    if (isWon(b)) hits += 1;
    pnl += profitPerKrone(b);
    modelExpected += b.model_prob;
    marketExpected += b.implied_prob;
  }
  return {
    lo: chunk[0][key],
    hi: chunk[n - 1][key],
    n,
    hits,
    hit_rate: hits / n,
    model_expected: modelExpected,
    market_expected: marketExpected,
    roi: pnl / n,
    profit_flat: pnl * FLAT_STAKE,
    wilson: wilsonInterval(hits, n),
  };
}

/** EV-kvartiler (n = 50/51/50/51 over 202 spill). */
export function evBuckets(bets: readonly AnalysisBet[], k = 4): ValueBucket[] {
  return quantileBucketsBy(bets, k, (b) => b.value).map((c) => bucketFrom(c, 'value'));
}

/** Odds-kvartiler. */
export function oddsBuckets(bets: readonly AnalysisBet[], k = 4): ValueBucket[] {
  return quantileBucketsBy(bets, k, (b) => b.odds).map((c) => bucketFrom(c, 'odds'));
}

/**
 * Kalibreringsbøtter: kvantiler på `model_prob`, med parallell serie på
 * `implied_prob` for de samme spillene.
 */
export function calibrationBuckets(bets: readonly AnalysisBet[], k = 6): CalibrationBucket[] {
  return quantileBucketsBy(bets, k, (b) => b.model_prob).map((chunk) => {
    const n = chunk.length;
    let hits = 0;
    let model = 0;
    let implied = 0;
    for (const b of chunk) {
      if (isWon(b)) hits += 1;
      model += b.model_prob;
      implied += b.implied_prob;
    }
    return {
      lo: chunk[0].model_prob,
      hi: chunk[n - 1].model_prob,
      n,
      hits,
      model_mean: model / n,
      implied_mean: implied / n,
      hit_rate: hits / n,
      wilson: wilsonInterval(hits, n),
    };
  });
}

// --------------------------------------------------------------------------- //
// Innsatsregler
// --------------------------------------------------------------------------- //

/** f* = (p·o − 1) / (o − 1), gulv på 0. Negativ edge → ingen innsats. */
export function kellyFraction(prob: number, odds: number): number {
  if (odds <= 1) return 0;
  return Math.max((prob * odds - 1) / (odds - 1), 0);
}

export const w_flat: StakeWeightFn = () => 1;
export const w_linear_ev: StakeWeightFn = (b) => Math.max(b.value, 0);
export const w_ev_squared: StakeWeightFn = (b) => Math.max(b.value, 0) ** 2;
export const w_kelly: StakeWeightFn = (b) => kellyFraction(b.model_prob, b.odds);
/**
 * Kvart Kelly. Merk: etter normalisering til lik omsetning er dette *identisk*
 * med full Kelly — en konstant faktor forsvinner i normaliseringen. Regelen står
 * igjen fordi den er etterspurt, og fordi den gjør poenget synlig i UI.
 */
export const w_quarter_kelly: StakeWeightFn = (b) => 0.25 * kellyFraction(b.model_prob, b.odds);
export const w_tiered: StakeWeightFn = (b) => {
  if (b.value < 0.2) return 0.5;
  if (b.value < 0.3) return 1;
  if (b.value < 0.45) return 1.5;
  return 2;
};
export const w_inverse_odds: StakeWeightFn = (b) => 1 / Math.max(b.odds - 1, 1e-6);

/** Reglene i visningsrekkefølge. `label` er identisk med navnet i Python der regelen finnes. */
export const STAKE_RULES: readonly StakeRule[] = [
  { id: 'flat', label: 'Flat (dagens)', weight: w_flat },
  { id: 'linear_ev', label: 'Lineær i EV', weight: w_linear_ev },
  { id: 'ev_squared', label: 'EV i annen (aggressiv)', weight: w_ev_squared },
  { id: 'tiered', label: 'Trappetrinn 0.5/1/1.5/2x', weight: w_tiered },
  { id: 'kelly', label: 'Kelly (rå modellprob)', weight: w_kelly },
  { id: 'quarter_kelly', label: 'Kvart Kelly (rå modellprob)', weight: w_quarter_kelly },
  { id: 'inverse_odds', label: 'Kun 1/(odds-1), ignorer EV', weight: w_inverse_odds },
];

/**
 * Normaliserer vektene til `budget` (default: samme totale omsetning som flat
 * innsats, 100 kr × n). Da måler vi regelen, ikke risikonivået.
 */
export function applyStakeRule(
  bets: readonly AnalysisBet[],
  weight: StakeWeightFn,
  budget?: number,
): StakeRuleResult {
  const n = bets.length;
  if (n === 0) {
    return { n: 0, staked: 0, profit: 0, roi: 0, min_stake: 0, max_stake: 0, stakes: [] };
  }
  const target = budget ?? FLAT_STAKE * n;
  const weights = bets.map((b) => Math.max(weight(b), 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    return { n, staked: 0, profit: 0, roi: 0, min_stake: 0, max_stake: 0, stakes: [] };
  }
  const stakes = weights.map((w) => (target * w) / totalWeight);
  let profit = 0;
  let staked = 0;
  for (let i = 0; i < n; i += 1) {
    profit += stakes[i] * profitPerKrone(bets[i]);
    staked += stakes[i];
  }
  return {
    n,
    staked,
    profit,
    roi: staked !== 0 ? profit / staked : 0,
    min_stake: Math.min(...stakes),
    max_stake: Math.max(...stakes),
    stakes,
  };
}

/**
 * Trekker spill med tilbakelegging og måler differansen i resultat mellom
 * regelen og flat innsats ved lik omsetning.
 */
export function bootstrapDifference(
  bets: readonly AnalysisBet[],
  weight: StakeWeightFn,
  options: { rounds?: number; seed?: number } = {},
): BootstrapResult {
  const n = bets.length;
  if (n === 0) return { mean: 0, lo: 0, hi: 0, p_better: 0 };

  const rounds = options.rounds ?? BOOTSTRAP_ROUNDS;
  const rng = mulberry32(options.seed ?? BOOTSTRAP_SEED);
  const budget = FLAT_STAKE * n;
  const pk = bets.map(profitPerKrone);
  const w = bets.map((b) => Math.max(weight(b), 0));

  const diffs: number[] = [];
  const idx = new Int32Array(n);
  let better = 0;
  for (let round = 0; round < rounds; round += 1) {
    let tw = 0;
    for (let i = 0; i < n; i += 1) {
      const j = randInt(rng, n);
      idx[i] = j;
      tw += w[j];
    }
    if (tw <= 0) continue;
    let schemeProfit = 0;
    let flatProfit = 0;
    for (let i = 0; i < n; i += 1) {
      const j = idx[i];
      schemeProfit += ((budget * w[j]) / tw) * pk[j];
      flatProfit += FLAT_STAKE * pk[j];
    }
    const d = schemeProfit - flatProfit;
    diffs.push(d);
    if (d > 0) better += 1;
  }
  if (diffs.length === 0) return { mean: 0, lo: 0, hi: 0, p_better: 0 };
  const { lo, hi } = percentiles(diffs, 0.95);
  return {
    mean: diffs.reduce((a, b) => a + b, 0) / diffs.length,
    lo,
    hi,
    p_better: better / diffs.length,
  };
}

/** Én rad per regel: resultat, ROI, differanse mot flat og bootstrap-usikkerhet. */
export function stakeRuleTable(
  bets: readonly AnalysisBet[],
  options: { rules?: readonly StakeRule[]; bootstrapRounds?: number; seed?: number } = {},
): StakeRuleRow[] {
  const rules = options.rules ?? STAKE_RULES;
  const baseline = applyStakeRule(bets, w_flat);
  return rules.map((rule) => {
    const res = applyStakeRule(bets, rule.weight);
    return {
      id: rule.id,
      label: rule.label,
      staked: res.staked,
      profit: res.profit,
      roi: res.roi,
      min_stake: res.min_stake,
      max_stake: res.max_stake,
      delta_vs_flat: res.profit - baseline.profit,
      bootstrap:
        rule.id === 'flat'
          ? { mean: 0, lo: 0, hi: 0, p_better: 0 }
          : bootstrapDifference(bets, rule.weight, {
              rounds: options.bootstrapRounds,
              seed: options.seed,
            }),
    };
  });
}

// --------------------------------------------------------------------------- //
// Equity-kurve
// --------------------------------------------------------------------------- //

/**
 * Kumulativ nettogevinst per dato for én innsatsregel, med innsatsene
 * normalisert over hele utvalget (som i tabellen over).
 *
 * `dates` skal være `portfolio.timeseries[].date` når kurven brukes som
 * overlegg — da får den nøyaktig samme x-akse, også på dager uten spill
 * (verdien bæres videre). Uten `dates` brukes datoene som finnes i utvalget.
 */
export function equityCurve(
  bets: readonly AnalysisBet[],
  weight: StakeWeightFn,
  dates?: readonly string[],
): EquityPoint[] {
  const { stakes } = applyStakeRule(bets, weight);
  const byDate = new Map<string, number>();
  for (let i = 0; i < bets.length; i += 1) {
    const pnl = (stakes[i] ?? 0) * profitPerKrone(bets[i]);
    byDate.set(bets[i].date, (byDate.get(bets[i].date) ?? 0) + pnl);
  }
  const axis = dates ?? Array.from(byDate.keys()).sort();
  let cumulative = 0;
  return axis.map((date) => {
    cumulative += byDate.get(date) ?? 0;
    return { date, value: cumulative };
  });
}

/** Equity-kurver for flere regler samtidig, på felles akse. */
export function equityCurves(
  bets: readonly AnalysisBet[],
  dates?: readonly string[],
  rules: readonly StakeRule[] = STAKE_RULES,
): { id: string; label: string; points: EquityPoint[] }[] {
  return rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    points: equityCurve(bets, rule.weight, dates),
  }));
}

// --------------------------------------------------------------------------- //
// Sammendrag
// --------------------------------------------------------------------------- //

export function summarize(bets: readonly AnalysisBet[]): AnalysisSummary {
  const n = bets.length;
  if (n === 0) {
    return {
      n: 0,
      hits: 0,
      expected_hits_model: 0,
      expected_hits_market: 0,
      staked: 0,
      profit: 0,
      roi: 0,
      hit_rate: 0,
      wilson: { lo: 0, hi: 0 },
    };
  }
  let hits = 0;
  let model = 0;
  let market = 0;
  let staked = 0;
  let profit = 0;
  for (const b of bets) {
    if (isWon(b)) hits += 1;
    model += b.model_prob;
    market += b.implied_prob;
    staked += b.stake;
    profit += b.stake * profitPerKrone(b);
  }
  return {
    n,
    hits,
    expected_hits_model: model,
    expected_hits_market: market,
    staked,
    profit,
    roi: staked !== 0 ? profit / staked : 0,
    hit_rate: hits / n,
    wilson: wilsonInterval(hits, n),
  };
}

/**
 * Alt på én gang. Kalleren sender rå `portfolio.json:bets[]`; filtrering og
 * sortering skjer her. Tung nok til at den bør ligge i en `useMemo`.
 */
export function analyze(
  bets: readonly AnalysisBet[],
  options: AnalyzeOptions = {},
): AnalysisResult {
  const settled = settledBets(bets, options);
  const corrOptions = { rounds: options.permutationRounds, seed: options.seed };
  return {
    summary: summarize(settled),
    calibration: calibrationBuckets(settled, options.calibrationBuckets ?? 6),
    ev_buckets: evBuckets(settled),
    odds_buckets: oddsBuckets(settled),
    ev_correlation: correlationTest(settled, 'value', corrOptions),
    odds_correlation: correlationTest(settled, 'odds', corrOptions),
    rules: stakeRuleTable(settled, {
      bootstrapRounds: options.bootstrapRounds,
      seed: options.seed,
    }),
  };
}
