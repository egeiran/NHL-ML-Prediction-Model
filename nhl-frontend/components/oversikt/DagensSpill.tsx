'use client';

/**
 * Venstre kolonne i heroen (§C.1): opptil tre spill over EV-terskelen, eller
 * tomtilstanden.
 *
 * Tomtilstanden er hovedtilstanden — `value-report.json` er en tom array i
 * sesongpausen — så den er bygget ferdig, ikke som et ettertanke: vertikalt
 * sentrert utsagn i Serif, `max-width: 18ch`, og to knapper videre.
 */

import { ButtonLink, Laster, TeamCell } from '@/components/ui';
import { klokke, odds as fmtOdds, sannsynlighet, sgn } from '@/lib/format';
import type { Spill } from './beregninger';
import styles from './Oversikt.module.css';

export interface DagensSpillProps {
    /** Allerede sortert på EV synkende. Komponenten viser de tre første. */
    spill: readonly Spill[];
    /** Setningen i tomtilstanden. Følger av om det finnes kamper i det hele tatt. */
    tomLinje: string;
    laster: boolean;
}

export function DagensSpill({ spill, tomLinje, laster }: DagensSpillProps) {
    const topp = spill.slice(0, 3);

    return (
        <div className={styles.spillKolonne}>
            <span className={`t-kicker ${styles.spillKicker}`}>Dagens spill</span>

            {laster ? (
                <div className={styles.spillTom}>
                    <Laster />
                </div>
            ) : topp.length > 0 ? (
                <div className={styles.spillListe}>
                    {topp.map((s) => (
                        <div key={s.nøkkel} className={styles.spillRad}>
                            <div className={styles.spillTopp}>
                                <span className={styles.spillTid}>{klokke(s.start)}</span>
                                <span className={styles.spillEv}>{sgn(s.ev)}</span>
                            </div>
                            <TeamCell
                                className={styles.spillLag}
                                abbr={s.abbr}
                                navn={s.navn}
                                under={
                                    s.side === 'uavgjort'
                                        ? `OT/SO mot ${s.motstander}`
                                        : `${s.side} mot ${s.motstander}`
                                }
                            />
                            <div className={styles.spillNøkkeltall}>
                                <span>modell {sannsynlighet(s.modellProb)}</span>
                                <span>odds {fmtOdds(s.odds)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={styles.spillTom}>
                    <p className={styles.spillTomLinje}>{tomLinje}</p>
                    <div className={styles.spillTomKnapper}>
                        <ButtonLink href="/kamp">Analyser en kamp</ButtonLink>
                        <ButtonLink href="/verdi" variant="secondary">
                            Se hele dagen
                        </ButtonLink>
                    </div>
                </div>
            )}
        </div>
    );
}
