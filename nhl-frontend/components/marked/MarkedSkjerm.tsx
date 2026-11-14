'use client';

/**
 * Markedet — skyggestrategien på NTs «Vinner inkl. overtid» mot Pinnacle.
 *
 * Hvorfor skjermen finnes: Elo-modellen er på nivå med NT-markedet, ikke
 * bedre, og HUB (1X2) har ~12 % margin. Vinner inkl. OT har ~7 %, og når
 * NT-oddsen ligger over Pinnacles margin-frie pris, er spillet positivt uten at
 * vi trenger å slå markedet selv. Strategien kjører i skygge (notionell
 * innsats) til CLV mot Pinnacle er positiv over 150 spill.
 *
 * Alle tall regnes i Python (`NHL/strategy_ml.py`). Her velges bare utvalg.
 * Tonen er den samme som på Skyggelogg: små utvalg, si hva tallene er.
 */

import type { CSSProperties } from 'react';
import { EmptyState, ErrorState, Laster, SectionHeading } from '@/components/ui';
import { MANGLER, ds, klokke, kr, krTabell, nf, odds as fmtOdds, pc, sgn, sistOppdatert } from '@/lib/format';
import {
    avgjorteSpill,
    besteEv,
    datastatus,
    grunnTekst,
    sideTekst,
    sisteBeslutninger,
    vurdering,
    type Vurdering,
} from '@/lib/marked';
import { useStrategyMl } from '@/lib/use-data';
import type { StrategiData, StrategiRad } from '@/types';
import styles from './Marked.module.css';

const KICKER = 'Markedet';
const TITTEL = 'Vinner inkl. overtid mot Pinnacle';
const INGRESS =
    'Skyggestrategien som spiller når Norsk Tipping gir bedre odds enn Pinnacles margin-frie pris. Ingen ekte innsats før den har bevist seg.';
const KILDE =
    'Kilde: strategy-ml.json — én rad per kamp, låst ved første daglige kjøring der kampen starter innen 24 timer.';

const VURDERING_TEKST: Record<Vurdering, string> = {
    'for-få': 'For få spill til å si noe ennå.',
    positiv: 'Kriteriet er oppfylt: CLV er positiv, og intervallet ligger over null.',
    negativ: 'CLV er negativ, og intervallet ligger under null. Strategien slår ikke markedet.',
    usikker: 'Nok spill, men intervallet krysser null. Ikke bevist.',
};

function fortegnFarge(n: number | null | undefined): string {
    if (n === null || n === undefined) return 'c-muted';
    return n < 0 ? 'c-vermillion' : 'c-teal';
}

function resultatTekst(r: StrategiRad): string {
    if (r.status === 'won') return 'Vunnet';
    if (r.status === 'lost') return 'Tapt';
    if (r.status === 'void') return 'Annullert';
    return 'Åpen';
}

/* -------------------------------------------------------------------------- */

function Paneler({ data }: { data: StrategiData }) {
    const s = data.summary;
    const clv = s.clv_sharp;
    const p = data.portfolio_same_period;
    const mål = s.target_bets;

    const strategiRader = [
        { nokkel: 'Spill med sluttpris', verdi: `${nf(clv.n)} av ${nf(mål)}`, farge: 'c-ink' },
        {
            nokkel: `${nf(data.params.ci_level * 100)} %-intervall`,
            verdi: clv.ci_low === null ? MANGLER : `${sgn(clv.ci_low, 2)} – ${sgn(clv.ci_high, 2)}`,
            farge: 'c-ink',
        },
        { nokkel: 'Spill / åpne', verdi: `${nf(s.bets)} / ${nf(s.open)}`, farge: 'c-ink' },
        { nokkel: 'Resultat', verdi: s.settled ? kr(s.profit) : MANGLER, farge: s.settled ? fortegnFarge(s.profit) : 'c-muted' },
        { nokkel: 'ROI', verdi: sgn(s.roi), farge: s.roi === null ? 'c-muted' : 'c-ink' },
    ];

    const porteføljeRader = p
        ? [
              { nokkel: 'Spill', verdi: nf(p.bets), farge: 'c-ink' },
              { nokkel: 'ROI', verdi: sgn(p.roi), farge: p.roi === null ? 'c-muted' : 'c-ink' },
              {
                  nokkel: 'CLV mot NT-sluttodds',
                  verdi: p.clv_nt === null ? MANGLER : `${sgn(p.clv_nt, 1)} (${nf(p.clv_n)})`,
                  farge: 'c-ink',
              },
          ]
        : [];

    return (
        <section className={`split ${styles.paneler}`} style={{ '--split-gutter': '40px' } as CSSProperties}>
            <div className={styles.panel}>
                <span className={`t-panel-heading c-teal ${styles.panelTittel}`}>
                    CLV mot Pinnacle-close
                </span>
                <span className={`${styles.figur} ${fortegnFarge(clv.mean)}`}>
                    {clv.mean === null ? MANGLER : sgn(clv.mean, 2)}
                </span>
                <div
                    className={styles.stolpe}
                    role="progressbar"
                    aria-label={`Fremdrift mot ${mål} spill`}
                    aria-valuemin={0}
                    aria-valuemax={mål}
                    aria-valuenow={clv.n}
                >
                    <div className={styles.stolpeFyll} style={{ width: `${(s.progress * 100).toFixed(1)}%` }} />
                </div>
                <p className={`t-body-small ${styles.undertekst}`}>
                    {VURDERING_TEKST[vurdering(s)]} Forventet avkastning per spill, målt mot Pinnacles pris
                    ved kampstart.
                </p>
                <dl className={styles.rader}>
                    {strategiRader.map((r) => (
                        <div key={r.nokkel} className={styles.rad}>
                            <dt className={styles.radNokkel}>{r.nokkel}</dt>
                            <dd className={`${styles.radVerdi} ${r.farge}`}>{r.verdi}</dd>
                        </div>
                    ))}
                </dl>
            </div>

            <div className={`${styles.panel} ${styles.panelTint}`}>
                <span className={`t-panel-heading c-vermillion ${styles.panelTittel}`}>
                    Dagens portefølje, samme periode
                </span>
                <span className={`${styles.figur} ${p ? fortegnFarge(p.profit) : 'c-muted'}`}>
                    {p && p.settled ? kr(p.profit) : MANGLER}
                </span>
                <p className={`t-body-small ${styles.undertekst}`}>
                    {p
                        ? `HUB-spillene fra Elo-modellen siden ${ds(p.from)}, med ekte innsats.`
                        : 'Sammenligningen starter med strategiens første kamp.'}
                </p>
                <dl className={styles.rader}>
                    {porteføljeRader.map((r) => (
                        <div key={r.nokkel} className={styles.rad}>
                            <dt className={styles.radNokkel}>{r.nokkel}</dt>
                            <dd className={`${styles.radVerdi} ${r.farge}`}>{r.verdi}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

function Beslutninger({ rader }: { rader: readonly StrategiRad[] }) {
    if (!rader.length) {
        return <EmptyState size="md" headline="Ingen kamper vurdert ennå" body="Den daglige kjøringen fyller tabellen." />;
    }
    return (
        <div className={styles.tabellRam}>
            <table className={styles.tabell}>
                <caption className="sr-only">
                    Siste beslutninger: NT-odds på vinner inkl. overtid, Pinnacles margin-frie sannsynlighet og
                    hva strategien gjorde.
                </caption>
                <colgroup>
                    <col />
                    <col className={styles.kKort} />
                    <col className={styles.kOdds} />
                    <col className={styles.kOdds} />
                    <col className={styles.kProsent} />
                    <col className={styles.kProsent} />
                    <col className={styles.kBeslutning} />
                </colgroup>
                <thead>
                    <tr className={styles.hoderad}>
                        <th scope="col" className="t-table-header">Kamp</th>
                        <th scope="col" className="t-table-header">Start</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>NT hjemme</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>NT borte</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>Pinnacle H</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>Beste EV</th>
                        <th scope="col" className="t-table-header">Beslutning</th>
                    </tr>
                </thead>
                <tbody>
                    {rader.map((r) => {
                        const ev = besteEv(r);
                        const spilt = r.status !== 'nobet';
                        return (
                            <tr key={r.game_key} className={styles.rad2}>
                                <td className={styles.kamp}>{`${r.home_abbr} – ${r.away_abbr}`}</td>
                                <td className={styles.dato}>{klokke(r.start_time)}</td>
                                <td className={`t-table-figure ${styles.hoyre}`}>{fmtOdds(r.nt_ml_home)}</td>
                                <td className={`t-table-figure ${styles.hoyre}`}>{fmtOdds(r.nt_ml_away)}</td>
                                <td className={`t-table-figure ${styles.hoyre} c-faint`}>{pc(r.p_fair_home)}</td>
                                <td className={`t-table-figure ${styles.hoyre} ${fortegnFarge(ev)}`}>{sgn(ev)}</td>
                                <td className={`${styles.beslutning} ${spilt ? 'c-teal' : 'c-muted'}`}>
                                    {spilt ? `Spill ${sideTekst(r)} @ ${fmtOdds(r.odds)}` : grunnTekst(r.skip_reason)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function Avgjorte({ rader }: { rader: readonly StrategiRad[] }) {
    if (!rader.length) {
        return <EmptyState size="md" headline="Ingen avgjorte spill ennå" />;
    }
    return (
        <div className={styles.tabellRam}>
            <table className={styles.tabell}>
                <caption className="sr-only">Avgjorte spill i skyggestrategien, nyeste først. 100 kr notionelt per spill.</caption>
                <colgroup>
                    <col className={styles.kKort} />
                    <col />
                    <col className={styles.kBeslutning} />
                    <col className={styles.kOdds} />
                    <col className={styles.kProsent} />
                    <col className={styles.kProsent} />
                    <col className={styles.kKort} />
                    <col className={styles.kKort} />
                </colgroup>
                <thead>
                    <tr className={styles.hoderad}>
                        <th scope="col" className="t-table-header">Dato</th>
                        <th scope="col" className="t-table-header">Kamp</th>
                        <th scope="col" className="t-table-header">Spill</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>Odds</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>EV</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>CLV</th>
                        <th scope="col" className="t-table-header">Resultat</th>
                        <th scope="col" className={`t-table-header ${styles.hoyre}`}>Netto</th>
                    </tr>
                </thead>
                <tbody>
                    {rader.map((r) => (
                        <tr key={r.game_key} className={styles.rad2}>
                            <td className={styles.dato}>{ds(r.date)}</td>
                            <td className={styles.kamp}>{`${r.home_abbr} – ${r.away_abbr}`}</td>
                            <td className={styles.beslutning}>{sideTekst(r)}</td>
                            <td className={`t-table-figure ${styles.hoyre}`}>{fmtOdds(r.odds)}</td>
                            <td className={`t-table-figure ${styles.hoyre}`}>{sgn(r.ev)}</td>
                            <td className={`t-table-figure ${styles.hoyre} ${fortegnFarge(r.clv_sharp)}`}>{sgn(r.clv_sharp)}</td>
                            <td className={`${styles.resultat} ${r.status === 'won' ? 'c-teal' : r.status === 'lost' ? 'c-vermillion' : 'c-muted'}`}>
                                {resultatTekst(r)}
                            </td>
                            <td className={`${styles.netto} ${fortegnFarge(r.profit)}`}>{krTabell(r.profit)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

export function MarkedSkjerm() {
    const { data, loading, error, retry } = useStrategyMl();

    const hode = (
        <SectionHeading
            kicker={KICKER}
            title={TITTEL}
            ingress={
                <>
                    {INGRESS}
                    <span className={`t-axis-label ${styles.kilde}`}>{KILDE}</span>
                </>
            }
        />
    );

    if (loading) {
        return (
            <main>
                {hode}
                <div className={styles.statusLinje}>
                    <Laster />
                </div>
            </main>
        );
    }

    if (error !== null || data === null) {
        return (
            <main>
                {hode}
                <div className={styles.statusLinje}>
                    {error ? <ErrorState error={error} onRetry={retry} /> : null}
                </div>
            </main>
        );
    }

    const melding = datastatus(data);
    const p = data.params;

    return (
        <main>
            {hode}

            {melding ? <p className={`t-body-small ${styles.melding}`}>{melding}</p> : null}

            <Paneler data={data} />

            <section className={styles.blokk}>
                <h2 className={styles.blokkTittel}>Siste beslutninger</h2>
                <p className={`t-body-small c-muted ${styles.blokkIngress}`}>
                    {data.status.last_run_at ? `Sist kjørt ${sistOppdatert(data.status.last_run_at)}. ` : ''}
                    Spill når beste side har EV over {pc(p.ev_min, 0)} mot Pinnacles margin-frie pris og oddsen er
                    under {nf(p.max_odds, 2)}.
                </p>
                <Beslutninger rader={sisteBeslutninger(data.rows)} />
            </section>

            <section className={styles.blokk}>
                <h2 className={styles.blokkTittel}>Avgjorte spill</h2>
                <Avgjorte rader={avgjorteSpill(data.rows)} />
            </section>

            <section className={styles.forklaring}>
                <h2 className={styles.forklaringTittel}>Hvorfor vinner inkl. overtid, og hvorfor Pinnacle</h2>
                <p className={styles.forklaringTekst}>
                    Elo-modellen bak porteføljen er omtrent like god som Norsk Tipping-markedet, men ikke bedre.
                    På HUB (1X2) tar NT rundt 12 % margin. En modell på nivå med markedet taper da omtrent den
                    marginen over tid, uansett terskel. På vinner inkl. overtid er marginen rundt 7 %.
                </p>
                <p className={styles.forklaringTekst}>
                    Pinnacle har 2–3 % margin og regnes som markedets beste anslag. Når NT gir høyere odds enn
                    Pinnacles pris etter at marginen er trukket fra (power-metoden), har spillet positiv
                    forventning uten at vi må slå markedet med egen modell. Elo-modellens sannsynlighet logges ved
                    siden av, men bestemmer ikke spillene.
                </p>
                <p className={styles.forklaringTekst}>
                    Strategien får ekte innsats først når CLV mot Pinnacle-close er positiv over minst{' '}
                    {nf(p.target_bets)} spill, med nedre grense i et {nf(p.ci_level * 100)} %-intervall over null.
                    CLV skiller ferdighet fra flaks langt raskere enn ROI, som trenger tusenvis av spill.
                </p>
            </section>
        </main>
    );
}
