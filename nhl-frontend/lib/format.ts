/**
 * Tall- og datoformatering for Blålinja. nb-NO, sentralt, ett sted.
 *
 * Regler (fra `docs/blalinja/DECISIONS.md`):
 *   - `Intl.NumberFormat('nb-NO')` overalt. Formatter-instansene gjenbrukes;
 *     ingen ny instans per kall.
 *   - Negative tall bruker ekte minustegn U+2212 (−), aldri ASCII-bindestrek.
 *     `Intl` gir allerede U+2212 for nb-NO; `norm()` under fanger opp alt som
 *     likevel skulle slippe gjennom, og `lib/format.test.mjs` verifiserer det.
 *   - Fortegnsatte verdier bruker `signDisplay: 'always'`, aldri manuell prefiks.
 *   - Mellomrom foran `%` og foran `kr`. Begge er hardt mellomrom (U+00A0), slik
 *     at enheten aldri brekker fra tallet. Tusenskillet fra Intl er også U+00A0.
 *   - Ingen farger, ingen klassenavn. Farge er presentasjon og hører hjemme i
 *     komponentene.
 *
 * Alle formatterne tar `number | null | undefined` og gir `MANGLER` («—») for
 * nullish/NaN, slik at sju skjermer ikke finner opp hver sin fallback.
 */

/** Vises når en verdi mangler. Tankestrek U+2014. */
export const MANGLER = '—';

/** Hardt mellomrom U+00A0 — mellom tall og enhet, aldri et vanlig mellomrom. */
export const NBSP = ' ';

/** Ekte minustegn U+2212. */
export const MINUS = '−';

const MND_LANG = [
    'januar',
    'februar',
    'mars',
    'april',
    'mai',
    'juni',
    'juli',
    'august',
    'september',
    'oktober',
    'november',
    'desember',
];

/**
 * Korte månedsnavn, indeksert 0–11. Eksportert fordi akseetikettene i
 * `components/chart/geometry.ts` trenger nøyaktig de samme strengene — to lister
 * er én liste for mye.
 */
export const MND = [
    'jan',
    'feb',
    'mar',
    'apr',
    'mai',
    'jun',
    'jul',
    'aug',
    'sep',
    'okt',
    'nov',
    'des',
] as const;

/* -------------------------------------------------------------------------- */
/* Interne hjelpere                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Normaliserer et ferdig formatert tall: ASCII-bindestrek → U+2212.
 * Kalles på alt som forlater modulen, også der Intl allerede gjør det riktig,
 * slik at en framtidig endring i locale-data eller en manuell streng ikke kan
 * snike inn feil tegn.
 */
function norm(s: string): string {
    return s.indexOf('-') === -1 ? s : s.replace(/-/g, MINUS);
}

/**
 * Privat kopi av `erTall` fra `lib/spill.ts`, og den blir stående.
 *
 * `lib/spill.ts` importerer `MANGLER` herfra, så en import den andre veien ville
 * gitt sykelen `format → spill → format`. Grunnmuren skal ikke avhenge av
 * spill-logikken. Fire linjer duplisert er billigere enn den avhengigheten —
 * dette er et bevisst valg, ikke en glemt konsolidering.
 */
function erTall(n: number | null | undefined): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

/** −0 er aldri et meningsfullt fortegn. Nullstilles før formatering. */
function utenNegativNull(n: number, desimaler: number): number {
    const faktor = 10 ** desimaler;
    const avrundet = Math.round(n * faktor) / faktor;
    return avrundet === 0 ? 0 : avrundet;
}

/* -------------------------------------------------------------------------- */
/* Gjenbrukte Intl-instanser                                                   */
/* -------------------------------------------------------------------------- */

const talls = new Map<string, Intl.NumberFormat>();

function tallformat(desimaler: number, fortegn: boolean): Intl.NumberFormat {
    const nøkkel = `${desimaler}:${fortegn ? 1 : 0}`;
    let f = talls.get(nøkkel);
    if (!f) {
        f = new Intl.NumberFormat('nb-NO', {
            minimumFractionDigits: desimaler,
            maximumFractionDigits: desimaler,
            ...(fortegn ? { signDisplay: 'always' as const } : {}),
        });
        talls.set(nøkkel, f);
    }
    return f;
}

/** `YYYY-MM-DD` i Europe/Oslo. en-CA gir nettopp det formatet. */
const osloDato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const osloKlokke = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

/* -------------------------------------------------------------------------- */
/* Tall                                                                        */
/* -------------------------------------------------------------------------- */

/** `nf(20200)` → `20 200` · `nf(0.7, 2)` → `0,70`. Uten fortegn på positive. */
export function nf(n: number | null | undefined, desimaler = 0): string {
    if (!erTall(n)) return MANGLER;
    return norm(tallformat(desimaler, false).format(utenNegativNull(n, desimaler)));
}

/** `sgnRaw(80)` → `+80` · `sgnRaw(-34)` → `−34`. Alltid eksplisitt fortegn. */
export function sgnRaw(n: number | null | undefined, desimaler = 0): string {
    if (!erTall(n)) return MANGLER;
    return norm(tallformat(desimaler, true).format(utenNegativNull(n, desimaler)));
}

/* -------------------------------------------------------------------------- */
/* Penger                                                                      */
/* -------------------------------------------------------------------------- */

/** `kr(35)` → `+35 kr` · `kr(-640)` → `−640 kr`. Brødtekst: enheten står med. */
export function kr(n: number | null | undefined, desimaler = 0): string {
    if (!erTall(n)) return MANGLER;
    return `${sgnRaw(n, desimaler)}${NBSP}kr`;
}

/** `krp(20200)` → `20 200 kr`. Uten fortegn — omsetning, innsats, utbetaling. */
export function krp(n: number | null | undefined, desimaler = 0): string {
    if (!erTall(n)) return MANGLER;
    return `${nf(n, desimaler)}${NBSP}kr`;
}

/**
 * Tabellvariant av `kr()`: `+165`, `−100`. Uten ` kr` — i tabeller ligger
 * enheten i kolonneoverskriften (DECISIONS).
 */
export function krTabell(n: number | null | undefined, desimaler = 0): string {
    return sgnRaw(n, desimaler);
}

/** Tabellvariant av `krp()`: `20 200`. */
export function krpTabell(n: number | null | undefined, desimaler = 0): string {
    return nf(n, desimaler);
}

/* -------------------------------------------------------------------------- */
/* Prosent                                                                     */
/* -------------------------------------------------------------------------- */

/** `pc(0.337)` → `33,7 %`. `n` er en brøk. Uten fortegn på positive. */
export function pc(n: number | null | undefined, desimaler = 1): string {
    if (!erTall(n)) return MANGLER;
    return `${nf(n * 100, desimaler)}${NBSP}%`;
}

/** `sgn(0.218)` → `+21,8 %` · `sgn(-0.032)` → `−3,2 %`. `n` er en brøk. */
export function sgn(n: number | null | undefined, desimaler = 1): string {
    if (!erTall(n)) return MANGLER;
    return `${sgnRaw(n * 100, desimaler)}${NBSP}%`;
}

/** Som `pc()`, men `n` er allerede prosentpoeng: `pcRaw(33.7)` → `33,7 %`. */
export function pcRaw(n: number | null | undefined, desimaler = 1): string {
    if (!erTall(n)) return MANGLER;
    return `${nf(n, desimaler)}${NBSP}%`;
}

/**
 * Bare tallet, uten `%`. Til display-figurene i Kampanalyse: `pcTall(0.44)` → `44,0`.
 */
export function pcTall(n: number | null | undefined, desimaler = 1): string {
    if (!erTall(n)) return MANGLER;
    return nf(n * 100, desimaler);
}

/* -------------------------------------------------------------------------- */
/* Odds og sannsynlighet                                                       */
/* -------------------------------------------------------------------------- */

/** `odds(2.45)` → `2,45`. Alltid to desimaler. */
export function odds(n: number | null | undefined): string {
    if (!erTall(n)) return MANGLER;
    return nf(n, 2);
}

/** Sannsynlighet i prosent med én desimal: `sannsynlighet(0.497)` → `49,7 %`. */
export function sannsynlighet(n: number | null | undefined): string {
    return pc(n, 1);
}

/* -------------------------------------------------------------------------- */
/* Datoer                                                                      */
/* -------------------------------------------------------------------------- */

interface DatoDeler {
    y: number;
    m: number;
    d: number;
}

/**
 * En ren `YYYY-MM-DD` er en kalenderdato og leses bokstavelig — den skal ikke
 * skifte døgn av leserens tidssone. Et fullt tidsstempel er et øyeblikk og
 * konverteres til Europe/Oslo, som er sitens tidssone.
 */
function datoDeler(iso: string | null | undefined): DatoDeler | null {
    if (!iso) return null;
    const tekst = iso.trim();
    const rent = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst);
    if (rent) return { y: Number(rent[1]), m: Number(rent[2]), d: Number(rent[3]) };
    const t = new Date(tekst);
    if (Number.isNaN(t.getTime())) return null;
    const deler = osloDato.format(t).split('-');
    if (deler.length !== 3) return null;
    return { y: Number(deler[0]), m: Number(deler[1]), d: Number(deler[2]) };
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/** Kort dato: `ds('2026-06-10')` → `10. jun`. */
export function ds(iso: string | null | undefined): string {
    const p = datoDeler(iso);
    if (!p) return MANGLER;
    return `${p.d}. ${MND[p.m - 1]}`;
}

/** Lang dato: `dl('2026-06-10')` → `10. jun 2026`. */
export function dl(iso: string | null | undefined): string {
    const p = datoDeler(iso);
    if (!p) return MANGLER;
    return `${p.d}. ${MND[p.m - 1]} ${p.y}`;
}

/**
 * Lang dato med utskrevet måned: `dLang('2026-03-14')` → `14. mars 2026`.
 *
 * Brukes der datoen er brødtekst og ikke en tabellcelle — kickere og
 * skjermtitler — der forkortelsen i `dl()` leser som en logglinje.
 */
export function dLang(iso: string | null | undefined): string {
    const p = datoDeler(iso);
    if (!p) return MANGLER;
    return `${p.d}. ${MND_LANG[p.m - 1]} ${p.y}`;
}

/** ISO-dato: `dISO('2026-07-29T10:48:17+00:00')` → `2026-07-29`. */
export function dISO(iso: string | null | undefined): string {
    const p = datoDeler(iso);
    if (!p) return MANGLER;
    return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** Klokkeslett i Europe/Oslo: `klokke('2025-12-05T01:00:00+01:00')` → `01:00`. */
export function klokke(iso: string | null | undefined): string {
    if (!iso) return MANGLER;
    const t = new Date(iso.trim());
    if (Number.isNaN(t.getTime())) return MANGLER;
    return osloKlokke.format(t);
}

/**
 * «Sist oppdatert»-stempel: `2026-07-29 10:48`. Bevisst ISO-dato + klokke —
 * det er et maskinstempel, ikke en setning.
 */
export function sistOppdatert(iso: string | null | undefined): string {
    const dato = dISO(iso);
    if (dato === MANGLER) return MANGLER;
    const tid = klokke(iso);
    return tid === MANGLER ? dato : `${dato} ${tid}`;
}
