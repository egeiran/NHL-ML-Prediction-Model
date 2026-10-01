/**
 * Verifikasjon av `lib/sesong.ts`. Kjøres med:
 *
 *     node --experimental-strip-types nhl-frontend/lib/sesong.test.mjs
 *
 * Samme mønster som `spill.test.mjs`: ingen testrammeverk, ingen
 * npm-avhengigheter, exit-kode 1 ved avvik.
 *
 * Hvorfor denne finnes: da 2026-27 startet, forsvant hele 2025-26 fra
 * Historikk fordi `portfolio.json` bare har nyeste sesong. Sesongskillet må
 * være det samme som pipelinens (`season_of()` i `bet_tracker.py`, 1. juli),
 * ellers havner rader uten `season` i feil sesong.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

const HER = dirname(fileURLToPath(import.meta.url));
const ROT = resolve(HER, '..');

registerHooks({
    resolve(spec, ctx, neste) {
        if (!spec.startsWith('@/')) return neste(spec, ctx);
        const base = join(ROT, spec.slice(2));
        const fil = existsSync(`${base}.ts`) ? `${base}.ts` : base;
        return { url: pathToFileURL(fil).href, shortCircuit: true };
    },
});

const { ALLE_SESONGER, sesongAv, radSesong, sesongerI, lesSesong, filtrerSesong, sesongEtikett, sesongValg } =
    await import(join(HER, 'sesong.ts'));

let feil = 0;
let ok = 0;

function sjekk(navn, faktisk, forventet) {
    if (Object.is(faktisk, forventet)) {
        ok += 1;
        console.log(`  ok    ${navn.padEnd(52)} ${JSON.stringify(faktisk)}`);
    } else {
        feil += 1;
        console.log(`  FEIL  ${navn}\n        fikk ${JSON.stringify(faktisk)}, ventet ${JSON.stringify(forventet)}`);
    }
}

function seksjon(t) {
    console.log(`\n${t}\n${'-'.repeat(78)}`);
}

/* -------------------------------------------------------------------------- */

seksjon('sesongAv — samme skille som season_of() i bet_tracker.py');
sjekk('2025-12-06', sesongAv('2025-12-06'), '2025-26');
sjekk('2026-06-30 (sesongslutt)', sesongAv('2026-06-30'), '2025-26');
sjekk('2026-07-01 (ny sesong)', sesongAv('2026-07-01'), '2026-27');
sjekk('2026-10-08', sesongAv('2026-10-08'), '2026-27');
sjekk('2099-09-01 (to-sifret slutt)', sesongAv('2099-09-01'), '2099-00');
sjekk('tom streng', sesongAv(''), '');
sjekk('null', sesongAv(null), '');

seksjon('radSesong — season vinner, dato er reserve');
sjekk('har season', radSesong({ season: '2025-26', date: '2026-10-01' }), '2025-26');
sjekk('tom season', radSesong({ season: '', date: '2026-10-01' }), '2026-27');
sjekk('mangler season', radSesong({ date: '2026-03-01' }), '2025-26');

const portefølje = [
    { season: '2025-26', date: '2026-03-01' },
    { season: '2026-27', date: '2026-09-30' },
];
const skygge = [{ date: '2026-01-16' }, { date: '2027-01-02' }];

seksjon('sesongerI — union over loggene, eldste først');
sjekk('union', sesongerI(portefølje, skygge).join(','), '2025-26,2026-27');
sjekk('tomme lister', sesongerI([], []).length, 0);

seksjon('lesSesong — ukjent verdi faller til standard');
const kjente = ['2025-26', '2026-27'];
sjekk('kjent sesong', lesSesong('2025-26', kjente, '2026-27'), '2025-26');
sjekk('alle', lesSesong('alle', kjente, '2026-27'), ALLE_SESONGER);
sjekk('ukjent sesong', lesSesong('2019-20', kjente, '2026-27'), '2026-27');
sjekk('mangler', lesSesong(null, kjente, '2026-27'), '2026-27');

seksjon('filtrerSesong');
sjekk('2025-26', filtrerSesong(portefølje, '2025-26').length, 1);
sjekk('2026-27 via dato', filtrerSesong(skygge, '2026-27').length, 1);
sjekk('alle', filtrerSesong(portefølje, ALLE_SESONGER).length, 2);
sjekk('alle gir ny array', filtrerSesong(portefølje, ALLE_SESONGER) !== portefølje, true);

seksjon('Etiketter og piller');
sjekk('2025-26 → 2025/26', sesongEtikett('2025-26'), '2025/26');
sjekk('alle', sesongEtikett(ALLE_SESONGER), 'Alle sesonger');
sjekk(
    'nyeste først, Alle sist',
    sesongValg(kjente).map((o) => o.value).join(','),
    '2026-27,2025-26,alle',
);
sjekk('inndata muteres ikke', kjente.join(','), '2025-26,2026-27');

/* -------------------------------------------------------------------------- */

console.log(`\n${'='.repeat(78)}`);
if (feil === 0) {
    console.log(`ALLE ${ok} SJEKKER OK`);
    console.log('='.repeat(78));
} else {
    console.log(`${feil} AVVIK av ${ok + feil} sjekker`);
    console.log('='.repeat(78));
    process.exit(1);
}
