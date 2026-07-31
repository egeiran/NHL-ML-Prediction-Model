/**
 * Verifikasjon av lib/format.ts.
 *
 * Kjør (fra repo-rot eller nhl-frontend/, begge går):
 *
 *     node --experimental-strip-types nhl-frontend/lib/format.test.mjs
 *
 * Samme mønster som lib/analysis.test.mjs: Node 22.6+ stripper typene selv, og
 * skriptet faller tilbake på den lokale `tsc` hvis ikke. Ingen testrammeverk,
 * ingen npm-avhengigheter.
 *
 * Det viktigste denne fila vokter:
 *   1. Negative tall inneholder U+2212 og ALDRI U+002D. Ett feilaktig
 *      `'-' + tall` et sted i modulen ville slått gjennom her.
 *   2. Fortegn settes av Intl (`signDisplay`), ikke av strengkonkatenering.
 *   3. Mellomrommet foran `%` og `kr` er hardt (U+00A0).
 *   4. Kalenderdatoer (`YYYY-MM-DD`) skifter ikke døgn med maskinens tidssone.
 */

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const MODULE = join(HERE, 'format.ts');

const MINUS = '−';
const HYPHEN = '-';
const NBSP = ' ';
const DASH = '—';

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
  const out = mkdtempSync(join(tmpdir(), 'nhl-format-'));
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
  const js = readFileSync(join(out, 'format.js'), 'utf8');
  const mjs = join(out, 'format.mjs');
  writeFileSync(mjs, js);
  console.log('modul kompilert med tsc → ' + mjs);
  return import(pathToFileURL(mjs).href);
}

// --------------------------------------------------------------------------- //
// Assert-hjelpere
// --------------------------------------------------------------------------- //
let failures = 0;
let checks = 0;

function show(s) {
  return JSON.stringify(String(s))
    .replaceAll(MINUS, '⟨−⟩')
    .replaceAll(NBSP, '⟨nbsp⟩');
}

function pass(label, got, want) {
  checks += 1;
  console.log('  ok    ' + label.padEnd(40) + show(got) + '  (fasit ' + show(want) + ')');
}

function fail(label, got, want) {
  checks += 1;
  failures += 1;
  console.log('  FEIL  ' + label.padEnd(40) + show(got) + '  (fasit ' + show(want) + ')');
}

function is(label, got, want) {
  if (got === want) pass(label, got, want);
  else fail(label, got, want);
}

function ok(label, condition, detalj) {
  checks += 1;
  if (condition) {
    console.log('  ok    ' + label);
  } else {
    failures += 1;
    console.log('  FEIL  ' + label + (detalj ? '  ' + detalj : ''));
  }
}

function section(title) {
  console.log('\n== ' + title);
}

// --------------------------------------------------------------------------- //
// Kjøring
// --------------------------------------------------------------------------- //
const F = await loadModule();

console.log('\n' + '='.repeat(78));
console.log('lib/format.ts — nb-NO');
console.log('='.repeat(78));

// ---- 1) Tegnkonstanter ----------------------------------------------------- //
section('Tegnkonstanter');
is('MINUS er U+2212', F.MINUS, MINUS);
is('NBSP er U+00A0', F.NBSP, NBSP);
is('MANGLER er U+2014', F.MANGLER, DASH);

// ---- 2) Tall --------------------------------------------------------------- //
section('nf() — tusenskille og desimaler');
is('nf(20200)', F.nf(20200), '20' + NBSP + '200');
is('nf(1578)', F.nf(1578), '1' + NBSP + '578');
is('nf(0.7, 2)', F.nf(0.7, 2), '0,70');
is('nf(3.14, 2)', F.nf(3.14, 2), '3,14');
is('nf(-640)', F.nf(-640), MINUS + '640');
is('nf(null)', F.nf(null), DASH);
is('nf(undefined)', F.nf(undefined), DASH);
is('nf(NaN)', F.nf(Number.NaN), DASH);

section('sgnRaw() — eksplisitt fortegn');
is('sgnRaw(80)', F.sgnRaw(80), '+80');
is('sgnRaw(-34)', F.sgnRaw(-34), MINUS + '34');
is('sgnRaw(0)', F.sgnRaw(0), '+0');
is('sgnRaw(-0.4) → ingen «−0»', F.sgnRaw(-0.4), '+0');
is('sgnRaw(1500, 2)', F.sgnRaw(1500, 2), '+1' + NBSP + '500,00');

// ---- 3) Penger ------------------------------------------------------------- //
section('Penger');
is('kr(35)', F.kr(35), '+35' + NBSP + 'kr');
is('kr(-640)', F.kr(-640), MINUS + '640' + NBSP + 'kr');
is('kr(-575)', F.kr(-575), MINUS + '575' + NBSP + 'kr');
is('krp(20200)', F.krp(20200), '20' + NBSP + '200' + NBSP + 'kr');
is('krTabell(165)', F.krTabell(165), '+165');
is('krTabell(-100)', F.krTabell(-100), MINUS + '100');
is('krpTabell(20200)', F.krpTabell(20200), '20' + NBSP + '200');
is('kr(null)', F.kr(null), DASH);

// ---- 4) Prosent ------------------------------------------------------------ //
section('Prosent');
is('pc(0.337)', F.pc(0.337), '33,7' + NBSP + '%');
is('pc(0.002)', F.pc(0.002), '0,2' + NBSP + '%');
is('sgn(0.218)', F.sgn(0.218), '+21,8' + NBSP + '%');
is('sgn(-0.032)', F.sgn(-0.032), MINUS + '3,2' + NBSP + '%');
is('pcRaw(33.7)', F.pcRaw(33.7), '33,7' + NBSP + '%');
is('pcTall(0.44)', F.pcTall(0.44), '44,0');
is('sannsynlighet(0.497)', F.sannsynlighet(0.497), '49,7' + NBSP + '%');
is('pc(null)', F.pc(null), DASH);

// ---- 5) Odds --------------------------------------------------------------- //
section('Odds');
is('odds(2.45)', F.odds(2.45), '2,45');
is('odds(2.2)', F.odds(2.2), '2,20');
is('odds(3.9)', F.odds(3.9), '3,90');
is('odds(null)', F.odds(null), DASH);

// ---- 6) Minustegnet — hovedpoenget ----------------------------------------- //
section('Minustegn U+2212, aldri U+002D');
const negative = [
  ['nf', F.nf(-640)],
  ['nf 2 des', F.nf(-1234.5, 2)],
  ['sgnRaw', F.sgnRaw(-34)],
  ['kr', F.kr(-575)],
  ['krTabell', F.krTabell(-100)],
  ['sgn', F.sgn(-0.032)],
  ['pc', F.pc(-0.15)],
  ['pcRaw', F.pcRaw(-3.2)],
  ['pcTall', F.pcTall(-0.44)],
  ['odds', F.odds(-1.5)],
  ['krp', F.krp(-20200)],
];
for (const [navn, ut] of negative) {
  ok(
    navn + ' inneholder U+2212',
    ut.includes(MINUS),
    'fikk ' + show(ut),
  );
  ok(
    navn + ' inneholder IKKE U+002D',
    !ut.includes(HYPHEN),
    'fikk ' + show(ut),
  );
}

// Alle formatterne, over et bredt tallområde, i én sveip.
section('Sveip: ingen ASCII-bindestrek i noen numerisk utgang');
const funksjoner = ['nf', 'sgnRaw', 'kr', 'krp', 'krTabell', 'krpTabell', 'pc', 'sgn', 'pcRaw', 'pcTall', 'odds', 'sannsynlighet'];
const verdier = [-1e6, -20200.5, -640, -100, -3.14, -1, -0.5, -0.001, 0, 0.001, 1, 3.14, 640, 20200.5, 1e6];
let sveipFeil = 0;
let sveipNeg = 0;
for (const navn of funksjoner) {
  for (const v of verdier) {
    const ut = F[navn](v);
    if (ut.includes(HYPHEN)) {
      sveipFeil += 1;
      console.log('    ' + navn + '(' + v + ') = ' + show(ut));
    }
    if (ut.includes(MINUS)) sveipNeg += 1;
  }
}
ok(
  'ingen U+002D i ' + funksjoner.length * verdier.length + ' utgangsverdier',
  sveipFeil === 0,
  sveipFeil + ' treff',
);
ok('sveipen faktisk traff negative tall (' + sveipNeg + ' stk)', sveipNeg > 50);

// ---- 7) Hardt mellomrom ----------------------------------------------------- //
section('Enhetsmellomrom er hardt (U+00A0)');
ok('pc() bruker NBSP foran %', F.pc(0.337).includes(NBSP + '%'));
ok('sgn() bruker NBSP foran %', F.sgn(0.218).includes(NBSP + '%'));
ok('kr() bruker NBSP foran kr', F.kr(35).includes(NBSP + 'kr'));
ok('krp() bruker NBSP foran kr', F.krp(20200).includes(NBSP + 'kr'));
ok('ingen vanlig mellomrom i kr()', !F.kr(-20200).includes(' '), show(F.kr(-20200)));

// ---- 8) Datoer -------------------------------------------------------------- //
section('Datoer');
is('ds(kalenderdato)', F.ds('2026-06-10'), '10. jun');
is('dl(kalenderdato)', F.dl('2026-06-10'), '10. jun 2026');
is('ds(1. januar)', F.ds('2026-01-01'), '1. jan');
is('ds(mai)', F.ds('2026-05-17'), '17. mai');
is('ds(desember)', F.ds('2025-12-05'), '5. des');
is('dISO(tidsstempel)', F.dISO('2026-07-29T10:48:17.026461+00:00'), '2026-07-29');
is('dISO(kalenderdato)', F.dISO('2026-06-10'), '2026-06-10');
is('klokke(+01:00)', F.klokke('2025-12-05T01:00:00+01:00'), '01:00');
is('klokke(Z om sommeren)', F.klokke('2026-07-29T10:48:17Z'), '12:48');
is('sistOppdatert()', F.sistOppdatert('2026-07-29T08:48:00Z'), '2026-07-29 10:48');
is('ds(null)', F.ds(null), DASH);
is('dl(tull)', F.dl('ikke en dato'), DASH);
is('klokke(null)', F.klokke(null), DASH);

// Kalenderdatoer må ikke skifte døgn med maskinens tidssone.
section('Tidssone-uavhengighet for kalenderdatoer');
ok('maskinens TZ er ' + Intl.DateTimeFormat().resolvedOptions().timeZone, true);
is('ds(2026-01-01) uansett TZ', F.ds('2026-01-01'), '1. jan');
is('dISO(2026-01-01) uansett TZ', F.dISO('2026-01-01'), '2026-01-01');

// ---- 9) Ingen Tailwind-klasser i modulen ------------------------------------ //
section('Ingen presentasjon i formatterne');
const kilde = readFileSync(MODULE, 'utf8');
ok('ingen valueColor-eksport', !/export\s+function\s+valueColor/.test(kilde));
ok('ingen text-\\w+-klassenavn', !/['"`]text-[a-z]+-\d/.test(kilde));
ok(
  'Intl-instanser gjenbrukes (ingen «new Intl» inne i en eksportert funksjon)',
  (kilde.match(/new Intl\./g) || []).length <= 3,
  (kilde.match(/new Intl\./g) || []).length + ' forekomster',
);

console.log('\n' + '='.repeat(78));
console.log(failures === 0 ? 'ALLE ' + checks + ' SJEKKER OK' : failures + ' AV ' + checks + ' SJEKKER FEILET');
console.log('='.repeat(78));
process.exit(failures === 0 ? 0 : 1);
