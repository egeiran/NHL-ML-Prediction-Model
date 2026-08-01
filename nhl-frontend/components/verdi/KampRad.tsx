/**
 * Én kamp på desktop (§C.2): laginfo til venstre, tre-raders utfallstabell til
 * høyre. Radene er det eneste i appen som animeres — `rise .3s ease both`,
 * satt i CSS-modulen.
 */

import { Tag, TeamCell } from '@/components/ui';
import { MANGLER, klokke, nf, odds as fmtOdds, pc, sgn, sgnRaw } from '@/lib/format';
import { evKlasse, type Kamp, type KampKontekst, type Utfall } from './beregn';
import { Stolpe } from './Stolpe';
import styles from './Verdi.module.css';

export interface KampRadProps {
    kamp: Kamp;
    kontekst: KampKontekst;
    evTerskel: number;
}

function UtfallRad({ utfall, evTerskel }: { utfall: Utfall; evTerskel: number }) {
    return (
        <div
            className={`${styles.utfallGrid} ${styles.utfallRad}${utfall.erUavgjort ? ` ${styles.utfallDempet}` : ''}`}
        >
            <div className={styles.utfallCelle}>
                <div className={styles.utfallTopp}>
                    <span className="t-row-label">{utfall.etikett}</span>
                    <Tag variant={utfall.tagg} />
                </div>
                <Stolpe marked={utfall.marked} modell={utfall.modell} spill={utfall.tagg === 'spill'} />
            </div>
            <span className={styles.tallModell}>{pc(utfall.modell)}</span>
            <span className={styles.tallMarked}>{pc(utfall.marked)}</span>
            <span className={styles.tallOdds}>{fmtOdds(utfall.odds)}</span>
            <span className={`${styles.tallEv} ${evKlasse(utfall.ev, evTerskel)}`}>{sgn(utfall.ev)}</span>
        </div>
    );
}

export function KampRad({ kamp, kontekst, evTerskel }: KampRadProps) {
    return (
        <article className={styles.kamprad}>
            <div className={styles.kampVenstre}>
                <div className={styles.metalinje}>
                    <span>{klokke(kamp.start)}</span>
                    <span className={styles.prikk} aria-hidden="true">
                        ·
                    </span>
                    {/* `value-report.json` har ingen arena. Hjemmebanen er det
                        nærmeste sanne — se rapporten om manglende felt. */}
                    <span>{`Hjemmebane ${kamp.hjemme}`}</span>
                </div>

                <div className={styles.lagblokk}>
                    <TeamCell
                        abbr={kamp.borte}
                        navn={kamp.borteNavn}
                        navnKlasse={styles.lagnavn}
                        under={`Borte · Elo ${nf(kontekst.eloBorte)}`}
                    />
                    <TeamCell
                        abbr={kamp.hjemme}
                        navn={kamp.hjemmeNavn}
                        navnKlasse={styles.lagnavn}
                        under={`Hjemme · Elo ${nf(kontekst.eloHjemme)}`}
                    />
                </div>

                <div className={styles.nokkeltall}>
                    <div>
                        <span className="t-stat-label">Elo-diff</span>
                        <span className={styles.nokkelVerdi}>{sgnRaw(kontekst.eloDiff)}</span>
                    </div>
                    <div>
                        <span className="t-stat-label">Form B/H</span>
                        <span className={`${styles.nokkelVerdi} ${styles.formVerdi}`}>
                            {kontekst.form ?? MANGLER}
                        </span>
                    </div>
                </div>
            </div>

            <div className={styles.kampHoyre}>
                <div className={`${styles.utfallGrid} ${styles.utfallHode}`}>
                    <span>Utfall</span>
                    <span className={styles.hoyre}>Modell</span>
                    <span className={styles.hoyre}>Marked</span>
                    <span className={styles.hoyre}>Odds</span>
                    <span className={styles.hoyre}>EV</span>
                </div>
                {kamp.utfall.map((u) => (
                    <UtfallRad key={u.nøkkel} utfall={u} evTerskel={evTerskel} />
                ))}
            </div>
        </article>
    );
}
