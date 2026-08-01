'use client';

/**
 * Delte grafbyggeklosser (§D). Alt som ligger oppå SVG-en er HTML, ikke SVG —
 * en `<circle>` blir elliptisk under `preserveAspectRatio="none"`, og
 * SVG-`<text>` arver ikke fontstacken rent.
 *
 * Bruk:
 *
 *   const s = lagSkala(vals, HERO_VIEWBOX);
 *   const linje = linjePath(vals, s);
 *   const { hi, hoverProps } = useHoverIndeks(vals.length, hoverGeometri(s));
 *
 *   <div className={wrapKlasse} {...hoverProps}>
 *     <svg viewBox={`0 0 ${s.bredde} ${s.høyde}`} preserveAspectRatio="none" …>
 *       <SplitArea d={areaPath(linje, s)} skala={s} opacity={0.12} />
 *       <ZeroLine skala={s} stiplet />
 *       <path d={linje} fill="none" stroke="var(--ink)" strokeWidth={1.6}
 *             vectorEffect="non-scaling-stroke" />
 *     </svg>
 *     <ChartOverlay>
 *       <HoverDot left={venstreProsent(hi ?? 0, s)} top={toppProsent(v, s)} synlig={hi !== null} />
 *     </ChartOverlay>
 *   </div>
 */

import {
    useCallback,
    useId,
    useState,
    type CSSProperties,
    type MouseEvent,
    type ReactNode,
} from 'react';
import { hoverIndeks, nullinjePath, type HoverGeometri, type Skala } from './geometry';
import styles from './Chart.module.css';

/* -------------------------------------------------------------------------- */
/* Todelt areafyll                                                             */
/* -------------------------------------------------------------------------- */

export interface SplitAreaProps {
    /** Pathen fra `areaPath()`. */
    d: string;
    skala: Skala;
    /** Hero `.12`, kurvelab `.13` (§H.7). */
    opacity?: number;
    /** Farge over nullinja. Default teal. */
    over?: string;
    /** Farge under nullinja. Default vermillion. */
    under?: string;
}

/**
 * Samme `d` tegnet to ganger: klippet til alt over nullinja (teal) og alt under
 * (vermillion). Rektanglene deler høyden nøyaktig ved `zeroY`.
 * `clipPath`-id-ene er unike per instans via `useId()`, så flere kurver kan
 * sameksistere på samme side.
 */
export function SplitArea({
    d,
    skala,
    opacity = 0.12,
    over = '#0E4B47',
    under = '#B23A1B',
}: SplitAreaProps) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    if (d === '') return null;
    const opp = `up-${id}`;
    const ned = `dn-${id}`;
    return (
        <>
            <defs>
                <clipPath id={opp}>
                    <rect x="0" y="0" width={skala.bredde} height={skala.zeroY} />
                </clipPath>
                <clipPath id={ned}>
                    <rect x="0" y={skala.zeroY} width={skala.bredde} height={skala.høyde} />
                </clipPath>
            </defs>
            <path d={d} fill={over} opacity={opacity} clipPath={`url(#${opp})`} />
            <path d={d} fill={under} opacity={opacity} clipPath={`url(#${ned})`} />
        </>
    );
}

/* -------------------------------------------------------------------------- */
/* Nullinje                                                                    */
/* -------------------------------------------------------------------------- */

export interface ZeroLineProps {
    skala: Skala;
    /** Hero-kurven har `stroke-dasharray="3 4"`; kurvelabben har heltrukket ink. */
    stiplet?: boolean;
    stroke?: string;
}

export function ZeroLine({ skala, stiplet = false, stroke }: ZeroLineProps) {
    return (
        <path
            d={nullinjePath(skala)}
            fill="none"
            stroke={stroke ?? (stiplet ? '#C9BFA9' : '#17150F')}
            strokeWidth={1}
            strokeDasharray={stiplet ? '3 4' : undefined}
            vectorEffect="non-scaling-stroke"
        />
    );
}

/* -------------------------------------------------------------------------- */
/* Overlegg                                                                    */
/* -------------------------------------------------------------------------- */

/** `position:absolute; inset:0; pointer-events:none` oppå SVG-en. */
export function ChartOverlay({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={`${styles.overlegg}${className ? ` ${className}` : ''}`}>{children}</div>;
}

export interface HoverDotProps {
    /** Fra `venstreProsent(i, skala)`. */
    left: string;
    /** Fra `toppProsent(v, skala)`. */
    top: string;
    synlig: boolean;
}

/**
 * Hover-prikken (§H.2, avgjort): HTML-div overalt, også i kurvelabben.
 * Når hover er null flyttes den til `-100%` i tillegg til `opacity: 0`, slik at
 * den aldri kan bli synlig ved en glipp.
 */
export function HoverDot({ left, top, synlig }: HoverDotProps) {
    return (
        <span
            className={styles.prikk}
            style={{ left: synlig ? left : '-100%', top, opacity: synlig ? 1 : 0 }}
            aria-hidden="true"
        />
    );
}

export interface ChartTooltipProps {
    left: string;
    synlig: boolean;
    /** Linje 1 — dato, Mono 9px versaler. */
    dato: ReactNode;
    /** Linje 2 — verdien, Mono 15px. */
    verdi: ReactNode;
    /** Linje 3 — undertekst, f.eks. `3 spill · 1 traff`. */
    sub?: ReactNode;
}

export function ChartTooltip({ left, synlig, dato, verdi, sub }: ChartTooltipProps) {
    return (
        <span
            className={styles.tooltip}
            style={{ left: synlig ? left : '-100%', opacity: synlig ? 1 : 0 }}
            aria-hidden="true"
        >
            <span className={styles.tooltipDato}>{dato}</span>
            <span className={styles.tooltipVerdi}>{verdi}</span>
            {sub ? <span className={styles.tooltipSub}>{sub}</span> : null}
        </span>
    );
}

/* -------------------------------------------------------------------------- */
/* Akseetiketter — absolutt posisjonert HTML                                   */
/* -------------------------------------------------------------------------- */

export interface AxisLabelProps {
    /** `left`- eller `top`-prosent fra `venstreProsent()` / `toppProsent()`. */
    pos: string;
    children: ReactNode;
    className?: string;
}

/** Y-etikett i kurvelabben: venstrestilt, sentrert på sin egen y. */
export function YAxisLabel({ pos, children, className }: AxisLabelProps) {
    return (
        <span className={`t-axis-label ${styles.yEtikett}${className ? ` ${className}` : ''}`} style={{ top: pos }}>
            {children}
        </span>
    );
}

/** Container for x-etikettene. Ligger under plottet, `bottom: -2px`. */
export function XAxis({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={`${styles.xAkse}${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function XAxisLabel({ pos, children, className }: AxisLabelProps) {
    return (
        <span className={`t-axis-label ${styles.xEtikett}${className ? ` ${className}` : ''}`} style={{ left: pos }}>
            {children}
        </span>
    );
}

/* -------------------------------------------------------------------------- */
/* Hover-håndtering                                                            */
/* -------------------------------------------------------------------------- */

export interface HoverResultat {
    /** Indeksen musepekeren peker på, eller `null`. */
    hi: number | null;
    /** Spre på wrapper-diven, ikke på SVG-en. */
    hoverProps: {
        onMouseMove: (e: MouseEvent<HTMLElement>) => void;
        onMouseLeave: () => void;
    };
    /** Nullstiller hover — kall den ved modus- eller rekkeviddebytte. */
    nullstill: () => void;
}

/**
 * Hover-tilstand for en graf. Setter bare state når indeksen faktisk endrer
 * seg, og nullstilles automatisk når `n` endrer seg (modus- eller
 * rekkeviddebytte gir ny serielengde).
 */
export function useHoverIndeks(n: number, g: HoverGeometri): HoverResultat {
    // Serielengden bæres sammen med indeksen. Skifter `n` — modus- eller
    // rekkeviddebytte — er den lagrede indeksen automatisk ugyldig, og hover
    // nullstilles uten at en effekt må kalle setState.
    const [tilstand, setTilstand] = useState<{ n: number; hi: number | null }>({ n, hi: null });
    const hi = tilstand.n === n ? tilstand.hi : null;

    const nullstill = useCallback(() => {
        setTilstand((t) => (t.hi === null && t.n === n ? t : { n, hi: null }));
    }, [n]);

    // Depsene er primitivene, ikke `g` — kalleren lager typisk objektet på nytt
    // hver render (`hoverGeometri(skala)`), og da ville handleren aldri vært stabil.
    const { bredde, PL, pw } = g;
    const onMouseMove = useCallback(
        (e: MouseEvent<HTMLElement>) => {
            if (n < 1) return;
            const r = e.currentTarget.getBoundingClientRect();
            const i = hoverIndeks(e.clientX, r, n, { bredde, PL, pw });
            // Sett bare state når indeksen faktisk endrer seg.
            setTilstand((t) => (t.n === n && t.hi === i ? t : { n, hi: i }));
        },
        [n, bredde, PL, pw],
    );

    return { hi, hoverProps: { onMouseMove, onMouseLeave: nullstill }, nullstill };
}

/* -------------------------------------------------------------------------- */
/* Wrapper                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChartWrapProps {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    hoverProps?: HoverResultat['hoverProps'];
}

/** `position: relative`-wrapperen SVG og overlegg deler. */
export function ChartWrap({ children, className, style, hoverProps }: ChartWrapProps) {
    return (
        <div className={`${styles.wrap}${className ? ` ${className}` : ''}`} style={style} {...hoverProps}>
            {children}
        </div>
    );
}
