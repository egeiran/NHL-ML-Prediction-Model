/**
 * Analyselogikk for kalibrering, EV-bøtter og innsatsregler.
 *
 * Alt her er rene funksjoner uten React-avhengigheter, slik at tallene kan
 * verifiseres mot `NHL/analyze_stake_sizing.py`. Bøttegrensene, vektene og
 * normaliseringen er med vilje identiske med skriptet – avvik betyr som regel
 * at noe er bøttet ulikt eller at `pending`-rader har sneket seg med.
 *
 * Datagrunnlaget er `portfolio.json` sin `bets`-array, som allerede lastes av
 * frontenden. Ingenting her trenger backend.
 */
import { BetEntry } from '@/types';

export const FLAT_STAKE = 100;
export const START_BANKROLL = 20000;
export const MAX_DAY_FRACTION = 0.25;

/** Et spill som faktisk har gått ferdig. `pending` har ikke noe utfall å måle. */
export type SettledBet = BetEntry & { status: 'won' | 'lost' };

export function isSettled(bet: BetEntry): bet is SettledBet {
  return bet.status === 'won' || bet.status === 'lost';
}

/**
 * Avregnede spill, sortert kronologisk. Sorteringen er den samme som i
 * Python-skriptet (dato, hjemmelag, bortelag), slik at bøtter med like verdier
 * deles på samme sted i begge implementasjonene.
 */
export function selectSettled(bets: BetEntry[], includeDraws: boolean): SettledBet[] {
  return bets
    .filter(isSettled)
    .filter((bet) => includeDraws || bet.selection !== 'draw')
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const byHome = (a.home_abbr ?? '').localeCompare(b.home_abbr ?? '');
      if (byHome !== 0) return byHome;
      return (a.away_abbr ?? '').localeCompare(b.away_abbr ?? '');
    });
}

/** Resultat per krone satset: odds−1 ved treff, −1 ellers. */
export function profitPerKrone(bet: SettledBet): number {
  return bet.status === 'won' ? bet.odds - 1 : -1;
}

// --------------------------------------------------------------------------- //
// Statistikk
// --------------------------------------------------------------------------- //

/**
 * Wilson-konfidensintervall for en andel. Med ~35 spill per bøtte er normal-
 * approksimasjonen for dårlig, og intervallet må uansett vises – uten det er
 * bøttetabellene direkte villedende.
 */
export function wilsonInterval(hits: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 0 };
  const z2 = z * z;
  const denom = n + z2;
  const centre = (hits + z2 / 2) / denom;
  const margin = (z / denom) * Math.sqrt((hits * (n - hits)) / n + z2 / 4);
  return { lo: Math.max(0, centre - margin), hi: Math.min(1, centre + margin) };
}

/**
 * Deler i like store bøtter etter `key`. Kvantiler, ikke faste intervaller –
 * utvalget er skjevt, og faste intervaller ville gitt bøtter med 3 spill i.
 */
export function quantileBuckets<T>(items: T[], key: (item: T) => number, count: number): T[][] {
  const sorted = [...items].sort((a, b) => key(a) - key(b));
  const buckets: T[][] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor((i * sorted.length) / count);
    const to = Math.floor(((i + 1) * sorted.length) / count);
    const chunk = sorted.slice(from, to);
    if (chunk.length > 0) buckets.push(chunk);
  }
  return buckets;
}

export type BucketStat = {
  lo: number;
  hi: number;
  n: number;
  hits: number;
  hitRate: number;
  ci: { lo: number; hi: number };
  modelExpected: number;
  marketExpected: number;
  roi: number;
  profitFlat: number;
};

export function bucketStats(bets: SettledBet[], key: (bet: SettledBet) => number): BucketStat {
  const hits = bets.filter((b) => b.status === 'won').length;
  const pnl = bets.reduce((sum, b) => sum + profitPerKrone(b), 0);
  const values = bets.map(key);
  return {
    lo: Math.min(...values),
    hi: Math.max(...values),
    n: bets.length,
    hits,
    hitRate: bets.length ? hits / bets.length : 0,
    ci: wilsonInterval(hits, bets.length),
    modelExpected: bets.reduce((sum, b) => sum + b.model_prob, 0),
    marketExpected: bets.reduce((sum, b) => sum + b.implied_prob, 0),
    roi: bets.length ? pnl / bets.length : 0,
    profitFlat: pnl * FLAT_STAKE,
  };
}

export function bucketTable(
  bets: SettledBet[],
  key: (bet: SettledBet) => number,
  count = 4,
): BucketStat[] {
  return quantileBuckets(bets, key, count).map((bucket) => bucketStats(bucket, key));
}

export type CalibrationPoint = {
  predicted: number;
  actual: number;
  n: number;
  ci: { lo: number; hi: number };
};

/**
 * Kalibreringskurve for én sannsynlighetskilde. Bøttene lages på kildens egne
 * tall, slik at hvert punkt svarer på «når denne kilden sier X %, hvor ofte
 * skjer det?». Modell og marked må derfor bøttes hver for seg.
 */
export function calibrationCurve(
  bets: SettledBet[],
  probOf: (bet: SettledBet) => number,
  count = 5,
): CalibrationPoint[] {
  return quantileBuckets(bets, probOf, count).map((bucket) => {
    const hits = bucket.filter((b) => b.status === 'won').length;
    return {
      predicted: bucket.reduce((sum, b) => sum + probOf(b), 0) / bucket.length,
      actual: hits / bucket.length,
      n: bucket.length,
      ci: wilsonInterval(hits, bucket.length),
    };
  });
}

/** Deterministisk PRNG, så bootstrap-tallene ikke hopper mellom renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Correlation = { r: number; pValue: number; n: number };

/**
 * Pearson-korrelasjon mellom en egenskap og realisert avkastning per krone,
 * med permutasjonstest. Er den ikke signifikant, finnes det ikke noe signal å
 * skalere innsatsen etter – som er hele poenget med figurene over.
 */
export function correlationWithReturn(
  bets: SettledBet[],
  key: (bet: SettledBet) => number,
  rounds = 10000,
  seed = 20260729,
): Correlation {
  const n = bets.length;
  if (n < 3) return { r: 0, pValue: 1, n };

  const xs = bets.map(key);
  const ys = bets.map(profitPerKrone);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;

  const centeredX = xs.map((x) => x - mx);
  const centeredY = ys.map((y) => y - my);
  const rng = mulberry32(seed);
  const shuffled = [...centeredY];
  let extreme = 0;

  for (let round = 0; round < rounds; round += 1) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let s = 0;
    for (let i = 0; i < n; i += 1) s += centeredX[i] * shuffled[i];
    if (Math.abs(s) >= Math.abs(sxy)) extreme += 1;
  }

  return { r, pValue: (extreme + 1) / (rounds + 1), n };
}

// --------------------------------------------------------------------------- //
// Innsatsregler
// --------------------------------------------------------------------------- //

export function kellyFraction(prob: number, odds: number): number {
  if (odds <= 1) return 0;
  return Math.max((prob * odds - 1) / (odds - 1), 0);
}

export type StakingRule = {
  key: string;
  label: string;
  note: string;
  weight: (bet: SettledBet) => number;
};

export const STAKING_RULES: StakingRule[] = [
  {
    key: 'flat',
    label: 'Flat',
    note: 'Samme beløp på hvert spill – dagens regel.',
    weight: () => 1,
  },
  {
    key: 'linear-ev',
    label: 'Lineær i EV',
    note: 'Innsats proporsjonal med forventet return.',
    weight: (bet) => Math.max(bet.value, 0),
  },
  {
    key: 'ev-squared',
    label: 'EV i annen',
    note: 'Aggressiv variant – dobbelt så mye vekt på halen.',
    weight: (bet) => Math.max(bet.value, 0) ** 2,
  },
  {
    key: 'tiered',
    label: 'Trappetrinn',
    note: '0,5x under 20 % EV, så 1x, 1,5x og 2x over 45 %.',
    weight: (bet) => {
      if (bet.value < 0.2) return 0.5;
      if (bet.value < 0.3) return 1;
      if (bet.value < 0.45) return 1.5;
      return 2;
    },
  },
  {
    key: 'kelly',
    label: 'Kelly',
    note: 'f = (p·o − 1)/(o − 1) på modellens rå sannsynlighet.',
    weight: (bet) => kellyFraction(bet.model_prob, bet.odds),
  },
  {
    key: 'inverse-odds',
    label: '1/(odds−1)',
    note: 'Ignorerer EV helt og vekter kun ned utfallets varians.',
    weight: (bet) => 1 / Math.max(bet.odds - 1, 1e-6),
  },
];

export type RuleResult = {
  staked: number;
  profit: number;
  roi: number;
  stakes: number[];
  minStake: number;
  maxStake: number;
};

/**
 * Normaliserer vektene til samme totale omsetning som flat innsats. Uten det
 * sammenligner man risikonivå og ikke regel: en regel som satser dobbelt så
 * mye på alt ville sett dobbelt så god ut i kroner.
 */
export function applyRule(bets: SettledBet[], weight: (bet: SettledBet) => number): RuleResult {
  const empty: RuleResult = { staked: 0, profit: 0, roi: 0, stakes: [], minStake: 0, maxStake: 0 };
  if (bets.length === 0) return empty;

  const budget = FLAT_STAKE * bets.length;
  const weights = bets.map((bet) => Math.max(weight(bet), 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return empty;

  const stakes = weights.map((w) => (budget * w) / totalWeight);
  const profit = stakes.reduce((sum, stake, i) => sum + stake * profitPerKrone(bets[i]), 0);
  const staked = stakes.reduce((a, b) => a + b, 0);

  return {
    staked,
    profit,
    roi: staked ? profit / staked : 0,
    stakes,
    minStake: Math.min(...stakes),
    maxStake: Math.max(...stakes),
  };
}

export type EquityPoint = { date: string; value: number; invested: number; bets: number };

/** Kumulativt realisert resultat per kampdag under en gitt innsatsregel. */
export function equityCurve(
  bets: SettledBet[],
  weight: (bet: SettledBet) => number,
): EquityPoint[] {
  const { stakes } = applyRule(bets, weight);
  if (stakes.length === 0) return [];

  const byDate = new Map<string, { profit: number; invested: number; bets: number }>();
  bets.forEach((bet, i) => {
    const entry = byDate.get(bet.date) ?? { profit: 0, invested: 0, bets: 0 };
    entry.profit += stakes[i] * profitPerKrone(bet);
    entry.invested += stakes[i];
    entry.bets += 1;
    byDate.set(bet.date, entry);
  });

  let running = 0;
  return [...byDate.keys()].sort().map((date) => {
    const entry = byDate.get(date)!;
    running += entry.profit;
    return { date, value: running, invested: entry.invested, bets: entry.bets };
  });
}

export type BootstrapResult = { mean: number; lo: number; hi: number; pBetter: number };

/**
 * Trekker spill med tilbakelegging og måler differansen mot flat innsats ved
 * lik omsetning. Sier hvor mye av forskjellen som bare er varians.
 */
export function bootstrapVsFlat(
  bets: SettledBet[],
  weight: (bet: SettledBet) => number,
  rounds = 10000,
  seed = 20260729,
): BootstrapResult {
  if (bets.length === 0) return { mean: 0, lo: 0, hi: 0, pBetter: 0 };

  const n = bets.length;
  const budget = FLAT_STAKE * n;
  const pk = bets.map(profitPerKrone);
  const w = bets.map((bet) => Math.max(weight(bet), 0));
  const rng = mulberry32(seed);
  const diffs: number[] = [];
  let better = 0;
  const idx = new Array<number>(n);

  for (let round = 0; round < rounds; round += 1) {
    let totalWeight = 0;
    for (let i = 0; i < n; i += 1) {
      const pick = Math.floor(rng() * n);
      idx[i] = pick;
      totalWeight += w[pick];
    }
    if (totalWeight <= 0) continue;

    let rule = 0;
    let flat = 0;
    for (let i = 0; i < n; i += 1) {
      const pick = idx[i];
      rule += ((budget * w[pick]) / totalWeight) * pk[pick];
      flat += FLAT_STAKE * pk[pick];
    }
    const diff = rule - flat;
    diffs.push(diff);
    if (diff > 0) better += 1;
  }

  if (diffs.length === 0) return { mean: 0, lo: 0, hi: 0, pBetter: 0 };
  diffs.sort((a, b) => a - b);
  return {
    mean: diffs.reduce((a, b) => a + b, 0) / diffs.length,
    lo: diffs[Math.floor(0.025 * diffs.length)],
    hi: diffs[Math.max(Math.floor(0.975 * diffs.length) - 1, 0)],
    pBetter: better / diffs.length,
  };
}

export type CompoundResult = { end: number; growth: number; lowest: number; maxDrawdown: number };

/**
 * Ekte Kelly er multiplikativ: innsatsen er en andel av *nåværende* bankrull.
 * Spill samme dag avgjøres samtidig og deler derfor bankrullen ved dagens
 * start. Dette er visningen der overkonfidens gjør mest skade.
 */
export function compoundBankroll(
  bets: SettledBet[],
  weight: (bet: SettledBet) => number,
  scale = 1,
  startBankroll = START_BANKROLL,
  maxFraction = MAX_DAY_FRACTION,
): CompoundResult {
  let bankroll = startBankroll;
  let lowest = startBankroll;

  const byDate = new Map<string, SettledBet[]>();
  bets.forEach((bet) => {
    const list = byDate.get(bet.date) ?? [];
    list.push(bet);
    byDate.set(bet.date, list);
  });

  for (const date of [...byDate.keys()].sort()) {
    const dayBets = byDate.get(date)!;
    let fractions = dayBets.map((bet) => Math.min(Math.max(weight(bet), 0) * scale, maxFraction));
    const totalFraction = fractions.reduce((a, b) => a + b, 0);
    if (totalFraction > maxFraction) {
      fractions = fractions.map((f) => (f * maxFraction) / totalFraction);
    }
    const dayPnl = dayBets.reduce(
      (sum, bet, i) => sum + bankroll * fractions[i] * profitPerKrone(bet),
      0,
    );
    bankroll += dayPnl;
    lowest = Math.min(lowest, bankroll);
    if (bankroll <= 0) break;
  }

  return {
    end: bankroll,
    growth: bankroll / startBankroll - 1,
    lowest,
    maxDrawdown: 1 - lowest / startBankroll,
  };
}
