/**
 * Verifikasjon av `lib/spill.ts`. Kjøres med:
 *
 *     node --experimental-strip-types nhl-frontend/lib/spill.test.mjs
 *
 * Samme mønster som `analysis.test.mjs` og `format.test.mjs`: ingen
 * testrammeverk, ingen npm-avhengigheter, exit-kode 1 ved avvik.
 *
 * Hvorfor denne finnes: `tagg()` er den mest subtile logikken i modulen, og den
 * er endret to ganger under gjennomgangen — først da oddstaket ble innført, så
 * da rekkefølgen mellom `NEI` og `UTELATT` ble snudd. Rekkefølgen er ikke
 * åpenbar fra koden alene, og en regresjon her ville ikke feilet noe: den ville
 * bare fått siten til å love spill pipelinen ikke tar, eller kalle et utfall
 * «kan ikke» der sannheten er «ville ikke».
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

const HER = dirname(fileURLToPath(import.meta.url));
const ROT = resolve(HER, '..');

/**
 * `spill.ts` importerer via `@/...`, som er tsconfig-aliaset for prosjektroten.
 * Node kjenner det ikke, så vi løser det her framfor å endre kildekoden for
 * testens skyld. Bare `.ts` trengs: de eneste kjøretidsimportene er
 * `@/lib/format` og `@/lib/teams` — `@/components/ui` og `@/types` er
 * `import type` og fjernes av type-strippingen.
 */
registerHooks({
    resolve(spec, ctx, neste) {
        if (!spec.startsWith('@/')) return neste(spec, ctx);
        const base = join(ROT, spec.slice(2));
        const fil = existsSync(`${base}.ts`) ? `${base}.ts` : base;
        return { url: pathToFileURL(fil).href, shortCircuit: true };
    },
});

const {
    erTall,
    evAv,
    evForUtfall,
    markedAv,
    overOddstak,
    evTerskelFor,
    utelattGrunn,
    utelattTekst,
    tagg,
    evKlasse,
    stolpeBredde,
    tid,
    nyesteFørst,
} = await import(join(HER, 'spill.ts'));

let feil = 0;
let ok = 0;

function sjekk(navn, faktisk, forventet) {
    const like = Object.is(faktisk, forventet);
    if (like) {
        ok += 1;
    } else {
        feil += 1;
        console.log(`  FEIL  ${navn}\n        fikk ${JSON.stringify(faktisk)}, ventet ${JSON.stringify(forventet)}`);
        return;
    }
    console.log(`  ok    ${navn.padEnd(52)} ${JSON.stringify(faktisk)}`);
}

function nær(navn, faktisk, forventet, tol = 1e-9) {
    const like = typeof faktisk === 'number' && Math.abs(faktisk - forventet) <= tol;
    if (like) {
        ok += 1;
        console.log(`  ok    ${navn.padEnd(52)} ${faktisk}`);
    } else {
        feil += 1;
        console.log(`  FEIL  ${navn}\n        fikk ${faktisk}, ventet ${forventet}`);
    }
}

function seksjon(t) {
    console.log(`\n${t}\n${'-'.repeat(78)}`);
}

/* -------------------------------------------------------------------------- */

seksjon('erTall — bare endelige tall slipper gjennom');
sjekk('erTall(2.45)', erTall(2.45), true);
sjekk('erTall(0)', erTall(0), true);
sjekk('erTall(null)', erTall(null), false);
sjekk('erTall(undefined)', erTall(undefined), false);
sjekk('erTall(NaN)', erTall(NaN), false);
sjekk('erTall(Infinity)', erTall(Infinity), false);

seksjon('evAv — EV = model_prob * odds - 1, ikke model - implied');
nær('evAv(0.497, 2.45)', evAv(0.497, 2.45), 0.497 * 2.45 - 1);
nær('evAv(0.5, 2) er nøyaktig 0', evAv(0.5, 2), 0);
sjekk('evAv(null, 2.45)', evAv(null, 2.45), null);
sjekk('evAv(0.497, null)', evAv(0.497, null), null);

seksjon('evForUtfall — value_* har forrang, formelen er fallback');
// Pipelinen regner value_* fra den urundede sannsynligheten; model_* er rundet
// til tre desimaler. Preferansen er hele poenget med funksjonen.
sjekk('value_* brukes når det finnes', evForUtfall(0.2178, 0.497, 2.45), 0.2178);
nær('faller til formelen uten value_*', evForUtfall(null, 0.497, 2.45), 0.497 * 2.45 - 1);
nær('faller til formelen ved undefined', evForUtfall(undefined, 0.4, 3), 0.4 * 3 - 1);
sjekk('uten odds er EV ukjent', evForUtfall(0.2178, 0.497, null), null);
sjekk('value_* = 0 er en verdi, ikke fravær', evForUtfall(0, 0.497, 2.45), 0);

seksjon('markedAv — feltet fra pipelinen, ellers 1/odds');
sjekk('bruker implisitt når det finnes', markedAv(0.408, 2.45), 0.408);
nær('regner 1/odds uten felt', markedAv(null, 2.5), 0.4);
sjekk('odds 0 gir ingen implisitt', markedAv(null, 0), null);
sjekk('ingen av delene', markedAv(null, null), null);

seksjon('overOddstak — grensen er inklusiv, som i pipelinen');
sjekk('3,99 under taket 4,0', overOddstak(3.99, 4), false);
sjekk('4,0 er PÅ taket og forkastes', overOddstak(4, 4), true);
sjekk('4,5 over taket', overOddstak(4.5, 4), true);
sjekk('uten maxOdds gjelder ingen grense', overOddstak(9.9, null), false);
sjekk('maxOdds 0 er ikke en grense', overOddstak(9.9, 0), false);

seksjon('utelattGrunn — den faktiske grunnen, uavhengig av EV');
// OT/SO er bare `uavgjort` når de er skrudd AV. Er de på, vurderes de på EV
// som alle andre – mot sin egen, høyere terskel.
sjekk('OT/SO avskrudd', utelattGrunn(true, 2.5, 4, false), 'uavgjort');
sjekk('OT/SO avskrudd vinner over oddstak', utelattGrunn(true, 9, 4, false), 'uavgjort');
sjekk('OT/SO påskrudd vurderes på EV', utelattGrunn(true, 2.5, 4, true), null);
sjekk('OT/SO påskrudd fanges av oddstak', utelattGrunn(true, 9, 4, true), 'oddstak');
sjekk('OT/SO uten meta spilles', utelattGrunn(true, 2.5, 4), null);
sjekk('oddstak', utelattGrunn(false, 4.5, 4), 'oddstak');
sjekk('under taket', utelattGrunn(false, 2.5, 4), null);

seksjon('evTerskelFor — OT/SO har en høyere terskel');
sjekk('hjemme bruker den vanlige', evTerskelFor(false, 0.15, 0.3), 0.15);
sjekk('OT/SO bruker sin egen', evTerskelFor(true, 0.15, 0.3), 0.3);
sjekk('slideren kan skjerpe', evTerskelFor(true, 0.4, 0.3), 0.4);
sjekk('slideren kan ikke slakke', evTerskelFor(true, 0.05, 0.3), 0.3);
sjekk('uten draw-terskel gjelder den vanlige', evTerskelFor(true, 0.15, null), 0.15);
sjekk('hjemme rører ikke draw-terskelen', evTerskelFor(false, 0.15, null), 0.15);

sjekk('tekst for uavgjort', utelattTekst('uavgjort'), 'OT/SO spilles ikke');
sjekk('tekst for oddstak', utelattTekst('oddstak'), 'Over pipelinens oddstak');
sjekk('ingen tekst uten grunn', utelattTekst(null), null);

seksjon('tagg — rekkefølgen er hele poenget');
const T = 0.15;
// 1. `uavgjort` som grunn er alltid UTELATT — den settes bare når OT/SO er av.
sjekk('OT/SO avskrudd med høy EV', tagg(0.4, T, 'uavgjort'), 'utelatt');
sjekk('OT/SO avskrudd med negativ EV', tagg(-0.3, T, 'uavgjort'), 'utelatt');
// Er OT/SO på, kommer de hit uten grunn, men mot sin egen terskel (0,30).
sjekk('OT/SO påskrudd, EV 0,20', tagg(0.2, evTerskelFor(true, T, 0.3), null), 'nei');
sjekk('OT/SO påskrudd, EV 0,35', tagg(0.35, evTerskelFor(true, T, 0.3), null), 'spill');
// 2. EV under terskel gir NEI — også over oddstaket. «Ville ikke» slår
//    «kan ikke», fordi det er det informative svaret for en stor outsider.
sjekk('EV under terskel, under taket', tagg(0.05, T, null), 'nei');
sjekk('EV under terskel, OVER taket', tagg(-0.3, T, 'oddstak'), 'nei');
sjekk('EV ukjent', tagg(null, T, null), 'nei');
sjekk('EV ukjent over taket', tagg(null, T, 'oddstak'), 'nei');
// 3. UTELATT på oddstaket bare når utfallet ellers ville kvalifisert.
sjekk('EV over terskel, over taket', tagg(0.3, T, 'oddstak'), 'utelatt');
// 4. Alt klart → SPILL. Terskelen er inklusiv (is_value = EV >= evTerskel).
sjekk('EV over terskel, under taket', tagg(0.3, T, null), 'spill');
sjekk('EV nøyaktig på terskelen', tagg(0.15, T, null), 'spill');
sjekk('EV så vidt under terskelen', tagg(0.1499, T, null), 'nei');
// Et utelatt utfall skal aldri kunne bli SPILL.
for (const ev of [-1, -0.3, 0, 0.15, 0.3, 5]) {
    for (const g of ['uavgjort', 'oddstak']) {
        if (tagg(ev, T, g) === 'spill') {
            feil += 1;
            console.log(`  FEIL  utelatt utfall ble SPILL (ev=${ev}, grunn=${g})`);
        }
    }
}
ok += 1;
console.log(`  ok    ${'intet utelatt utfall blir SPILL'.padEnd(52)} 12 kombinasjoner`);

seksjon('evKlasse — teal over terskel, ink for positiv, ellers muted');
sjekk('over terskel', evKlasse(0.3, T), 'c-teal');
sjekk('på terskelen', evKlasse(0.15, T), 'c-teal');
sjekk('positiv under terskel', evKlasse(0.05, T), 'c-ink');
sjekk('nøyaktig null', evKlasse(0, T), 'c-muted');
sjekk('negativ', evKlasse(-0.2, T), 'c-muted');
sjekk('ukjent', evKlasse(null, T), 'c-muted');

seksjon('stolpeBredde — klemt til [0,1], aldri NaN i en stilverdi');
sjekk('0,44', stolpeBredde(0.44), '44%');
sjekk('0 → 0', stolpeBredde(0), '0%');
sjekk('1 → 100', stolpeBredde(1), '100%');
sjekk('over 1 klemmes', stolpeBredde(1.8), '100%');
sjekk('negativ klemmes', stolpeBredde(-0.5), '0%');
sjekk('null gir 0, ikke NaN', stolpeBredde(null), '0%');
sjekk('NaN gir 0, ikke NaN', stolpeBredde(NaN), '0%');

seksjon('nyesteFørst — deterministisk, med event_id som siste skille');
const rad = (date, start_time, event_id) => ({ date, start_time, event_id });
const usortert = [
    rad('2026-01-02', '2026-01-02T18:00:00Z', 'b'),
    rad('2026-01-03', '2026-01-03T18:00:00Z', 'c'),
    rad('2026-01-01', '2026-01-01T18:00:00Z', 'a'),
];
sjekk(
    'nyeste først',
    [...usortert].sort(nyesteFørst).map((r) => r.event_id).join(''),
    'cba',
);
// Samme kamptidspunkt: event_id avgjør, så rekkefølgen ikke avhenger av
// input-rekkefølgen. Historikk og «Siste avgjorte» må sortere likt.
const likeTider = [
    rad('2026-01-01', '2026-01-01T18:00:00Z', 'z'),
    rad('2026-01-01', '2026-01-01T18:00:00Z', 'a'),
];
sjekk(
    'likt tidspunkt brytes på event_id',
    [...likeTider].sort(nyesteFørst).map((r) => r.event_id).join(''),
    [...likeTider].reverse().sort(nyesteFørst).map((r) => r.event_id).join(''),
);
sjekk(
    'faller til date uten start_time',
    [rad('2026-01-01', null, 'a'), rad('2026-02-01', null, 'b')]
        .sort(nyesteFørst)
        .map((r) => r.event_id)
        .join(''),
    'ba',
);
sjekk('tid() leser start_time', typeof tid(rad('2026-01-01', '2026-01-01T18:00:00Z', 'a')), 'number');

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
