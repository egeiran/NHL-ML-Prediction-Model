/**
 * Verifikasjon av lib/analysis.ts mot fasiten i docs/blalinja/stake_truth.json.
 *
 * Kjør (fra repo-rot eller nhl-frontend/, begge går):
 *
 *     node --experimental-strip-types nhl-frontend/lib/analysis.test.mjs
 *
 * Node 22.6+ har innebygd type-stripping. Skriptet oppdager selv om flagget
 * mangler eller Node er for gammel, og faller da tilbake på å kompilere
 * lib/analysis.ts med den lokale `tsc` til en midlertidig fil under /tmp.
 * Ingen testrammeverk, ingen npm-avhengigheter.
 *
 * Toleranser:
 *   - Deterministiske tall (bøtter, r, slope, resultat i kr, ROI, omsetning)
 *     kreves like innenfor 1e-6 relativt / 1e-6 absolutt.
 *   - Monte Carlo-tall er IKKE reproduserbare siffer for siffer: Python bruker
 *     Mersenne Twister med 20 000 bootstrap-runder, vi bruker mulberry32 med
 *     10 000. Da gjelder:
 *       permutasjons-p:        ±0,03 absolutt
 *       bootstrap mean:        ±10 % relativt, minst ±75 kr
 *       bootstrap lo/hi:       ±12 % relativt, minst ±250 kr
 *       bootstrap p_better:    ±0,04 absolutt
 *     Grensene er satt romslig nok til å tåle seed-bytte, og stramt nok til at
 *     en reell feil i normaliseringen ville slått gjennom.
 */

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const REPO = resolve(FRONTEND, '..');

const PORTFOLIO = join(FRONTEND, 'public', 'data', 'portfolio.json');
const TRUTH = join(REPO, 'docs', 'blalinja', 'stake_truth.json');
const MODULE = join(HERE, 'analysis.ts');

// --------------------------------------------------------------------------- //
// Last modulen: strip-types hvis mulig, ellers tsc → /tmp
// --------------------------------------------------------------------------- //
async function loadModule() {
  try {
    const mod = await import(pathToFileURL(MODULE).href);
    console.log('modul lastet via Node type-stripping (' + process.version + ')');
    return mod;
  } catch (err) {
    console.log('type-stripping utilgjengelig (' + (err && err.message) + '), kompilerer med tsc');
  }
  const out = mkdtempSync(join(tmpdir(), 'nhl-analysis-'));
  const tsc = join(FRONTEND, 'node_modules', '.bin', 'tsc');
  execFileSync(
    tsc,
    [
      MODULE,
      '--outDir', out,
      '--module', 'esnext',
      '--target', 'es2020',
      '--moduleResolution', 'bundler',
      '--strict',
      '--skipLibCheck',
    ],
    { stdio: 'inherit' },
  );
  // tsc skriver analysis.js; gi den .mjs så Node laster den som ESM.
  const js = readFileSync(join(out, 'analysis.js'), 'utf8');
  const mjs = join(out, 'analysis.mjs');
  writeFileSync(mjs, js);
  console.log('modul kompilert med tsc → ' + mjs);
  return import(pathToFileURL(mjs).href);
}

// --------------------------------------------------------------------------- //
// Assert-hjelpere
// --------------------------------------------------------------------------- //
let failures = 0;
let checks = 0;

function pass(label, got, want, extra) {
  checks += 1;
  console.log('  ok    ' + label.padEnd(46) + fmt(got) + '  (fasit ' + fmt(want) + ')' + (extra || ''));
}

function fail(label, got, want, extra) {
  checks += 1;
  failures += 1;
  console.log('  FEIL  ' + label.padEnd(46) + fmt(got) + '  (fasit ' + fmt(want) + ')' + (extra || ''));
}

function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) >= 100 ? 3 : 6);
}

/** Deterministisk likhet. */
function eq(label, got, want, absTol = 1e-6, relTol = 1e-6) {
  const tol = Math.max(absTol, Math.abs(want) * relTol);
  if (Math.abs(got - want) <= tol) pass(label, got, want);
  else fail(label, got, want, '  avvik ' + (got - want).toExponential(3));
}

/** Monte Carlo-likhet med dokumentert slingringsmonn. */
function near(label, got, want, absTol, relTol = 0) {
  const tol = Math.max(absTol, Math.abs(want) * relTol);
  if (Math.abs(got - want) <= tol) pass(label, got, want, '  ±' + tol.toFixed(2));
  else fail(label, got, want, '  avvik ' + (got - want).toFixed(2) + ' > ±' + tol.toFixed(2));
}

function section(title) {
  console.log('\n== ' + title);
}

// --------------------------------------------------------------------------- //
// Kjøring
// --------------------------------------------------------------------------- //
const A = await loadModule();
const portfolio = JSON.parse(readFileSync(PORTFOLIO, 'utf8'));
const truth = JSON.parse(readFileSync(TRUTH, 'utf8'));

const TRUTH_SCHEME_BY_LABEL = (key) =>
  Object.fromEntries(truth[key].schemes.map((s) => [s.name, s]));

for (const [truthKey, excludeDraw] of [['all', false], ['no_draw', true]]) {
  const t = truth[truthKey];
  const bets = A.settledBets(portfolio.bets, { excludeDraw });

  console.log('\n' + '='.repeat(78));
  console.log('UTVALG "' + truthKey + '" — ' + t.label);
  console.log('='.repeat(78));

  // ---- 1) Sammendrag ------------------------------------------------------ //
  section('Sammendrag');
  const s = A.summarize(bets);
  eq('n', s.n, t.n);
  eq('treff', s.hits, t.hits);
  eq('treffrate', s.hit_rate, t.hits / t.n);
  eq('modell forventet (sum model_prob)', s.expected_hits_model, sum(t.buckets, 'model_expected'), 1e-6);
  eq('marked forventet (sum implied_prob)', s.expected_hits_market, sum(t.buckets, 'market_expected'), 1e-6);
  eq('omsetning', s.staked, t.schemes[0].staked, 1e-6);
  eq('profit (kr)', s.profit, t.schemes[0].profit, 1e-6);
  eq('roi', s.roi, t.schemes[0].roi);
  const w = s.wilson;
  if (w.lo < s.hit_rate && s.hit_rate < w.hi && w.lo >= 0 && w.hi <= 1) {
    pass('wilson omslutter treffraten', w.lo, w.hi, ' … ' + fmt(w.hi));
  } else {
    fail('wilson omslutter treffraten', w.lo, w.hi);
  }

  // ---- 2) EV-bøtter ------------------------------------------------------- //
  section('EV-kvartiler');
  compareBuckets(A.evBuckets(bets), t.buckets, 'EV');

  // ---- 3) Odds-bøtter ----------------------------------------------------- //
  section('Odds-kvartiler');
  compareBuckets(A.oddsBuckets(bets), t.odds_buckets, 'odds');

  // ---- 4) Korrelasjoner --------------------------------------------------- //
  section('Korrelasjon + permutasjonstest');
  const evc = A.correlationTest(bets, 'value');
  eq('EV r', evc.r, t.correlation.r);
  eq('EV slope', evc.slope, t.correlation.slope);
  near('EV p-verdi', evc.p_value, t.correlation.p_value, 0.03);
  const oc = A.correlationTest(bets, 'odds');
  eq('odds r', oc.r, t.odds_correlation.r);
  eq('odds slope', oc.slope, t.odds_correlation.slope);
  near('odds p-verdi', oc.p_value, t.odds_correlation.p_value, 0.03);

  // ---- 5) Innsatsregler --------------------------------------------------- //
  section('Innsatsregler (lik omsetning som flat)');
  const truthByLabel = TRUTH_SCHEME_BY_LABEL(truthKey);
  const rows = A.stakeRuleTable(bets);
  for (const row of rows) {
    const ref = truthByLabel[row.label];
    if (!ref) {
      console.log('  info  ' + row.label.padEnd(46) + 'ingen fasitrad — hopper over');
      continue;
    }
    eq(row.label + ' · omsetning', row.staked, ref.staked, 1e-6, 1e-9);
    eq(row.label + ' · resultat kr', row.profit, ref.profit, 1e-6, 1e-9);
    eq(row.label + ' · roi', row.roi, ref.roi, 1e-9, 1e-9);
    eq(row.label + ' · vs flat', row.delta_vs_flat, ref.delta_vs_flat, 1e-6, 1e-9);
    eq(row.label + ' · min innsats', row.min_stake, ref.min_stake, 1e-6, 1e-9);
    eq(row.label + ' · maks innsats', row.max_stake, ref.max_stake, 1e-6, 1e-9);
  }

  // Kvart Kelly må være identisk med Kelly etter normalisering.
  const kelly = rows.find((r) => r.id === 'kelly');
  const quarter = rows.find((r) => r.id === 'quarter_kelly');
  eq('kvart Kelly ≡ Kelly (normalisert)', quarter.profit, kelly.profit, 1e-6);

  // ---- 6) Bootstrap ------------------------------------------------------- //
  section('Bootstrap-differanse mot flat (Monte Carlo — romslig toleranse)');
  for (const row of rows) {
    const ref = truth[truthKey].bootstrap[row.label];
    if (!ref) continue;
    near(row.label + ' · snitt kr', row.bootstrap.mean, ref.mean, 75, 0.1);
    near(row.label + ' · lo', row.bootstrap.lo, ref.lo, 250, 0.12);
    near(row.label + ' · hi', row.bootstrap.hi, ref.hi, 250, 0.12);
    near(row.label + ' · p_better', row.bootstrap.p_better, ref.p_better, 0.04);
  }

  // ---- 7) Kalibreringsbøtter --------------------------------------------- //
  section('Kalibreringsbøtter (ingen fasitrad — interne invarianter)');
  for (const k of [5, 6]) {
    const cal = A.calibrationBuckets(bets, k);
    const total = cal.reduce((a, b) => a + b.n, 0);
    const hits = cal.reduce((a, b) => a + b.hits, 0);
    eq(k + ' bøtter · sum n', total, t.n);
    eq(k + ' bøtter · sum treff', hits, t.hits);
    const monotone = cal.every((b, i) => i === 0 || b.model_mean >= cal[i - 1].model_mean);
    const wilsonOk = cal.every((b) => b.wilson.lo <= b.hit_rate && b.hit_rate <= b.wilson.hi);
    const impliedOk = cal.every((b) => b.implied_mean > 0 && b.implied_mean < 1);
    if (monotone && wilsonOk && impliedOk) pass(k + ' bøtter · stigende snitt + wilson + implied', 1, 1);
    else fail(k + ' bøtter · stigende snitt + wilson + implied', 0, 1);
    const spread = Math.max(...cal.map((b) => b.n)) - Math.min(...cal.map((b) => b.n));
    if (spread <= 1) pass(k + ' bøtter · maks 1 spill i forskjell', spread, 0);
    else fail(k + ' bøtter · maks 1 spill i forskjell', spread, 0);
  }

  // ---- 8) Equity-kurve ---------------------------------------------------- //
  section('Equity-kurve per regel');
  const axis = portfolio.timeseries.map((p) => p.date);
  for (const rule of A.STAKE_RULES) {
    const curve = A.equityCurve(bets, rule.weight, axis);
    const res = A.applyStakeRule(bets, rule.weight);
    if (curve.length !== axis.length) {
      fail(rule.label + ' · punkter', curve.length, axis.length);
    } else {
      eq(rule.label + ' · sluttverdi = profit', curve[curve.length - 1].value, res.profit, 1e-6);
    }
  }
  const flatCurve = A.equityCurve(bets, A.w_flat, axis);
  const datesMatch = flatCurve.every((p, i) => p.date === axis[i]);
  if (datesMatch) pass('kurvens datoakse = timeseries[].date', axis.length, axis.length);
  else fail('kurvens datoakse = timeseries[].date', 0, 1);
  if (truthKey === 'all') {
    // Flat kurve må lande på portfolio.timeseries siste kumulative nettogevinst.
    const last = portfolio.timeseries[portfolio.timeseries.length - 1].value;
    eq('flat kurve slutt = timeseries siste value', flatCurve[flatCurve.length - 1].value, last, 1e-6);
  }
}

// --------------------------------------------------------------------------- //
// Enhetssjekker uten fasit
// --------------------------------------------------------------------------- //
console.log('\n' + '='.repeat(78));
console.log('ENHETSSJEKKER');
console.log('='.repeat(78));

section('quantileBuckets');
{
  const sizes = A.quantileBuckets(Array.from({ length: 202 }, (_, i) => i), 4).map((b) => b.length);
  const want = [50, 51, 50, 51];
  if (sizes.join(',') === want.join(',')) pass('202 → 4 bøtter', sizes.join('/'), want.join('/'));
  else fail('202 → 4 bøtter', sizes.join('/'), want.join('/'));
}

section('wilsonInterval');
{
  // Uavhengig referanse (regnet i Python): 68/202 → [0.2750534, 0.4043118]
  const w = A.wilsonInterval(68, 202);
  eq('lo(68/202)', w.lo, 0.2750534, 1e-6, 0);
  eq('hi(68/202)', w.hi, 0.4043118, 1e-6, 0);
  const zero = A.wilsonInterval(0, 10);
  eq('lo(0/10)', zero.lo, 0, 1e-12, 0);
}

section('mulberry32 determinisme');
{
  const a = A.mulberry32(A.BOOTSTRAP_SEED);
  const b = A.mulberry32(A.BOOTSTRAP_SEED);
  const same = Array.from({ length: 1000 }, () => a() === b()).every(Boolean);
  if (same) pass('samme seed → samme sekvens', 1, 1);
  else fail('samme seed → samme sekvens', 0, 1);
  const rng = A.mulberry32(1);
  const draws = Array.from({ length: 20000 }, () => rng());
  const mean = draws.reduce((x, y) => x + y, 0) / draws.length;
  near('uniform snitt ≈ 0.5', mean, 0.5, 0.02);
}

section('analyze() determinisme');
{
  const one = A.analyze(portfolio.bets);
  const two = A.analyze(portfolio.bets);
  if (JSON.stringify(one) === JSON.stringify(two)) pass('to kall gir identisk resultat', 1, 1);
  else fail('to kall gir identisk resultat', 0, 1);
  // Antallet hentes fra fasiten, ikke skrives inn her: `portfolio.json` vokser
  // for hver kjøring, og da skal `stake_truth.json` regenereres – ikke to
  // steder oppdateres i takt.
  eq('analyze().summary.n', one.summary.n, truth.all.n);
  eq(
    'analyze() ekskl. draw',
    A.analyze(portfolio.bets, { excludeDraw: true }).summary.n,
    truth.no_draw.n,
  );
}

console.log('\n' + '='.repeat(78));
console.log(failures === 0 ? 'ALLE ' + checks + ' SJEKKER OK' : failures + ' AV ' + checks + ' SJEKKER FEILET');
console.log('='.repeat(78));
process.exit(failures === 0 ? 0 : 1);

// --------------------------------------------------------------------------- //
function sum(rows, field) {
  return rows.reduce((a, b) => a + b[field], 0);
}

function compareBuckets(got, want, kind) {
  if (got.length !== want.length) {
    fail(kind + ' · antall bøtter', got.length, want.length);
    return;
  }
  for (let i = 0; i < want.length; i += 1) {
    const g = got[i];
    const t = want[i];
    const tag = kind + '[' + i + ']';
    eq(tag + ' lo', g.lo, t.ev_lo);
    eq(tag + ' hi', g.hi, t.ev_hi);
    eq(tag + ' n', g.n, t.n);
    eq(tag + ' treff', g.hits, t.hits);
    eq(tag + ' treffrate', g.hit_rate, t.hit_rate);
    eq(tag + ' modell forventet', g.model_expected, t.model_expected, 1e-6);
    eq(tag + ' marked forventet', g.market_expected, t.market_expected, 1e-6);
    eq(tag + ' roi', g.roi, t.roi, 1e-9);
    eq(tag + ' kr (flat)', g.profit_flat, t.profit_flat, 1e-6);
  }
}
