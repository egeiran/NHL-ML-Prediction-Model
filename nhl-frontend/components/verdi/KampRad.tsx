/**
 * Én kamp på desktop (§C.2): laginfo til venstre, tre-raders utfallstabell til
 * høyre. Radene er det eneste i appen som animeres — `rise .3s ease both`,
 * satt i CSS-modulen.
 *
 * Utfallstabellen er en ekte `<table>` med `<th scope>`, mens radene er
 * CSS-grid slik at kolonnene holder linja. Det var fem løse div-er før, og en
 * skjermleser fikk fem tall uten kolonnetilknytning per rad. `display:
 * block/grid` fjerner tabellens implisitte ARIA-roller i flere nettlesere, så
 * rollene står eksplisitt — samme mønster som `components/elo/EloTabell.tsx`.
 */

import { Tag, TeamCell } from '@/components/ui';
import { MANGLER, klokke, nf, odds as fmtOdds, pc, sgn, sgnRaw } from '@/lib/format';
import { utelattTekst } from '@/lib/spill';
import { evKlasse, type Kamp, type KampKontekst, type Utfall } from './beregn';
import { Stolpe } from './Stolpe';
import styles from './Verdi.module.css';

export interface KampRadProps {
    kamp: Kamp;
    kontekst: KampKontekst;
    evTerskel: number;
}

function UtfallRad({ utfall, evTerskel }: { utfall: Utfall; evTerskel: number }) {
    // Dempingen gjelder begge utelatelsesgrunnene; teksten skiller dem. Uten den
    // ser en odds over pipelinens tak ut som OT/SO, som er en annen grunn.
    const grunn = utelattTekst(utfall.utelattGrunn);
    return (
        <tr
            role="row"
            className={`${styles.utfallGrid} ${styles.utfallRad}${utfall.utelattGrunn !== null ? ` ${styles.utfallDempet}` : ''}`}
        >
            <th scope="row" role="rowheader" className={styles.utfallCelle}>
                <span className={styles.utfallTopp}>
                    <span className="t-row-label">{utfall.etikett}</span>
                    <Tag variant={utfall.tagg} />
                </span>
                <Stolpe marked={utfall.marked} modell={utfall.modell} spill={utfall.tagg === 'spill'} />
                {grunn !== null ? <span className={styles.utelattNotis}>{grunn}</span> : null}
            </th>
            <td role="cell" className={styles.tallModell}>
                {pc(utfall.modell)}
            </td>
            <td role="cell" className={styles.tallMarked}>
                {pc(utfall.marked)}
            </td>
            <td role="cell" className={styles.tallOdds}>
                {fmtOdds(utfall.odds)}
            </td>
            <td role="cell" className={`${styles.tallEv} ${evKlasse(utfall.ev, evTerskel)}`}>
                {sgn(utfall.ev)}
            </td>
        </tr>
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
                <table className={styles.utfallTabell} role="table">
                    <caption className="sr-only">
                        {`Utfall for ${kamp.borteNavn} hos ${kamp.hjemmeNavn}`}
                    </caption>
                    <thead className={styles.utfallGruppe} role="rowgroup">
                        <tr className={`${styles.utfallGrid} ${styles.utfallHode}`} role="row">
                            <th scope="col" role="columnheader" className={styles.utfallHodeCelle}>
                                Utfall
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.utfallHodeCelle} ${styles.hoyre}`}
                            >
                                Modell
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.utfallHodeCelle} ${styles.hoyre}`}
                            >
                                Marked
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.utfallHodeCelle} ${styles.hoyre}`}
                            >
                                Odds
                            </th>
                            <th
                                scope="col"
                                role="columnheader"
                                className={`${styles.utfallHodeCelle} ${styles.hoyre}`}
                            >
                                EV
                            </th>
                        </tr>
                    </thead>
                    <tbody className={styles.utfallGruppe} role="rowgroup">
                        {kamp.utfall.map((u) => (
                            <UtfallRad key={u.nøkkel} utfall={u} evTerskel={evTerskel} />
                        ))}
                    </tbody>
                </table>
            </div>
        </article>
    );
}
