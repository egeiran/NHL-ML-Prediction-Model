/**
 * Ett av de to panelene i sammenligningen (§C.7).
 *
 * De to panelene er likeverdige — samme struktur, samme rader, samme
 * bjelkenevner. Det eneste som skiller dem er flaten (skyggepanelet står på
 * `--tint`) og fargen på paneltittelen.
 */

import type { ReactNode } from 'react';
import type { AnalysisSummary } from '@/lib/analysis';
import { kr, MANGLER, nf, pc, sgn } from '@/lib/format';
import styles from './Skygge.module.css';

export interface PanelProps {
    tittel: string;
    /** `teal` = faktisk portefølje · `vermillion` = skyggelogg. */
    tittelfarge: 'teal' | 'vermillion';
    undertekst: ReactNode;
    /** `null` når utvalget er tomt — da vises `—` og en tom bjelke. */
    sammendrag: AnalysisSummary | null;
    /** Bjelkebredde som CSS-prosent, skalert mot den største av de to nettoene. */
    stolpe: string;
    /** Skyggepanelet: tint flate, tint-linjer, farget ROI-verdi. */
    tint?: boolean;
}

function fargeklasse(n: number): string {
    return n < 0 ? 'c-vermillion' : 'c-teal';
}

export function Panel({ tittel, tittelfarge, undertekst, sammendrag, stolpe, tint = false }: PanelProps) {
    const netto = sammendrag?.profit ?? 0;
    const farge = sammendrag === null ? 'c-muted' : fargeklasse(netto);

    // Skyggepanelet farger ROI-verdien (§C.7); ellers står tallene i ink.
    const roiFarge = tint && sammendrag !== null ? fargeklasse(sammendrag.roi) : 'c-ink';

    const rader: readonly { nokkel: string; verdi: string; farge: string }[] =
        sammendrag === null
            ? [
                  { nokkel: 'Spill', verdi: MANGLER, farge: 'c-muted' },
                  { nokkel: 'ROI', verdi: MANGLER, farge: 'c-muted' },
                  { nokkel: 'Treffrate', verdi: MANGLER, farge: 'c-muted' },
                  { nokkel: 'Modellen anslo', verdi: MANGLER, farge: 'c-muted' },
              ]
            : [
                  { nokkel: 'Spill', verdi: nf(sammendrag.n), farge: 'c-ink' },
                  { nokkel: 'ROI', verdi: sgn(sammendrag.roi), farge: roiFarge },
                  { nokkel: 'Treffrate', verdi: pc(sammendrag.hit_rate), farge: 'c-ink' },
                  {
                      nokkel: 'Modellen anslo',
                      // sum(model_prob) mot antallet treff som faktisk kom.
                      verdi: `${nf(sammendrag.expected_hits_model, 1)} treff · ${nf(sammendrag.hits)} faktisk`,
                      farge: 'c-ink',
                  },
              ];

    return (
        <div className={`${styles.panel}${tint ? ` ${styles.panelTint}` : ''}`}>
            <span className={`t-panel-heading ${styles.panelTittel} ${tittelfarge === 'teal' ? 'c-teal' : 'c-vermillion'}`}>
                {tittel}
            </span>

            <span className={`${styles.figur} ${farge}`}>
                {sammendrag === null ? MANGLER : kr(netto)}
            </span>

            {/* Rent presentasjonslag — nettoen står i klartekst rett over. */}
            <div className={styles.stolpe} aria-hidden="true">
                <div
                    className={styles.stolpeFyll}
                    style={{
                        width: sammendrag === null ? '0%' : stolpe,
                        background: netto < 0 ? 'var(--vermillion)' : 'var(--teal)',
                    }}
                />
            </div>

            <p className={`t-body-small ${styles.undertekst}`}>{undertekst}</p>

            <dl className={styles.rader}>
                {rader.map((r) => (
                    <div key={r.nokkel} className={styles.rad}>
                        <dt className={styles.radNokkel}>{r.nokkel}</dt>
                        <dd className={`${styles.radVerdi} ${r.farge}`}>{r.verdi}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
