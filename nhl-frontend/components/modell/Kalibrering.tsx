'use client';

/**
 * Kalibreringskurven (§C.6, §D.3) — skjermens viktigste figur.
 *
 * Modellen tegnes som ink-polylinje med fylte prikker, markedet som faint med
 * hule. Poenget er kontrasten: markedet lander på diagonalen, modellen ligger
 * over den. Wilson-intervallet står som vertikal whisker på hvert punkt, og
 * `n` står alltid synlig — med ~34 spill per bøtte er intervallene brede, og
 * det skal de se ut som.
 *
 * Prikker og akseetiketter er absolutt posisjonert HTML oppå SVG-en (§D.5).
 * Tallene i figuren finnes også i tabellen ved siden av, så figuren er aldri
 * eneste kilde.
 */

import type { AnalysisSummary, CalibrationBucket } from '@/lib/analysis';
import { venstreProsent, toppProsent } from '@/components/chart';
import { nf, pc, pcTall, kr, krTabell, MANGLER, NBSP } from '@/lib/format';
import {
    KAL_BREDDE,
    KAL_HOYDE,
    KAL_X_TICKS,
    KAL_Y_TICKS,
    KAL_X_LO,
    KAL_X_HI,
    kalibreringsSkala,
    polylinjePath,
    prikkStorrelse,
    type Punkt,
} from './geometri';
import { TANKESTREK, kvantil } from './botter';
import styles from './Modell.module.css';

/** En rad i «Per utfallstype». */
export interface UtfallsRad {
    nokkel: string;
    navn: string;
    n: number;
    modell: number;
    marked: number;
    treff: number;
    netto: number;
}

export interface KalibreringProps {
    bøtter: readonly CalibrationBucket[];
    sammendrag: AnalysisSummary;
    utfall: readonly UtfallsRad[];
    utenDraw: boolean;
    /**
     * OT/SO-raden regnet på HELE utvalget, uavhengig av toggelen — noten under
     * «Per utfallstype» skal kunne si hva OT/SO kostet også når OT/SO er tatt
     * ut av `utfall`. `null` når historikken ikke har avregnede OT/SO-spill.
     */
    otSo: UtfallsRad | null;
}

export function Kalibrering({ bøtter, sammendrag, utfall, utenDraw, otSo }: KalibreringProps) {
    const skala = kalibreringsSkala(bøtter.length);
    const harData = bøtter.length > 0;

    const modellPunkter: Punkt[] = bøtter.map((b) => ({
        x: skala.X(b.model_mean),
        y: skala.Y(b.hit_rate),
    }));
    const markedPunkter: Punkt[] = bøtter
        .slice()
        .sort((a, b) => a.implied_mean - b.implied_mean)
        .map((b) => ({ x: skala.X(b.implied_mean), y: skala.Y(b.hit_rate) }));

    // Hvor mange bøtter lover mer enn de leverer? Skal aldri påstås, alltid telles.
    const overBøtter = bøtter.filter((b) => b.hit_rate < b.model_mean).length;
    const markedOverBøtter = bøtter.filter((b) => b.hit_rate < b.implied_mean).length;
    const minN = bøtter.reduce((m, b) => Math.min(m, b.n), Number.POSITIVE_INFINITY);
    const maksN = bøtter.reduce((m, b) => Math.max(m, b.n), 0);

    const diagonal = polylinjePath([
        { x: skala.X(KAL_X_LO), y: skala.Y(KAL_X_LO) },
        { x: skala.X(KAL_X_HI), y: skala.Y(KAL_X_HI) },
    ]);

    const ariaTekst = harData
        ? `Kalibreringskurve med ${bøtter.length} kvantilbøtter. ` +
          bøtter
              .map(
                  (b, i) =>
                      `${kvantil(i)}: modellen sa ${pc(b.model_mean)}, markedet ${pc(
                          b.implied_mean,
                      )}, faktisk ${pc(b.hit_rate)} av ${b.n} spill`,
              )
              .join('. ') +
          '. Samme tall står i tabellen «Per sannsynlighetsintervall».'
        : 'Ingen avgjorte spill å kalibrere mot ennå.';

    return (
        <section className={`${styles.seksjon} ${styles.kalibrering}`}>
            <div className={styles.kalibreringVenstre}>
                <span className="t-kicker">Kalibrering</span>
                <h2 className={styles.panelTittel}>Predikert mot faktisk</h2>

                {!harData ? (
                    <p className={styles.tomPlott}>Ingen avgjorte spill å kalibrere mot ennå.</p>
                ) : (
                    <>
                        <div className={styles.plottWrap}>
                            <svg
                                className={styles.plottSvg}
                                viewBox={`0 0 ${KAL_BREDDE} ${KAL_HOYDE}`}
                                role="img"
                                aria-label={ariaTekst}
                            >
                                {KAL_X_TICKS.map((a) => (
                                    <path
                                        key={`gx-${a}`}
                                        d={`M${skala.X(a).toFixed(1)} ${skala.PT}V${skala.PT + skala.ph}`}
                                        stroke="var(--rule-light)"
                                        strokeWidth={1}
                                        fill="none"
                                    />
                                ))}
                                {KAL_Y_TICKS.map((a) => (
                                    <path
                                        key={`gy-${a}`}
                                        d={`M${skala.PL} ${skala.Y(a).toFixed(1)}H${skala.PL + skala.pw}`}
                                        stroke="var(--rule-light)"
                                        strokeWidth={1}
                                        fill="none"
                                    />
                                ))}

                                {/* Perfekt kalibrering. Over linja = modellen lover mer enn den leverer. */}
                                <path
                                    d={diagonal}
                                    stroke="var(--dash)"
                                    strokeWidth={1}
                                    strokeDasharray="4 4"
                                    fill="none"
                                />

                                {/* Wilson-intervallene. Samme treffrate gjelder begge seriene, så de
                                    tegnes én gang — på modellens x. */}
                                {bøtter.map((b) => {
                                    const x = skala.X(b.model_mean);
                                    const yHi = skala.Y(b.wilson.hi);
                                    const yLo = skala.Y(b.wilson.lo);
                                    return (
                                        <path
                                            key={`w-${b.lo}-${b.hi}`}
                                            d={
                                                `M${x.toFixed(1)} ${yHi.toFixed(1)}V${yLo.toFixed(1)}` +
                                                `M${(x - 4).toFixed(1)} ${yHi.toFixed(1)}h8` +
                                                `M${(x - 4).toFixed(1)} ${yLo.toFixed(1)}h8`
                                            }
                                            stroke="var(--muted)"
                                            strokeWidth={1}
                                            fill="none"
                                        />
                                    );
                                })}

                                <path
                                    d={polylinjePath(markedPunkter)}
                                    stroke="var(--faint)"
                                    strokeWidth={1.4}
                                    fill="none"
                                />
                                <path
                                    d={polylinjePath(modellPunkter)}
                                    stroke="var(--ink)"
                                    strokeWidth={1.8}
                                    fill="none"
                                />
                            </svg>

                            {/* Overlegg: prikker, n og akseetiketter — HTML, ikke SVG (§D.5). */}
                            <div className={styles.plottOverlegg} aria-hidden="true">
                                {bøtter.map((b) => {
                                    const d = `${prikkStorrelse(b.n).toFixed(0)}px`;
                                    return (
                                        <span
                                            key={`pm-${b.lo}-${b.hi}`}
                                            className={`rund ${styles.prikk} ${styles.prikkMarked}`}
                                            style={{
                                                left: venstreProsent(b.implied_mean, skala),
                                                top: toppProsent(b.hit_rate, skala),
                                                width: d,
                                                height: d,
                                            }}
                                        />
                                    );
                                })}
                                {bøtter.map((b) => {
                                    const d = `${prikkStorrelse(b.n).toFixed(0)}px`;
                                    return (
                                        <span
                                            key={`pk-${b.lo}-${b.hi}`}
                                            className={`rund ${styles.prikk} ${styles.prikkModell}`}
                                            style={{
                                                left: venstreProsent(b.model_mean, skala),
                                                top: toppProsent(b.hit_rate, skala),
                                                width: d,
                                                height: d,
                                            }}
                                        />
                                    );
                                })}
                                {bøtter.map((b) => (
                                    <span
                                        key={`n-${b.lo}-${b.hi}`}
                                        className={styles.nEtikett}
                                        style={{
                                            left: venstreProsent(b.model_mean, skala),
                                            top: toppProsent(b.wilson.lo, skala),
                                        }}
                                    >
                                        n = {nf(b.n)}
                                    </span>
                                ))}
                                {KAL_Y_TICKS.map((a) => (
                                    <span
                                        key={`ty-${a}`}
                                        className={`t-axis-label ${styles.yTick}`}
                                        style={{ top: toppProsent(a, skala) }}
                                    >
                                        {pc(a, 0)}
                                    </span>
                                ))}
                                {KAL_X_TICKS.map((a) => (
                                    <span
                                        key={`tx-${a}`}
                                        className={`t-axis-label ${styles.xTick}`}
                                        style={{ left: venstreProsent(a, skala) }}
                                    >
                                        {pc(a, 0)}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className={styles.aksetittel}>
                            <span className="t-stat-label">Y: faktisk treffrate</span>
                            <span className="t-stat-label">X: predikert</span>
                        </div>

                        <div className={styles.tegnforklaring}>
                            <span className={styles.tegn}>
                                <span className={`rund ${styles.tegnFylt}`} aria-hidden="true" />
                                Modellen
                            </span>
                            <span className={styles.tegn}>
                                <span className={`rund ${styles.tegnHul}`} aria-hidden="true" />
                                Markedet
                            </span>
                            <span className={styles.tegn}>
                                <span className={styles.tegnWhisker} aria-hidden="true" />
                                {`95${NBSP}%`} Wilson
                            </span>
                        </div>

                        <p className={styles.noteSterk}>
                            Modellen forventet {nf(sammendrag.expected_hits_model, 1)} treff, markedet{' '}
                            {nf(sammendrag.expected_hits_market, 1)}. Faktisk: {nf(sammendrag.hits)}. Under den
                            stiplede linja betyr sjeldnere enn anslått — modellen ligger over den i{' '}
                            {nf(overBøtter)} av {nf(bøtter.length)} bøtter, markedet i {nf(markedOverBøtter)}.
                        </p>
                        <p className={styles.note}>
                            Kurven gjelder <strong>spillene vi tar</strong>, ikke modellen generelt. Loggene lagrer
                            bare det valgte utfallet, så vi ser kalibrering på nøyaktig de utfallene modellen var mest
                            optimistisk om. Det er seleksjonsskjevhet, og den trekker i samme retning som
                            overkonfidensen: en modell som er riktig i snitt kan se overkonfident ut her.
                            Kalibreringen på alle tre utfall per kamp kan vi ikke måle før alle tre logges.
                        </p>
                        <p className={styles.note}>
                            Med {nf(minN)}
                            {minN === maksN ? '' : `${TANKESTREK}${nf(maksN)}`} spill per bøtte er
                            Wilson-intervallene brede. Én bøtte under diagonalen er ikke i seg selv bevis; det er
                            at nesten alle er det samtidig, og at markedet ikke er det.
                        </p>
                    </>
                )}
            </div>

            <div className={styles.kalibreringHoyre}>
                <span className="t-kicker">Per sannsynlighetsintervall</span>
                {/*
                 * Ekte <table> med <th scope>, men radene er CSS-grid slik at
                 * kolonnene holder linja. `display: grid` fjerner tabellens
                 * implisitte ARIA-roller i flere nettlesere, så rollene står
                 * eksplisitt — samme mønster som `components/elo/EloTabell.tsx`.
                 */}
                <table className={styles.tabell} role="table">
                    <caption className="sr-only">
                        Per sannsynlighetsintervall — kvantilbøtter med antall spill, modellens og
                        markedets snittsannsynlighet, og faktisk treffrate med {`95${NBSP}%`}{' '}
                        Wilson-intervall.
                    </caption>
                    <thead className={styles.gruppe} role="rowgroup">
                        <tr
                            className={`${styles.tabellHode} ${styles.kalibreringsGrid} t-table-header`}
                            role="row"
                        >
                            <th scope="col" role="columnheader" className={styles.hodeCelle}>
                                Kvantil
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.hodeCelle} ${styles.hoyre}`}
                            >
                                N
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.hodeCelle} ${styles.hoyre}`}
                            >
                                Snitt modell
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.hodeCelle} ${styles.hoyre}`}
                            >
                                Snitt marked
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.hodeCelle} ${styles.hoyre}`}
                            >
                                Faktisk
                            </th>
                        </tr>
                    </thead>
                    <tbody className={styles.gruppe} role="rowgroup">
                        {bøtter.length === 0 ? (
                            <tr className={`${styles.tabellRad} ${styles.kalibreringsGrid}`} role="row">
                                <th scope="row" role="rowheader" className={styles.botteCelle}>
                                    <span className={styles.botteNavn}>{MANGLER}</span>
                                </th>
                                <td role="cell" className={`t-table-figure ${styles.hoyre} c-faint`}>
                                    0
                                </td>
                                <td role="cell" className={`t-table-figure ${styles.hoyre}`}>
                                    {MANGLER}
                                </td>
                                <td role="cell" className={`t-table-figure ${styles.hoyre} c-faint`}>
                                    {MANGLER}
                                </td>
                                <td role="cell" className={`${styles.faktisk} c-faint`}>
                                    {MANGLER}
                                </td>
                            </tr>
                        ) : (
                            bøtter.map((b, i) => (
                                <tr
                                    key={`rad-${b.lo}-${b.hi}`}
                                    className={`${styles.tabellRad} ${styles.kalibreringsGrid}`}
                                    role="row"
                                >
                                    <th scope="row" role="rowheader" className={styles.botteCelle}>
                                        <span className={styles.botteNavn}>{kvantil(i)}</span>
                                        <span className={styles.botteGrense}>
                                            {pcTall(b.lo, 0)}
                                            {TANKESTREK}
                                            {pc(b.hi, 0)}
                                        </span>
                                    </th>
                                    <td role="cell" className={`t-table-figure ${styles.hoyre} c-faint`}>
                                        {nf(b.n)}
                                    </td>
                                    <td role="cell" className={`t-table-figure ${styles.hoyre}`}>
                                        {pc(b.model_mean)}
                                    </td>
                                    <td role="cell" className={`t-table-figure ${styles.hoyre} c-faint`}>
                                        {pc(b.implied_mean)}
                                    </td>
                                    <td
                                        role="cell"
                                        className={`${styles.faktisk} ${
                                            b.hit_rate >= b.model_mean ? 'c-teal' : 'c-vermillion'
                                        }`}
                                    >
                                        {pc(b.hit_rate)}
                                        <span className={styles.usikkerhet}>
                                            {pcTall(b.wilson.lo, 0)}
                                            {TANKESTREK}
                                            {pc(b.wilson.hi, 0)}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                <p className={styles.tabellNote}>
                    Bøttene er kvantiler av modellens sannsynlighet, ikke faste intervaller: like mange spill
                    i hver. Tallet under K-merket er lavest og høyest observerte modellsannsynlighet i bøtta,
                    så to nabobøtter kan møtes på samme verdi. Under «Faktisk» står {`95${NBSP}%`}{' '}
                    Wilson-intervallet for treffraten.
                </p>

                <div className={styles.blokkAvstand}>
                    <span className="t-kicker">Per utfallstype</span>
                    <table className={styles.tabell} role="table">
                        <caption className="sr-only">
                            Per utfallstype — antall spill, treff modellen og markedet forventet,
                            faktiske treff og netto i kroner.
                        </caption>
                        <thead className={styles.gruppe} role="rowgroup">
                            <tr
                                className={`${styles.tabellHode} ${styles.utfallsGrid} t-table-header`}
                                role="row"
                            >
                                <th scope="col" role="columnheader" className={styles.hodeCelle}>
                                    Utfall
                                </th>
                                <th
                                    scope="col"
                                    role="columnheader"
                                    className={`${styles.hodeCelle} ${styles.hoyre}`}
                                >
                                    N
                                </th>
                                <th
                                    scope="col"
                                    role="columnheader"
                                    className={`${styles.hodeCelle} ${styles.hoyre}`}
                                >
                                    Modell
                                </th>
                                <th
                                    scope="col"
                                    role="columnheader"
                                    className={`${styles.hodeCelle} ${styles.hoyre}`}
                                >
                                    Marked
                                </th>
                                <th
                                    scope="col"
                                    role="columnheader"
                                    className={`${styles.hodeCelle} ${styles.hoyre}`}
                                >
                                    Faktisk
                                </th>
                                <th
                                    scope="col"
                                    role="columnheader"
                                    className={`${styles.hodeCelle} ${styles.hoyre}`}
                                >
                                    Netto kr
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.gruppe} role="rowgroup">
                            {utfall.map((u) => (
                                <tr
                                    key={u.nokkel}
                                    className={`${styles.tabellRad} ${styles.utfallsGrid}`}
                                    role="row"
                                >
                                    <th
                                        scope="row"
                                        role="rowheader"
                                        className={`t-team-name-table ${styles.radNavn}`}
                                    >
                                        {u.navn}
                                    </th>
                                    <td role="cell" className={`t-table-figure ${styles.hoyre} c-faint`}>
                                        {nf(u.n)}
                                    </td>
                                    <td role="cell" className={`t-table-figure ${styles.hoyre}`}>
                                        {nf(u.modell, 1)}
                                    </td>
                                    <td role="cell" className={`t-table-figure ${styles.hoyre} c-faint`}>
                                        {nf(u.marked, 1)}
                                    </td>
                                    <td role="cell" className={styles.faktisk}>
                                        {nf(u.treff)}
                                    </td>
                                    <td
                                        role="cell"
                                        className={`${styles.faktisk} ${
                                            u.netto >= 0 ? 'c-teal' : 'c-vermillion'
                                        }`}
                                    >
                                        {krTabell(u.netto)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/*
                     * Tallene i noten telles fra OT/SO-raden, ikke skrives for
                     * hånd: pipelinen skriver om datasettet hver natt, og en
                     * hardkodet variant ved siden av en tabell som viser det
                     * samme ville sett mest autoritativ ut den dagen de spriker.
                     */}
                    <p className={styles.tabellNote}>
                        {!utenDraw
                            ? 'Modell og Marked er antall treff de to forventet, ikke prosent. OT/SO legges ikke inn lenger.'
                            : otSo === null
                              ? 'OT/SO er utelatt fra hele skjermen. Historikken har ingen avregnede OT/SO-spill.'
                              : `OT/SO er utelatt fra hele skjermen. De ${nf(otSo.n)} spillene sto for ${kr(
                                    otSo.netto,
                                )}.`}
                    </p>
                </div>
            </div>
        </section>
    );
}
