'use client';

/**
 * «Hva hvis»-simulator for innsatsregel.
 *
 * Reglene er normalisert til samme totale omsetning som flat innsats — ellers
 * ville vi sammenlignet risikonivå og ikke regel. Equity-kurven for valgt regel
 * tegnes som stiplet linje oppå flat-kurven, og bootstrap-intervallene for alle
 * reglene står under hverandre på felles akse. Det er hele poenget: reglene ser
 * vidt forskjellige ut i kroner, og intervallene overlapper fullstendig.
 */

import { useMemo, useState } from 'react';
import {
    LAB_VIEWBOX,
    ChartOverlay,
    ChartTooltip,
    ChartWrap,
    HoverDot,
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
    toppProsent,
    useHoverIndeks,
    venstreProsent,
    type Skala,
} from '@/components/chart';
import {
    STAKE_RULES,
    equityCurve,
    w_flat,
    type AnalysisBet,
    type StakeRuleRow,
} from '@/lib/analysis';
import { MANGLER, dl, kr, krp, krTabell, nf, pc, sgn } from '@/lib/format';
import { PillGroup } from '@/components/ui';
import { andelProsent } from './geometri';
import styles from './Modell.module.css';

/* -------------------------------------------------------------------------- */

interface RegelVisning {
    /** Kort etikett i pilleraden. */
    pille: string;
    /** Navnet over grafen. */
    navn: string;
    forklaring: string;
}

/** Norsk visningstekst per regel. `STAKE_RULES` sine labels er Python-navn. */
const VISNING: Record<string, RegelVisning> = {
    flat: {
        pille: 'Flat',
        navn: 'Flat innsats',
        forklaring: '100 kr på hvert spill. Dagens regel, og referansen alt måles mot.',
    },
    linear_ev: {
        pille: 'Lineær i EV',
        navn: 'Lineær i EV',
        forklaring: 'Innsatsen proporsjonal med EV. Satser mest der modellen ser størst kant.',
    },
    ev_squared: {
        pille: 'EV²',
        navn: 'EV i annen',
        forklaring: 'Innsatsen proporsjonal med EV². Samme rangering som lineær, bare hardere.',
    },
    tiered: {
        pille: 'Trappetrinn',
        navn: 'Trappetrinn',
        forklaring: '0,5× under EV 0,20 · 1× til 0,30 · 1,5× til 0,45 · 2× over.',
    },
    kelly: {
        pille: 'Kelly',
        navn: 'Kelly på rå modellsannsynlighet',
        forklaring: 'f* = (p·o − 1) / (o − 1), gulv på 0. Bruker modellens ukalibrerte p.',
    },
    quarter_kelly: {
        pille: 'Kvart Kelly',
        navn: 'Kvart Kelly på rå modellsannsynlighet',
        forklaring: '0,25 × Kelly. Etter normalisering til lik omsetning er det samme regel.',
    },
    inverse_odds: {
        pille: '1/(odds−1)',
        navn: 'Kun 1/(odds − 1)',
        forklaring: 'Ignorerer EV helt og satser bare invers i utbetalingen.',
    },
};

function visning(id: string): RegelVisning {
    return VISNING[id] ?? { pille: id, navn: id, forklaring: '' };
}

/* -------------------------------------------------------------------------- */

export interface SimulatorProps {
    /** Avregnede spill, allerede filtrert av OT/SO-toggelen. */
    spill: readonly AnalysisBet[];
    /** Radene fra `analyze().rules` — samme utvalg. */
    regler: readonly StakeRuleRow[];
    /** `portfolio.timeseries[].date` — felles x-akse. */
    datoer: readonly string[];
}

export function Simulator({ spill, regler, datoer }: SimulatorProps) {
    const [valgt, setValgt] = useState<string>('kelly');

    const valgtRegel = STAKE_RULES.find((r) => r.id === valgt) ?? STAKE_RULES[0];
    const rad = regler.find((r) => r.id === valgt) ?? regler[0];
    const flatRad = regler.find((r) => r.id === 'flat');
    const kellyRad = regler.find((r) => r.id === 'kelly');
    const kvartRad = regler.find((r) => r.id === 'quarter_kelly');

    const kurver = useMemo(() => {
        const flat = equityCurve(spill, w_flat, datoer).map((p) => p.value);
        const regel = equityCurve(spill, valgtRegel.weight, datoer).map((p) => p.value);
        return { flat, regel };
    }, [spill, datoer, valgtRegel]);

    // Én skala for begge seriene: `lagSkala` gir verdiområdet av unionen og
    // x-aksen av seriens lengde. Begge har samme viewBox, så de kan settes sammen.
    const skala: Skala = useMemo(() => {
        const felles = lagSkala([...kurver.flat, ...kurver.regel], LAB_VIEWBOX);
        const akse = lagSkala(kurver.flat, LAB_VIEWBOX);
        return { ...akse, mn: felles.mn, mx: felles.mx, Y: felles.Y, zeroY: felles.zeroY };
    }, [kurver]);

    const { hi, hoverProps } = useHoverIndeks(kurver.flat.length, hoverGeometri(skala));
    const ticks = useMemo(() => månedsTicks(datoer), [datoer]);

    const flatLinje = linjePath(kurver.flat, skala);
    const regelLinje = linjePath(kurver.regel, skala);
    const erFlat = valgt === 'flat';
    const yNivåer = [0, 1, 2, 3, 4].map((k) => skala.mn + (skala.mx - skala.mn) * (k / 4));

    const omsetning = rad?.staked ?? 0;
    const identiskMedKelly =
        kellyRad !== undefined &&
        kvartRad !== undefined &&
        Math.abs(kellyRad.profit - kvartRad.profit) < 1e-6;

    /* --- felles akse for usikkerhetsstripa ------------------------------- */
    const stripe = useMemo(() => {
        let lo = 0;
        let hiV = 0;
        for (const r of regler) {
            lo = Math.min(lo, r.bootstrap.lo, r.delta_vs_flat);
            hiV = Math.max(hiV, r.bootstrap.hi, r.delta_vs_flat);
        }
        const spenn = hiV - lo || 1;
        return { lo, hi: hiV, andel: (v: number) => (v - lo) / spenn };
    }, [regler]);

    const antallSomOverlapperNull = regler.filter(
        (r) => r.id !== 'flat' && r.bootstrap.lo <= 0 && r.bootstrap.hi >= 0,
    ).length;

    if (rad === undefined || spill.length === 0) {
        return (
            <section className={styles.simulator}>
                <span className="t-kicker">Hva hvis</span>
                <h2 className={styles.panelTittel}>Innsatsregler</h2>
                <p className={styles.tomPlott}>Ingen avgjorte spill å simulere på ennå.</p>
            </section>
        );
    }

    return (
        <section className={styles.simulator}>
            <span className="t-kicker">Hva hvis · innsatsregel</span>
            <h2 className={styles.panelTittel}>Hadde en annen innsatsregel gjort det bedre?</h2>
            <p className={styles.noteSterk}>
                Alle reglene er normalisert til samme totale omsetning som flat innsats,{' '}
                {krp(omsetning)}. Uten den normaliseringen ville vi sammenlignet risikonivå og ikke regel.
                Ingen logger endres — dette er en teoretisk omregning av de {nf(spill.length)} avregnede
                spillene.
            </p>

            <div className={styles.kontroller}>
                <PillGroup
                    label="Innsatsregel"
                    size="md"
                    value={valgt}
                    onChange={setValgt}
                    options={STAKE_RULES.map((r) => ({ value: r.id, label: visning(r.id).pille }))}
                />
                <span className="t-stat-label">
                    Innsats {krp(rad.min_stake)}
                    {' – '}
                    {krp(rad.max_stake)}
                </span>
            </div>

            <h3 className={styles.panelTittelLiten}>{visning(valgt).navn}</h3>
            <p className={styles.note}>{visning(valgt).forklaring}</p>

            <ChartWrap className={styles.kurveRamme} hoverProps={hoverProps}>
                <svg
                    className={styles.kurveSvg}
                    viewBox={`0 0 ${skala.bredde} ${skala.høyde}`}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`Kumulativ nettogevinst for ${visning(valgt).navn} mot flat innsats, ${dl(
                        datoer[0],
                    )} til ${dl(datoer[datoer.length - 1])}. Regelen ender på ${kr(
                        rad.profit,
                    )}, flat innsats på ${kr(flatRad?.profit ?? 0)}.`}
                >
                    {rutenettPaths(skala).map((d, i) => (
                        <path
                            key={`g-${i}`}
                            d={d}
                            stroke="var(--chart-grid)"
                            strokeWidth={1}
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    <SplitArea d={areaPath(regelLinje, skala)} skala={skala} opacity={0.13} />
                    <ZeroLine skala={skala} />
                    <path
                        d={flatLinje}
                        fill="none"
                        stroke="var(--faint)"
                        strokeWidth={1.4}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                    {erFlat ? null : (
                        <path
                            d={regelLinje}
                            fill="none"
                            stroke="var(--ink)"
                            strokeWidth={1.8}
                            strokeDasharray="6 4"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    )}
                    {hi === null ? null : (
                        <path
                            d={crosshairPath(hi, skala)}
                            stroke="var(--ink)"
                            strokeWidth={1}
                            strokeDasharray="2 3"
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                        />
                    )}
                </svg>

                <ChartOverlay>
                    {yNivåer.map((v, i) => (
                        <YAxisLabel key={`y-${i}`} pos={toppProsent(v, skala)}>
                            {krTabell(v)}
                        </YAxisLabel>
                    ))}
                    <HoverDot
                        left={venstreProsent(hi ?? 0, skala)}
                        top={toppProsent(kurver.regel[hi ?? 0] ?? 0, skala)}
                        synlig={hi !== null}
                    />
                    <ChartTooltip
                        left={venstreProsent(hi ?? 0, skala)}
                        synlig={hi !== null}
                        dato={dl(datoer[hi ?? 0])}
                        verdi={kr(kurver.regel[hi ?? 0] ?? 0)}
                        sub={`flat ${kr(kurver.flat[hi ?? 0] ?? 0)}`}
                    />
                    <XAxis>
                        {ticks.map((t) => (
                            <XAxisLabel key={`x-${t.i}`} pos={venstreProsent(t.i, skala)}>
                                {t.label}
                            </XAxisLabel>
                        ))}
                    </XAxis>
                </ChartOverlay>
            </ChartWrap>
            <div className={styles.kurveSpacer} />

            <div className={styles.tegnforklaring}>
                <span className={styles.tegn}>
                    <span className={styles.tegnFlat} aria-hidden="true" />
                    Flat innsats
                </span>
                <span className={styles.tegn}>
                    <span className={styles.tegnStiplet} aria-hidden="true" />
                    {visning(valgt).navn}
                </span>
            </div>

            <div className={styles.nokkeltall}>
                <div className={styles.nokkelCelle}>
                    <span className="t-stat-label">Sluttresultat</span>
                    <span
                        className={`${styles.nokkelVerdi} ${rad.profit >= 0 ? 'c-teal' : 'c-vermillion'}`}
                    >
                        {kr(rad.profit)}
                    </span>
                    <span className={styles.nokkelSub}>omsetning {krp(rad.staked)}</span>
                </div>
                <div className={styles.nokkelCelle}>
                    <span className="t-stat-label">ROI</span>
                    <span className={`${styles.nokkelVerdi} ${rad.roi >= 0 ? 'c-teal' : 'c-vermillion'}`}>
                        {sgn(rad.roi)}
                    </span>
                    <span className={styles.nokkelSub}>per krone satset</span>
                </div>
                <div className={styles.nokkelCelle}>
                    <span className="t-stat-label">Mot flat innsats</span>
                    <span
                        className={`${styles.nokkelVerdi} ${
                            erFlat ? 'c-muted' : rad.delta_vs_flat >= 0 ? 'c-teal' : 'c-vermillion'
                        }`}
                    >
                        {erFlat ? 'referanse' : kr(rad.delta_vs_flat)}
                    </span>
                    <span className={styles.nokkelSub}>
                        {erFlat ? 'alt måles mot denne' : `flat ga ${kr(flatRad?.profit ?? 0)}`}
                    </span>
                </div>
                <div className={styles.nokkelCelle}>
                    <span className="t-stat-label">Bootstrap 95 %</span>
                    <span className={`${styles.nokkelVerdi} c-muted`}>
                        {erFlat
                            ? MANGLER
                            : `${krTabell(rad.bootstrap.lo)} … ${krTabell(rad.bootstrap.hi)}`}
                    </span>
                    <span className={styles.nokkelSub}>
                        {erFlat
                            ? 'referansen har ingen differanse'
                            : `slår flat i ${pc(rad.bootstrap.p_better, 0)} av trekningene`}
                    </span>
                </div>
            </div>

            {erFlat ? null : (
                <p className={styles.noteSterk}>
                    {rad.bootstrap.lo <= 0 && rad.bootstrap.hi >= 0
                        ? `Intervallet inneholder null: ${kr(
                              rad.delta_vs_flat,
                          )} er ikke til å skille fra ingen effekt i det hele tatt.`
                        : `Intervallet utelukker null. Merk at det er ett av ${nf(
                              regler.length - 1,
                          )} regler testet på det samme utvalget.`}
                </p>
            )}

            {valgt === 'quarter_kelly' && identiskMedKelly ? (
                <p className={styles.noteSterk}>
                    Kvart Kelly gir nøyaktig samme resultat som full Kelly. Normaliseringen til lik omsetning
                    fjerner konstantfaktoren 0,25 — den skalerer alle innsatsene likt, og forsvinner når summen
                    settes tilbake til {krp(omsetning)}. Fraksjonell Kelly er en regel om <em>hvor mye</em> av
                    bankrullen som settes i spill, ikke om <em>hvordan</em> spillene vektes mot hverandre. Med
                    fast omsetning er det bare vektingen som kan måles.
                </p>
            ) : null}

            {/* --- usikkerhetsstripa ------------------------------------- */}
            <div className={styles.stripe}>
                <span className="t-kicker">Bootstrap-differanse mot flat · 95 %</span>
                <h3 className={styles.panelTittelLiten}>Regler som ser vidt forskjellige ut i kroner</h3>
                <p className={styles.note}>
                    Hver stripe er 95 %-intervallet for differansen mot flat innsats over 10 000 trekninger med
                    tilbakelegging. Prikken er det observerte resultatet. Klikk en rad for å bytte regel.{' '}
                    {antallSomOverlapperNull === regler.length - 1
                        ? 'Alle intervallene inneholder null, og de overlapper hverandre fullstendig.'
                        : `${nf(antallSomOverlapperNull)} av ${nf(regler.length - 1)} intervaller inneholder null.`}
                </p>

                {regler.map((r) => {
                    const v = visning(r.id);
                    const erValgt = r.id === valgt;
                    const erReferanse = r.id === 'flat';
                    const venstre = stripe.andel(erReferanse ? 0 : r.bootstrap.lo);
                    const høyre = stripe.andel(erReferanse ? 0 : r.bootstrap.hi);
                    return (
                        <button
                            key={r.id}
                            type="button"
                            className={`${styles.stripeRad}${erValgt ? ` ${styles.stripeRadValgt}` : ''}`}
                            aria-pressed={erValgt}
                            onClick={() => setValgt(r.id)}
                        >
                            <span className={styles.stripeNavn}>{v.navn}</span>
                            <span className={styles.stripeSpor}>
                                <span
                                    className={styles.stripeNull}
                                    style={{ left: andelProsent(stripe.andel(0)) }}
                                />
                                {erReferanse ? null : (
                                    <span
                                        className={styles.stripeBar}
                                        style={{
                                            left: andelProsent(venstre),
                                            width: andelProsent(høyre - venstre),
                                        }}
                                    />
                                )}
                                <span
                                    className={styles.stripePunkt}
                                    style={{ left: andelProsent(stripe.andel(r.delta_vs_flat)) }}
                                />
                            </span>
                            <span className={styles.stripeTall}>
                                {erReferanse
                                    ? 'referanse'
                                    : `${krTabell(r.bootstrap.lo)} … ${krTabell(r.bootstrap.hi)}`}
                            </span>
                        </button>
                    );
                })}

                <div className={`${styles.stripeRad} ${styles.stripeAkseRad}`} aria-hidden="true">
                    <span />
                    <span className={styles.stripeAkse}>
                        <span className={`t-axis-label ${styles.stripeAkseVenstre}`}>{kr(stripe.lo)}</span>
                        <span
                            className={`t-axis-label ${styles.stripeAkseNull}`}
                            style={{ left: andelProsent(stripe.andel(0)) }}
                        >
                            0
                        </span>
                        <span className={`t-axis-label ${styles.stripeAkseHoyre}`}>{kr(stripe.hi)}</span>
                    </span>
                    <span />
                </div>

                <p className={styles.note}>
                    Konklusjonen står i {kr(rad.delta_vs_flat)} mot en usikkerhet på flere tusen kroner: dataen
                    kan ikke skille reglene fra hverandre. Behold flat innsats til sannsynlighetene er kalibrert.
                </p>
            </div>
        </section>
    );
}
