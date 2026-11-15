/**
 * Verifikasjon av `lib/marked.ts`. Kjøres med:
 *
 *     node --experimental-strip-types nhl-frontend/lib/marked.test.mjs
 *
 * Samme mønster som de andre testene: ingen rammeverk, exit-kode 1 ved avvik.
 *
 * Det viktigste her er `vurdering()`: skjermen skal aldri kalle strategien
 * bevist før Python sier det (`promotable`), og aldri kalle et lite utvalg
 * positivt bare fordi snittet er over null.
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

const m = await import(pathToFileURL(join(HER, 'marked.ts')).href);

let feil = 0;
function sjekk(navn, betingelse, detalj = '') {
    if (betingelse) {
        console.log(`OK    ${navn}`);
    } else {
        feil += 1;
        console.log(`FEIL  ${navn} ${detalj}`);
    }
}

function rad(over = {}) {
    return {
        date: '2026-11-15', game_key: 'BOS-MIN-2026-11-15', start_time: '2026-11-15T00:00:00Z',
        home_abbr: 'BOS', away_abbr: 'MIN', decided_at: '2026-11-14T08:00:00Z', status: 'nobet',
        selection: '', odds: null, ev: null, ev_home: -0.02, ev_away: -0.05, stake: 0,
        skip_reason: 'below_ev', nt_ml_home: 2.0, nt_ml_away: 1.8, sharp_source: 'pinnacle',
        sharp_ml_home: 2.0, sharp_ml_away: 1.87, p_fair_home: 0.48, p_nt_home: 0.46,
        p_model_ml_home: 0.5, ml_outcome: null, reg_outcome: null, profit: null, clv_sharp: null,
        clv_nt: null, close_nt_ml_home: null, close_nt_ml_away: null, p_fair_close_home: null,
        ...over,
    };
}

function sammendrag(over = {}) {
    return {
        games: 0, games_with_sharp: 0, bets: 0, open: 0, settled: 0, won: 0, staked: 0, profit: 0,
        roi: null, clv_nt: { n: 0, mean: null, ci_low: null, ci_high: null, positive_share: null },
        clv_sharp: { n: 0, mean: null, ci_low: null, ci_high: null, positive_share: null },
        skip_reasons: {}, target_bets: 150, progress: 0, promotable: false, ...over,
    };
}

/* --- spill og grunner ------------------------------------------------------ */

sjekk('nobet er ikke spill', !m.erSpill(rad()));
sjekk('pending/won/lost/void er spill', ['pending', 'won', 'lost', 'void'].every((s) => m.erSpill(rad({ status: s }))));
sjekk('grunn i klartekst', m.grunnTekst('no_sharp') === 'Ingen Pinnacle-pris');
sjekk('ukjent grunn vises som koden', m.grunnTekst('ny_grunn') === 'ny_grunn');
sjekk('tom grunn', m.grunnTekst(null) === '');
sjekk('beste EV', m.besteEv(rad()) === -0.02);
sjekk('ingen EV uten skarp pris', m.besteEv(rad({ ev_home: null, ev_away: null })) === null);
sjekk('sidetekst', m.sideTekst(rad({ selection: 'away' })) === 'Borte (MIN)');

/* --- utvalg ---------------------------------------------------------------- */

const rader = [
    rad({ game_key: 'A', decided_at: '2026-11-13T08:01:00Z', start_time: '2026-11-14T00:00:00Z', status: 'won' }),
    rad({ game_key: 'B', decided_at: '2026-11-14T08:01:00Z', start_time: '2026-11-15T03:00:00Z' }),
    rad({ game_key: 'C', decided_at: '2026-11-14T08:01:00Z', start_time: '2026-11-15T00:00:00Z', status: 'pending' }),
    rad({ game_key: 'D', decided_at: '2026-11-12T08:01:00Z', start_time: '2026-11-13T00:00:00Z', status: 'lost' }),
];
const siste = m.sisteBeslutninger(rader);
sjekk('siste beslutningsdag, tidligst start først', siste.map((r) => r.game_key).join() === 'C,B', siste.map((r) => r.game_key).join());
sjekk('tom liste', m.sisteBeslutninger([]).length === 0);
const avgjort = m.avgjorteSpill(rader);
sjekk('avgjorte nyeste først, uten åpne og nobet', avgjort.map((r) => r.game_key).join() === 'A,D', avgjort.map((r) => r.game_key).join());

/* --- vurdering ------------------------------------------------------------- */

const clv = (n, mean, lo, hi) => ({ n, mean, ci_low: lo, ci_high: hi, positive_share: 0.5 });
sjekk('få spill er for-få selv med positivt snitt', m.vurdering(sammendrag({ clv_sharp: clv(40, 0.05, 0.01, 0.09) })) === 'for-få');
sjekk('promotable er positiv', m.vurdering(sammendrag({ promotable: true, clv_sharp: clv(160, 0.03, 0.01, 0.05) })) === 'positiv');
sjekk('nok spill, CI under null er negativ', m.vurdering(sammendrag({ clv_sharp: clv(160, -0.03, -0.05, -0.01) })) === 'negativ');
sjekk('nok spill, CI krysser null er usikker', m.vurdering(sammendrag({ clv_sharp: clv(160, 0.01, -0.01, 0.03) })) === 'usikker');

/* --- datastatus ------------------------------------------------------------ */

const data = (sharp_status) => ({ status: { sharp_status } });
sjekk('no_key forklarer nøkkelen', (m.datastatus(data('no_key')) ?? '').includes('ODDS_API_KEY'));
sjekk('ok gir ingen melding', m.datastatus(data('ok')) === null);
sjekk('ingen kjøringer', (m.datastatus(data(null)) ?? '').startsWith('Ingen kjøringer'));

/* --- tavle og åpne spill ---------------------------------------------------- */

const tavlerad = (decision) => ({
    game_key: 'BOS-MIN-2026-11-15', start_time: '2026-11-15T00:00:00Z', home_abbr: 'BOS', away_abbr: 'MIN',
    priced_at: null, nt_ml_home: 2.2, nt_ml_away: 1.7, nt_ml_margin: 0.04, nt_hub_margin: 0.12,
    sharp_source: 'pinnacle', sharp_ml_home: 2.0, sharp_ml_away: 1.87, p_fair_home: 0.48,
    ev_home: 0.06, ev_away: -0.18, decision,
});
sjekk('ubesluttet kamp', m.tavleBeslutning(tavlerad(null)).tekst === 'Besluttes neste morgen');
sjekk('nobet viser grunnen', m.tavleBeslutning(tavlerad({ status: 'nobet', selection: null, odds: null, ev: null, skip_reason: 'no_sharp', decided_at: null })).tekst === 'Ingen Pinnacle-pris');
const spilt = m.tavleBeslutning(tavlerad({ status: 'pending', selection: 'home', odds: 2.2, ev: 0.06, skip_reason: null, decided_at: null }));
sjekk('spill med side og odds', spilt.spill && spilt.tekst === 'Spill Hjemme (BOS) @ 2,20', spilt.tekst);
sjekk('tavle fra gammel fil', m.tavle({ rows: [] }).length === 0 && m.tavle(null).length === 0);
const åpne = m.åpneSpill([
    rad({ game_key: 'X', status: 'pending', start_time: '2026-11-15T03:00:00Z' }),
    rad({ game_key: 'Y', status: 'won' }),
    rad({ game_key: 'Z', status: 'pending', start_time: '2026-11-15T00:00:00Z' }),
]);
sjekk('åpne spill, tidligst først', åpne.map((r) => r.game_key).join() === 'Z,X', åpne.map((r) => r.game_key).join());

if (feil) {
    console.log(`\n${feil} sjekk(er) feilet`);
    process.exit(1);
}
console.log('\nAlle sjekker passerte');
