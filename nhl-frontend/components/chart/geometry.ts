/**
 * Delt SVG-geometri (§D). Rene funksjoner, ingen React, ingen npm-avhengigheter
 * — eneste import er månedsnavnene fra `lib/format`, som akseetikettene deler
 * med datoformattererne.
 *
 * De fire graftypene deler skala, path-bygging og hover-matematikk; det eneste
 * som skiller dem er viewBox og padding. Derfor er alt her parametrisert på
 * `Skala`, og hover-indeksen er ÉN funksjon som tar paddingen som parameter
 * (§H.1 — prototypens paddede formel er den riktige, README-ens gjelder bare
 * hero-kurven fordi den ikke har horisontal padding).
 */

import { MND } from '@/lib/format';

export interface SkalaOpsjoner {
    /** viewBox-bredde. Hero 1200 · lab 1000 · sparkline 320. */
    bredde: number;
    /** viewBox-høyde. Hero 200 · lab 300 · sparkline 84. */
    høyde: number;
    /** Padding i viewBox-koordinater. */
    PL?: number;
    PR?: number;
    PT?: number;
    PB?: number;
    /** Luft over/under serien, som andel av spennet. Hero .12 · lab .10 · sparkline 0. */
    padFaktor?: number;
    /** Tvinger 0 inn i verdiområdet. `true` for hero og lab, `false` for sparkline. */
    klemNull?: boolean;
}

export interface Skala {
    n: number;
    /** Nedre og øvre verdi etter klemming og luft. */
    mn: number;
    mx: number;
    bredde: number;
    høyde: number;
    PL: number;
    PR: number;
    PT: number;
    PB: number;
    /** Plottområdets bredde og høyde i viewBox-koordinater. */
    pw: number;
    ph: number;
    /** x for punkt `i`. */
    X: (i: number) => number;
    /** y for verdien `v`. */
    Y: (v: number) => number;
    /** y for nullinja. */
    zeroY: number;
}

export const HERO_VIEWBOX: SkalaOpsjoner = {
    bredde: 1200,
    høyde: 200,
    PT: 12,
    PB: 12,
    padFaktor: 0.12,
    klemNull: true,
};

export const LAB_VIEWBOX: SkalaOpsjoner = {
    bredde: 1000,
    høyde: 300,
    PL: 58,
    PR: 10,
    PT: 18,
    PB: 28,
    padFaktor: 0.1,
    klemNull: true,
};

export const SPARKLINE_VIEWBOX: SkalaOpsjoner = {
    bredde: 320,
    høyde: 84,
    padFaktor: 0,
    klemNull: false,
};

/** Bygger skalaen for en serie. */
export function lagSkala(vals: readonly number[], o: SkalaOpsjoner): Skala {
    const PL = o.PL ?? 0;
    const PR = o.PR ?? 0;
    const PT = o.PT ?? 0;
    const PB = o.PB ?? 0;
    const pw = o.bredde - PL - PR;
    const ph = o.høyde - PT - PB;
    const n = vals.length;

    let mn = n > 0 ? Math.min(...vals) : 0;
    let mx = n > 0 ? Math.max(...vals) : 0;
    if (o.klemNull !== false) {
        mn = Math.min(0, mn);
        mx = Math.max(0, mx);
        if (mn === mx) {
            mn -= 1;
            mx += 1;
        }
    }
    const luft = (mx - mn) * (o.padFaktor ?? 0);
    mn -= luft;
    mx += luft;

    const spenn = mx - mn || 1;

    const X = (i: number) => (n < 2 ? PL + pw / 2 : PL + (i / (n - 1)) * pw);
    const Y = (v: number) => PT + ph - ((v - mn) / spenn) * ph;

    return { n, mn, mx, bredde: o.bredde, høyde: o.høyde, PL, PR, PT, PB, pw, ph, X, Y, zeroY: Y(0) };
}

/* -------------------------------------------------------------------------- */
/* Path-byggere                                                                */
/* -------------------------------------------------------------------------- */

/** `M x y L x y …`, alle koordinater med én desimal. */
export function linjePath(vals: readonly number[], s: Skala): string {
    if (vals.length === 0) return '';
    return vals
        .map((v, i) => `${i === 0 ? 'M' : 'L'}${s.X(i).toFixed(1)} ${s.Y(v).toFixed(1)}`)
        .join('');
}

/**
 * Areafyllet: linja lukket ned til nullinja i begge ender.
 * Samme `d` tegnes to ganger, klippet mot `clipUp` / `clipDn` (se `<SplitArea>`).
 */
export function areaPath(linje: string, s: Skala): string {
    if (linje === '') return '';
    const høyre = s.X(Math.max(s.n - 1, 0)).toFixed(1);
    const venstre = s.X(0).toFixed(1);
    return `${linje}L${høyre} ${s.zeroY.toFixed(1)}L${venstre} ${s.zeroY.toFixed(1)}Z`;
}

/** Nullinja over plottbredden. */
export function nullinjePath(s: Skala): string {
    return `M${s.PL} ${s.zeroY.toFixed(1)}H${s.PL + s.pw}`;
}

/**
 * Verdiene rutenettlinjene ligger på, nedenfra og opp.
 *
 * Y-aksens etiketter må merke nøyaktig de nivåene `rutenettPaths` tegner. Regner
 * kalleren dem ut på egen hånd, kan etikett og linje drive fra hverandre uten at
 * noe feiler — derfor kommer begge herfra.
 */
export function rutenettNivåer(s: Skala, antall = 5): number[] {
    const trinn = Math.max(antall - 1, 1);
    const ut: number[] = [];
    for (let k = 0; k < antall; k += 1) {
        ut.push(s.mn + (s.mx - s.mn) * (k / trinn));
    }
    return ut;
}

/** Vannrett rutenett i `antall` nivåer (kurvelabben bruker 5: k = 0..4). */
export function rutenettPaths(s: Skala, antall = 5): string[] {
    return rutenettNivåer(s, antall).map(
        (v) => `M${s.PL} ${s.Y(v).toFixed(1)}H${s.PL + s.pw}`,
    );
}

/** Crosshair gjennom punkt `i`. `full` = hele viewBox-høyden (hero). */
export function crosshairPath(i: number, s: Skala, full = false): string {
    const x = s.X(i).toFixed(1);
    return full ? `M${x} 0V${s.høyde}` : `M${x} ${s.PT}V${s.PT + s.ph}`;
}

export interface Søyler {
    /** Alle positive søyler samlet i ÉN path. Aldri n stk `<rect>`. */
    pos: string;
    neg: string;
    /** Søylebredden i viewBox-koordinater. */
    bw: number;
}

/** Søylene i «Daglig P&L»-modus. */
export function søylePaths(vals: readonly number[], s: Skala): Søyler {
    const bw = Math.max(2, (s.pw / Math.max(vals.length, 1)) * 0.62);
    let pos = '';
    let neg = '';
    for (let i = 0; i < vals.length; i += 1) {
        const v = vals[i];
        const x = s.X(i) - bw / 2;
        const y = s.Y(v);
        const top = Math.min(s.zeroY, y);
        const h = Math.max(Math.abs(y - s.zeroY), 0.8);
        const seg = `M${x.toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}h-${bw.toFixed(1)}Z`;
        if (v >= 0) pos += seg;
        else neg += seg;
    }
    return { pos, neg, bw };
}

/* -------------------------------------------------------------------------- */
/* Posisjonering av HTML-overlegg                                              */
/* -------------------------------------------------------------------------- */

/** `left`-prosent for punkt `i`, regnet av SAMME geometri som pathen. */
export function venstreProsent(i: number, s: Skala): string {
    return `${((s.X(i) / s.bredde) * 100).toFixed(2)}%`;
}

/** `top`-prosent for verdien `v`. */
export function toppProsent(v: number, s: Skala): string {
    return `${((s.Y(v) / s.høyde) * 100).toFixed(2)}%`;
}

/* -------------------------------------------------------------------------- */
/* Hover                                                                       */
/* -------------------------------------------------------------------------- */

export interface HoverGeometri {
    /** viewBox-bredde. */
    bredde: number;
    /** Venstre padding i viewBox-koordinater. Hero 0 · lab 58. */
    PL: number;
    /** Plottbredde i viewBox-koordinater. Hero 1200 · lab 932. */
    pw: number;
}

/** Henter hover-geometrien ut av en skala. */
export function hoverGeometri(s: Skala): HoverGeometri {
    return { bredde: s.bredde, PL: s.PL, pw: s.pw };
}

/**
 * Indeksen musepekeren peker på — ÉN funksjon for begge grafene (§H.1).
 *
 * Hero-kurven har ingen horisontal padding (`PL = 0`, `pw = bredde`), og da
 * reduseres uttrykket til README-ens `round(t * (n - 1))`. Kurvelabben har
 * `PL = 58`, `pw = 932`, og får den paddede varianten. Samme kode.
 *
 * Lyttes på wrapper-diven, ikke på SVG-en, slik at hele cellen er hover-flate.
 */
export function hoverIndeks(
    klientX: number,
    rect: { left: number; width: number },
    n: number,
    g: HoverGeometri,
): number {
    if (n < 2 || rect.width <= 0) return 0;
    const px = ((klientX - rect.left) / rect.width) * g.bredde;
    const i = Math.round(((px - g.PL) / g.pw) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
}

/* -------------------------------------------------------------------------- */
/* Akseetiketter                                                               */
/* -------------------------------------------------------------------------- */

export interface MånedsTick {
    /** Indeks i serien. */
    i: number;
    /** `jan`, `feb`, … */
    label: string;
}

/**
 * X-etikettene i kurvelabben: én etikett hver gang måneden skifter.
 * `datoer` er `YYYY-MM-DD`-strenger i serierekkefølge.
 */
export function månedsTicks(datoer: readonly string[]): MånedsTick[] {
    const ut: MånedsTick[] = [];
    let forrige = '';
    for (let i = 0; i < datoer.length; i += 1) {
        const m = datoer[i]?.slice(0, 7);
        if (!m || m === forrige) continue;
        forrige = m;
        const nr = Number(m.slice(5, 7));
        if (Number.isFinite(nr) && nr >= 1 && nr <= 12) ut.push({ i, label: MND[nr - 1] });
    }
    return ut;
}
