'use client';

/**
 * Kurvelabben under folden (§C.1 og §D.2).
 *
 * Standardmodus er **Daglig P&L**, ikke Verdikurve: heroen viser allerede
 * verdikurven, og å gjenta den rett under er dødt areal. Rekkevidden står på ALT.
 *
 * Rekkeviddepillene her (ALT/60D/20D) er en ANNEN kontroll enn hero-vinduet
 * (60D/90D/ALT), med egen state. Det er bevisst — de svarer på hvert sitt
 * spørsmål og skal ikke synkroniseres.
 *
 * Søylene i «Daglig P&L» er to samlede paths — én per fortegn — fra
 * `søylePaths()`. Aldri n stykk `<rect>`.
 */

import { useCallback, useMemo, useState } from 'react';
import {
    ChartOverlay,
    ChartTooltip,
    ChartWrap,
    HoverDot,
    LAB_VIEWBOX,
    SplitArea,
    XAxis,
    XAxisLabel,
    YAxisLabel,
    ZeroLine,
    areaPath,
    crosshairPath,
    hoverGeometri,
    lagSkala,
    linjePath,
    månedsTicks,
    rutenettPaths,
    søylePaths,
    toppProsent,
    useHoverIndeks,
    venstreProsent,
} from '@/components/chart';
import { Laster, PillGroup, Tabs, type PillOption, type TabOption } from '@/components/ui';
import { dl, kr, nf } from '@/lib/format';
import type { PortfolioPoint } from '@/types';
import {
    labTittel,
    labUtsnitt,
    labVerdier,
    type LabModus,
    type LabRekkevidde,
} from './beregninger';
import styles from './Oversikt.module.css';

const MODI: readonly TabOption<LabModus>[] = [
    { value: 'netto', label: 'Verdikurve' },
    { value: 'dag', label: 'Daglig P&L' },
];

const REKKEVIDDER: readonly PillOption<LabRekkevidde>[] = [
    { value: 'alt', label: 'Alt' },
    { value: '60', label: '60D' },
    { value: '20', label: '20D' },
];

export interface KurvelabProps {
    timeseries: readonly PortfolioPoint[];
    laster: boolean;
}

export function Kurvelab({ timeseries, laster }: KurvelabProps) {
    // Default: Daglig P&L over hele historikken.
    const [modus, setModus] = useState<LabModus>('dag');
    const [rekkevidde, setRekkevidde] = useState<LabRekkevidde>('alt');

    const utsnitt = useMemo(() => labUtsnitt(timeseries, rekkevidde), [timeseries, rekkevidde]);
    const verdier = useMemo(
        () => labVerdier(timeseries, utsnitt, modus),
        [timeseries, utsnitt, modus],
    );

    const skala = useMemo(() => lagSkala(verdier, LAB_VIEWBOX), [verdier]);
    const { hi, hoverProps, nullstill } = useHoverIndeks(verdier.length, hoverGeometri(skala));

    // Å bytte modus eller rekkevidde nullstiller hover (§D.5).
    const byttModus = useCallback(
        (v: LabModus) => {
            setModus(v);
            nullstill();
        },
        [nullstill],
    );
    const byttRekkevidde = useCallback(
        (v: LabRekkevidde) => {
            setRekkevidde(v);
            nullstill();
        },
        [nullstill],
    );

    const linje = useMemo(
        () => (modus === 'netto' ? linjePath(verdier, skala) : ''),
        [modus, verdier, skala],
    );
    const flate = useMemo(() => areaPath(linje, skala), [linje, skala]);
    const søyler = useMemo(
        () => (modus === 'dag' ? søylePaths(verdier, skala) : null),
        [modus, verdier, skala],
    );

    const rutenett = useMemo(() => rutenettPaths(skala, 5).join(''), [skala]);
    const yNivåer = useMemo(
        () => [0, 1, 2, 3, 4].map((k) => skala.mn + ((skala.mx - skala.mn) * k) / 4),
        [skala],
    );
    const xTicks = useMemo(() => månedsTicks(utsnitt.map((p) => p.date)), [utsnitt]);

    const peker = hi !== null && hi < utsnitt.length ? utsnitt[hi] : null;
    const harData = verdier.length > 0;

    /*
     * Tekstalternativet til plottet. Tooltip og hover-prikk er `aria-hidden` og
     * `onMouseMove`-basert, så tittelen alene ga ingen vei til tallene.
     *
     * De to modusene er to forskjellige størrelser: «Verdikurve» er kumulativ
     * nettogevinst, «Daglig P&L» er differansen per kampdag. Setningen sier
     * hvilken, ellers blir «høyeste» tvetydig.
     */
    const ariaTekst = useMemo(() => {
        if (!harData) return `${labTittel(modus)}. Ingen kampdager å tegne ennå.`;
        const siste = verdier.length - 1;
        const høyeste = Math.max(...verdier);
        const laveste = Math.min(...verdier);
        const spill = utsnitt.reduce((s, p) => s + p.bets_placed, 0);
        const treff = utsnitt.reduce((s, p) => s + p.bets_won, 0);
        const periode =
            `${labTittel(modus)}, ${nf(verdier.length)} kampdager fra ` +
            `${dl(utsnitt[0].date)} til ${dl(utsnitt[siste].date)}. `;
        const kropp =
            modus === 'dag'
                ? `Netto i utsnittet ${kr(verdier.reduce((s, v) => s + v, 0))}. ` +
                  `Beste dag ${kr(høyeste)}, svakeste dag ${kr(laveste)}. `
                : `Fra ${kr(verdier[0])} til ${kr(verdier[siste])}, altså ` +
                  `${kr(verdier[siste] - verdier[0])} i utsnittet. ` +
                  `Høyeste ${kr(høyeste)}, laveste ${kr(laveste)}. `;
        return `${periode}${kropp}${nf(spill)} spill, ${nf(treff)} traff.`;
    }, [harData, modus, utsnitt, verdier]);

    return (
        <section className={styles.lab} aria-labelledby="kurvelab-tittel">
            <div className={styles.labHode}>
                <div>
                    <span className="t-kicker">Kurver</span>
                    <h2 id="kurvelab-tittel" className={styles.labTittel}>
                        {labTittel(modus)}
                    </h2>
                </div>
                <div className={styles.labKontroller}>
                    <Tabs label="Kurvemodus" options={MODI} value={modus} onChange={byttModus} />
                    <PillGroup
                        label="Rekkevidde for kurvelabben"
                        options={REKKEVIDDER}
                        value={rekkevidde}
                        onChange={byttRekkevidde}
                    />
                </div>
            </div>

            <div className={styles.labRamme}>
                <div className={styles.labInnhold}>
                    {!harData ? (
                        <div className={styles.labTom}>
                            {laster ? (
                                <Laster />
                            ) : (
                                <p className="t-body-small">Ingen kampdager å tegne ennå.</p>
                            )}
                        </div>
                    ) : (
                        <>
                            <ChartWrap hoverProps={hoverProps}>
                                <svg
                                    viewBox={`0 0 ${skala.bredde} ${skala.høyde}`}
                                    preserveAspectRatio="none"
                                    className={styles.labSvg}
                                    role="img"
                                    aria-label={ariaTekst}
                                >
                                    <path
                                        d={rutenett}
                                        stroke="var(--chart-grid)"
                                        strokeWidth={1}
                                        fill="none"
                                        vectorEffect="non-scaling-stroke"
                                    />
                                    <ZeroLine skala={skala} />
                                    {modus === 'netto' ? (
                                        <>
                                            <SplitArea d={flate} skala={skala} opacity={0.13} />
                                            <path
                                                d={linje}
                                                fill="none"
                                                stroke="var(--ink)"
                                                strokeWidth={1.7}
                                                strokeLinejoin="round"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                        </>
                                    ) : null}
                                    {søyler !== null ? (
                                        <>
                                            <path d={søyler.pos} fill="var(--teal)" opacity={0.85} />
                                            <path
                                                d={søyler.neg}
                                                fill="var(--vermillion)"
                                                opacity={0.85}
                                            />
                                        </>
                                    ) : null}
                                    {hi !== null ? (
                                        <path
                                            d={crosshairPath(hi, skala)}
                                            stroke="var(--ink)"
                                            strokeWidth={1}
                                            strokeDasharray="2 3"
                                            fill="none"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    ) : null}
                                </svg>

                                <ChartOverlay>
                                    {yNivåer.map((v, k) => (
                                        <YAxisLabel key={k} pos={toppProsent(v, skala)}>
                                            {nf(v)}
                                        </YAxisLabel>
                                    ))}
                                    <HoverDot
                                        left={venstreProsent(hi ?? 0, skala)}
                                        top={toppProsent(hi !== null ? verdier[hi] : 0, skala)}
                                        synlig={peker !== null}
                                    />
                                    <ChartTooltip
                                        left={venstreProsent(hi ?? 0, skala)}
                                        synlig={peker !== null}
                                        dato={dl(peker?.date)}
                                        verdi={kr(hi !== null ? verdier[hi] : null)}
                                        sub={
                                            peker !== null
                                                ? `${nf(peker.bets_placed)} spill · ${nf(peker.bets_won)} traff`
                                                : null
                                        }
                                    />
                                </ChartOverlay>

                                <XAxis>
                                    {xTicks.map((t) => (
                                        <XAxisLabel key={t.i} pos={venstreProsent(t.i, skala)}>
                                            {t.label}
                                        </XAxisLabel>
                                    ))}
                                </XAxis>
                            </ChartWrap>
                            <div className={styles.labFot} />
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
