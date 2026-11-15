'use client';

/**
 * «Verdi i dag» → «Vinner inkl. OT · Pinnacle». Kampene de neste 48 timene med
 * NTs pris på vinner inkl. overtid mot Pinnacles pris uten margin.
 *
 * Dette er prisene skyggestrategien (`NHL/strategy_ml.py`) beslutter på. EV
 * regnes i Python (`market_board`) og leses rett ut; skjermen regner ingenting.
 * Kampene besluttes ved første morgenkjøring der de starter innen 24 timer,
 * så kamper lenger fram står som «Besluttes neste morgen».
 */

import Link from 'next/link';
import { EmptyState, ErrorState, Laster } from '@/components/ui';
import { klokke, odds as fmtOdds, pc, sgn, sistOppdatert } from '@/lib/format';
import { datastatus, tavle, tavleBeslutning } from '@/lib/marked';
import { useStrategyMl } from '@/lib/use-data';
import styles from './Verdi.module.css';

function evFarge(ev: number | null, terskel: number): string {
    if (ev === null) return 'c-faint';
    if (ev > terskel) return 'c-teal';
    return ev < 0 ? 'c-muted' : 'c-ink';
}

export function VinnerOtTavle() {
    const { data, loading, error, retry } = useStrategyMl();

    if (loading) {
        return (
            <div className={styles.kroppLaster}>
                <Laster />
            </div>
        );
    }
    if (error !== null || data === null) {
        return error ? <ErrorState className={styles.feilblokk} error={error} onRetry={retry} /> : null;
    }

    const rader = tavle(data);
    const terskel = data.params.ev_min;
    const melding = datastatus(data);
    const prisetSist = rader.reduce<string | null>(
        (siste, r) => (r.priced_at && (!siste || r.priced_at > siste) ? r.priced_at : siste),
        null,
    );

    return (
        <section className={styles.otListe}>
            <p className={`t-body-small ${styles.otIngress}`}>
                NT-odds på vinner inkl. overtid mot Pinnacles pris uten margin. EV er Pinnacles sannsynlighet
                ganget med NT-oddsen, minus 1. Skyggestrategien spiller når den er over {pc(terskel, 0)} og oddsen
                under {fmtOdds(data.params.max_odds)}, foreløpig uten ekte innsats.{' '}
                <Link href="/marked" className={styles.otLenke}>
                    Se hvordan strategien går
                </Link>
                .
            </p>
            {melding ? <p className={`t-body-small ${styles.merknad}`}>{melding}</p> : null}

            {rader.length === 0 ? (
                <EmptyState
                    size="md"
                    headline="Ingen priser logget for de neste 48 timene"
                    body="Tavla fylles av den daglige kjøringen når Norsk Tipping har NHL-kamper ute."
                />
            ) : (
                <>
                    <div className={styles.otTabellRam}>
                        <table className={styles.otTabell}>
                            <caption className="sr-only">
                                Vinner inkl. overtid: Norsk Tipping mot Pinnacle for kampene de neste 48 timene.
                            </caption>
                            <colgroup>
                                <col className={styles.otKTid} />
                                <col />
                                <col className={styles.otKOdds} />
                                <col className={styles.otKOdds} />
                                <col className={styles.otKOdds} />
                                <col className={styles.otKProsent} />
                                <col className={styles.otKOdds} />
                                <col className={styles.otKOdds} />
                                <col className={styles.otKBeslutning} />
                            </colgroup>
                            <thead>
                                <tr className={styles.otHoderad}>
                                    <th scope="col" className="t-table-header">Start</th>
                                    <th scope="col" className="t-table-header">Kamp</th>
                                    <th scope="col" className={`t-table-header ${styles.otHoyre}`}>NT H</th>
                                    <th scope="col" className={`t-table-header ${styles.otHoyre}`}>NT B</th>
                                    <th scope="col" className={`t-table-header ${styles.otHoyre}`}>Margin</th>
                                    <th scope="col" className={`t-table-header ${styles.otHoyre}`}>Pinnacle H</th>
                                    <th scope="col" className={`t-table-header ${styles.otHoyre}`}>EV H</th>
                                    <th scope="col" className={`t-table-header ${styles.otHoyre}`}>EV B</th>
                                    <th scope="col" className="t-table-header">Strategien</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rader.map((r) => {
                                    const b = tavleBeslutning(r);
                                    return (
                                        <tr key={r.game_key} className={styles.otRad}>
                                            <td className={styles.otTid}>{klokke(r.start_time)}</td>
                                            <td className={styles.otKamp}>{`${r.home_abbr} – ${r.away_abbr}`}</td>
                                            <td className={`t-table-figure ${styles.otHoyre}`}>{fmtOdds(r.nt_ml_home)}</td>
                                            <td className={`t-table-figure ${styles.otHoyre}`}>{fmtOdds(r.nt_ml_away)}</td>
                                            <td className={`t-table-figure ${styles.otHoyre} c-faint`}>{pc(r.nt_ml_margin)}</td>
                                            <td className={`t-table-figure ${styles.otHoyre}`}>{pc(r.p_fair_home)}</td>
                                            <td className={`t-table-figure ${styles.otHoyre} ${evFarge(r.ev_home, terskel)}`}>{sgn(r.ev_home)}</td>
                                            <td className={`t-table-figure ${styles.otHoyre} ${evFarge(r.ev_away, terskel)}`}>{sgn(r.ev_away)}</td>
                                            <td className={`${styles.otBeslutning} ${b.spill ? 'c-teal' : 'c-muted'}`}>{b.tekst}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className={styles.fotnote}>
                        {prisetSist ? `Priser hentet ${sistOppdatert(prisetSist)}. ` : ''}
                        Til sammenligning har HUB rundt dobbelt så høy margin. Margin-kolonnen er NTs påslag på vinner
                        inkl. overtid for akkurat den kampen.
                    </p>
                </>
            )}
        </section>
    );
}
