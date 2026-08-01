'use client';

/**
 * Høyre kolonne i heroen (§C.1 og §D.1): vindusetikett, vindusnetto,
 * vindusvelger, hero-kurven, statraden — og totalen siden start, når den er stor
 * nok til å fortjene plassen.
 *
 * Undertrykkingsreglene bor her, og de er bevisste (DECISIONS §«Undertrykking»):
 *
 *   1. Totalen siden start vises kun ved `|profit| >= TALL_TERSKEL` (1000 kr).
 *   2. ROI-figuren vises kun ved `|roi * 100| >= ROI_TERSKEL` (5 %).
 *   3. Vindusnettoen SKJULES når den er negativ. Etiketten og kurven blir
 *      stående; det røde tallet gjør ikke. Formen bærer den dårlige nyheten.
 *
 * Ingen av dem skal «forbedres» til å vise mer.
 */

import { useMemo, useState } from 'react';
import {
    ChartOverlay,
    ChartTooltip,
    ChartWrap,
    HERO_VIEWBOX,
    HoverDot,
    SplitArea,
    ZeroLine,
    areaPath,
    crosshairPath,
    hoverGeometri,
    lagSkala,
    linjePath,
    toppProsent,
    useHoverIndeks,
    venstreProsent,
} from '@/components/chart';
import { Laster, PillGroup, type PillOption } from '@/components/ui';
import { ROI_TERSKEL, TALL_TERSKEL } from '@/lib/config';
import { dl, kr, nf, pc, sgn, sgnRaw } from '@/lib/format';
import type { PortfolioPoint, PortfolioSummary } from '@/types';
import { heroUtsnitt, herotall, vindusetikett, type HeroVindu } from './beregninger';
import styles from './Oversikt.module.css';

/* Hero-vinduet er en egen kontroll med egen state. Kurvelabbens rekkevidde er en
 * annen kontroll med et annet verdisett (ALT/60D/20D) — bevisst (§C.1). */
const VINDUER: readonly PillOption<HeroVindu>[] = [
    { value: '60', label: '60D' },
    { value: '90', label: '90D' },
    { value: 'alt', label: 'Alt' },
];

export interface HeroKurveProps {
    /** Hele `portfolio.timeseries`. Vinduet skjæres her inne. */
    timeseries: readonly PortfolioPoint[];
    summary: PortfolioSummary | null;
    laster: boolean;
}

export function HeroKurve({ timeseries, summary, laster }: HeroKurveProps) {
    const [vindu, setVindu] = useState<HeroVindu>('60');

    const utsnitt = useMemo(() => heroUtsnitt(timeseries, vindu), [timeseries, vindu]);
    const tall = useMemo(() => herotall(utsnitt), [utsnitt]);
    const verdier = useMemo(() => utsnitt.punkter.map((p) => p.value), [utsnitt]);

    const skala = useMemo(() => lagSkala(verdier, HERO_VIEWBOX), [verdier]);
    const linje = useMemo(() => linjePath(verdier, skala), [verdier, skala]);
    const { hi, hoverProps } = useHoverIndeks(verdier.length, hoverGeometri(skala));

    const peker = hi !== null && hi < utsnitt.punkter.length ? utsnitt.punkter[hi] : null;

    // Undertrykkingsregel 3: negativ vindusnetto skrives ikke ut.
    const vindusnetto = tall !== null && tall.vindusnetto >= 0 ? tall.vindusnetto : null;
    // Undertrykkingsregel 1 og 2. To uavhengige terskler, to uavhengige figurer.
    const stort = summary !== null && Math.abs(summary.profit) >= TALL_TERSKEL ? summary.profit : null;
    const roi = summary !== null && Math.abs(summary.roi * 100) >= ROI_TERSKEL ? summary.roi : null;

    return (
        <div className={styles.kurveKolonne}>
            <div className={styles.kurveHode}>
                <div className={styles.kurveHodeVenstre}>
                    <span className="t-kicker">{vindusetikett(vindu)}</span>
                    {vindusnetto !== null ? (
                        <span className={styles.vindusnetto}>{kr(vindusnetto)}</span>
                    ) : null}
                </div>
                <PillGroup
                    label="Tidsvindu for hero-kurven"
                    options={VINDUER}
                    value={vindu}
                    onChange={setVindu}
                />
            </div>

            <ChartWrap className={styles.kurveflate} hoverProps={hoverProps}>
                <svg
                    viewBox={`0 0 ${skala.bredde} ${skala.høyde}`}
                    preserveAspectRatio="none"
                    className={styles.heroSvg}
                    role="img"
                    aria-label={`Kumulativ nettogevinst · ${vindusetikett(vindu)}`}
                >
                    {verdier.length > 0 ? (
                        <>
                            <SplitArea d={areaPath(linje, skala)} skala={skala} opacity={0.12} />
                            <ZeroLine skala={skala} stiplet />
                            <path
                                d={linje}
                                fill="none"
                                stroke="var(--ink)"
                                strokeWidth={1.6}
                                vectorEffect="non-scaling-stroke"
                            />
                        </>
                    ) : null}
                    {hi !== null ? (
                        <path
                            d={crosshairPath(hi, skala, true)}
                            stroke="var(--ink)"
                            strokeWidth={1}
                            strokeDasharray="2 3"
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                        />
                    ) : null}
                </svg>
                <ChartOverlay>
                    <HoverDot
                        left={venstreProsent(hi ?? 0, skala)}
                        top={toppProsent(peker?.value ?? 0, skala)}
                        synlig={peker !== null}
                    />
                    <ChartTooltip
                        left={venstreProsent(hi ?? 0, skala)}
                        synlig={peker !== null}
                        dato={dl(peker?.date)}
                        verdi={kr(peker?.value)}
                        sub={
                            peker !== null
                                ? `${nf(peker.bets_placed)} spill · ${nf(peker.bets_won)} traff`
                                : null
                        }
                    />
                </ChartOverlay>
            </ChartWrap>

            <div className={styles.statrad}>
                <Statcelle etikett="Spill i perioden" laster={laster} verdi={nf(tall?.spill)} />
                <Statcelle etikett="Treffrate" laster={laster} verdi={pc(tall?.treffrate)} />
                <Statcelle etikett="Beste dag" laster={laster} verdi={kr(tall?.besteDag)} />
                <Statcelle etikett="Svakeste dag" laster={laster} verdi={kr(tall?.svakesteDag)} />
            </div>

            {stort !== null || roi !== null ? (
                <div className={styles.stortTall}>
                    {stort !== null ? (
                        <>
                            <span
                                className={`t-hero-figure ${stort >= 0 ? 'c-teal' : 'c-vermillion'}`}
                            >
                                {sgnRaw(stort)}
                            </span>
                            <span className={styles.stortSuffiks}>kr siden start</span>
                        </>
                    ) : null}
                    {roi !== null ? (
                        <span className={styles.roiFigur}>
                            <span className="t-stat-label">ROI</span>
                            <span className="t-stat-figure">{sgn(roi)}</span>
                        </span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function Statcelle({ etikett, verdi, laster }: { etikett: string; verdi: string; laster: boolean }) {
    return (
        <div className={styles.statcelle}>
            <span className={`t-stat-label ${styles.statetikett}`}>{etikett}</span>
            <span className={`t-stat-figure ${styles.statfigur}`}>
                {laster ? <Laster /> : verdi}
            </span>
        </div>
    );
}
