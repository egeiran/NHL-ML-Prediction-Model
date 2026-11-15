'use client';

/**
 * Skyggestrategien på vinner inkl. OT, rett under heroen på Oversikt.
 *
 * Heroen handler om porteføljen (HUB). Denne blokken sier hvor den nye
 * strategien står: CLV mot Pinnacle, fremdrift mot kriteriet for ekte
 * innsats, og dagens åpne spill. Tallene er Pythons (`strategy-ml.json`).
 *
 * Feiler fila, viser blokken én linje i stedet for å ta over skjermen –
 * Oversikt skal fortsatt svare på porteføljespørsmålet.
 */

import Link from 'next/link';
import { Laster } from '@/components/ui';
import { klokke, nf, odds as fmtOdds, sgn } from '@/lib/format';
import { datastatus, sideTekst, vurdering, åpneSpill, type Vurdering } from '@/lib/marked';
import { useStrategyMl } from '@/lib/use-data';
import styles from './Oversikt.module.css';

const VURDERING: Record<Vurdering, string> = {
    'for-få': 'For få spill ennå',
    positiv: 'Kriteriet er oppfylt',
    negativ: 'Slår ikke markedet',
    usikker: 'Ikke bevist',
};

export function MarkedStatus() {
    const { data, loading, error } = useStrategyMl();

    const hode = (
        <div className={styles.markedHode}>
            <h2 id="marked-status" className={`t-kicker ${styles.seksjonsKicker}`}>
                Vinner inkl. OT mot Pinnacle · skygge
            </h2>
            <Link href="/marked" className={styles.markedLenke}>
                Se Markedet →
            </Link>
        </div>
    );

    if (loading || error !== null || data === null) {
        return (
            <section className={styles.marked} aria-labelledby="marked-status">
                {hode}
                <div className={styles.markedTom}>
                    {loading ? <Laster /> : <p className="t-body-small">Fant ikke strategidataen akkurat nå.</p>}
                </div>
            </section>
        );
    }

    const s = data.summary;
    const clv = s.clv_sharp;
    const åpne = åpneSpill(data.rows).slice(0, 3);
    const melding = datastatus(data);

    return (
        <section className={styles.marked} aria-labelledby="marked-status">
            {hode}
            <div className={styles.markedTall}>
                <div className={styles.markedCelle}>
                    <span className="t-stat-label">CLV mot Pinnacle</span>
                    <span className={`${styles.markedFigur} ${clv.mean === null ? 'c-muted' : clv.mean < 0 ? 'c-vermillion' : 'c-teal'}`}>
                        {clv.mean === null ? '—' : sgn(clv.mean, 2)}
                    </span>
                </div>
                <div className={styles.markedCelle}>
                    <span className="t-stat-label">Spill med sluttpris</span>
                    <span className={styles.markedFigur}>{`${nf(clv.n)} av ${nf(s.target_bets)}`}</span>
                </div>
                <div className={styles.markedCelle}>
                    <span className="t-stat-label">Status</span>
                    <span className={styles.markedFigur}>{VURDERING[vurdering(s)]}</span>
                </div>
            </div>

            {åpne.length > 0 ? (
                <div className={styles.markedListe}>
                    {åpne.map((r) => (
                        <div key={r.game_key} className={styles.markedRad}>
                            <span className={styles.sisteDato}>{klokke(r.start_time)}</span>
                            <span className={styles.sisteKamp}>{`${r.home_abbr} – ${r.away_abbr}`}</span>
                            <span className={styles.sisteSide}>{sideTekst(r)}</span>
                            <span className={styles.sisteOdds}>{fmtOdds(r.odds)}</span>
                            <span className={`${styles.sisteNetto} c-teal`}>{sgn(r.ev)}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className={`t-body-small ${styles.markedNote}`}>
                    {melding ?? 'Ingen åpne spill. NT ligger ikke langt nok over Pinnacle på noen av kampene som er besluttet.'}
                </p>
            )}
        </section>
    );
}
