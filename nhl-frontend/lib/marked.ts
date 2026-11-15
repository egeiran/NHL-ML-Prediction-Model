/**
 * Markedet (/marked) — rene funksjoner over `strategy-ml.json`. Ingen React.
 *
 * Python er sannheten: sammendraget (CLV, intervall, fremdrift, om kriteriet er
 * oppfylt) regnes i `NHL/strategy_ml.py` og leses rett ut. Her velges bare
 * utvalg og etiketter, så skjermen aldri regner sine egne tall.
 */

import type { StrategiData, StrategiRad, StrategiSammendrag, StrategiTavleRad } from '@/types';

/** Spill = rader med innsats. `nobet` er vurdert, men ikke spilt. */
export function erSpill(r: StrategiRad): boolean {
    return r.status === 'pending' || r.status === 'won' || r.status === 'lost' || r.status === 'void';
}

/** Hvorfor en kamp ikke ble spilt, i klartekst. Ukjente koder vises som de er. */
const GRUNNER: Record<string, string> = {
    below_ev: 'EV under terskelen',
    odds_cap: 'Odds over taket',
    no_sharp: 'Ingen Pinnacle-pris',
    no_nt_ml: 'NT har ikke prisen ennå',
    mismatch: 'NT og Pinnacle for uenige',
    sharp_swapped: 'Hjemme/borte byttet',
    sharp_unmatched: 'Fant ikke kampen',
    game_type: 'Ikke grunnserie',
    early_season: 'Tidlig i sesongen',
};

export function grunnTekst(kode: string | null | undefined): string {
    if (!kode) return '';
    return GRUNNER[kode] ?? kode;
}

/** Beste side sin EV mot Pinnacle, også for kamper vi lot ligge. `null` uten skarp pris. */
export function besteEv(r: StrategiRad): number | null {
    const kandidater = [r.ev_home, r.ev_away].filter((v): v is number => typeof v === 'number');
    return kandidater.length ? Math.max(...kandidater) : null;
}

/**
 * Kampene fra siste beslutningsdag (UTC-dato i `decided_at`), tidligst start
 * først — det som ble besluttet sist morgen.
 */
export function sisteBeslutninger(rader: readonly StrategiRad[]): StrategiRad[] {
    const dager = rader.map((r) => (r.decided_at ?? '').slice(0, 10)).filter(Boolean);
    if (!dager.length) return [];
    const siste = dager.reduce((a, b) => (b > a ? b : a));
    return rader
        .filter((r) => (r.decided_at ?? '').startsWith(siste))
        .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.game_key.localeCompare(b.game_key));
}

/** Avgjorte og annullerte spill, nyeste først. */
export function avgjorteSpill(rader: readonly StrategiRad[]): StrategiRad[] {
    return rader
        .filter((r) => r.status === 'won' || r.status === 'lost' || r.status === 'void')
        .sort((a, b) => b.start_time.localeCompare(a.start_time) || a.game_key.localeCompare(b.game_key));
}

export type Vurdering = 'for-få' | 'positiv' | 'negativ' | 'usikker';

/**
 * Hvordan CLV-tallet skal leses. `positiv` krever det samme som overgangen til
 * ekte innsats: nok spill og et intervall som ligger over null (`promotable`).
 * Under målet er det `for-få` uansett hva snittet sier.
 */
export function vurdering(s: StrategiSammendrag): Vurdering {
    if (s.promotable) return 'positiv';
    const { n, ci_high } = s.clv_sharp;
    if (n < s.target_bets) return 'for-få';
    if (ci_high !== null && ci_high < 0) return 'negativ';
    return 'usikker';
}

/** Side som tekst: `home` → `Hjemme (BOS)`. */
export function sideTekst(r: StrategiRad): string {
    if (r.selection === 'home') return `Hjemme (${r.home_abbr})`;
    if (r.selection === 'away') return `Borte (${r.away_abbr})`;
    return '';
}

/** Kort statusmelding om datagrunnlaget, eller `null` når alt er i orden. */
export function datastatus(d: StrategiData): string | null {
    switch (d.status.sharp_status) {
        case null:
        case undefined:
            return 'Ingen kjøringer logget ennå. Første rad kommer etter neste daglige kjøring.';
        case 'no_key':
            return 'Pinnacle-oddsen hentes ikke ennå: ODDS_API_KEY er ikke satt. NT-markedene logges likevel, og kampene føres som «Ingen Pinnacle-pris».';
        case 'low_quota':
            return 'Gratiskvoten hos The Odds API er nesten brukt opp denne måneden. Kjøringen hoppet over Pinnacle-oddsen.';
        case 'error':
            return 'Siste kall mot The Odds API feilet. Kampene i den kjøringen er ført uten Pinnacle-pris.';
        default:
            return null;
    }
}

/** Åpne spill i strategien, tidligst start først. Det Oversikt viser som «i dag». */
export function åpneSpill(rader: readonly StrategiRad[]): StrategiRad[] {
    return rader
        .filter((r) => r.status === 'pending')
        .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.game_key.localeCompare(b.game_key));
}

/** Tavla, også fra filer skrevet før den fantes. */
export function tavle(d: StrategiData | null): StrategiTavleRad[] {
    return d?.board ?? [];
}

/**
 * Hva strategien gjorde med en kamp på tavla. `spill` styrer fargen.
 * Kamper lenger fram enn 24 timer er ikke besluttet ennå.
 */
export function tavleBeslutning(r: StrategiTavleRad): { tekst: string; spill: boolean } {
    const d = r.decision;
    if (!d) return { tekst: 'Besluttes neste morgen', spill: false };
    if (d.status === 'nobet') return { tekst: grunnTekst(d.skip_reason), spill: false };
    const side = d.selection === 'home' ? `Hjemme (${r.home_abbr})` : `Borte (${r.away_abbr})`;
    const odds = d.odds === null ? '' : ` @ ${d.odds.toFixed(2).replace('.', ',')}`;
    return { tekst: `Spill ${side}${odds}`, spill: true };
}
