'use client';

/**
 * Én av de tre utfallskolonnene (§C.3): etikett, sannsynligheten som
 * display-figur, stolpen, de tre tallradene og taggen.
 *
 * Sannsynligheten står uten `%` — «44,0» — fordi figuren er en display-figur,
 * ikke et måltall i en tabell. Marked, Odds og EV er formatert i `lib/format`,
 * som gir `—` når feltet er tomt eller ulesbart.
 */

import { Tag } from '@/components/ui';
import { odds as fmtOdds, pc, pcTall, sgn } from '@/lib/format';
import { utelattTekst } from '@/lib/spill';
import { evKlasse, stolpeBredde, type Utfall } from './beregn';
import styles from './Kamp.module.css';

export interface UtfallskolonneProps {
    utfall: Utfall;
    evTerskel: number;
}

function TallRad({
    nøkkel,
    verdi,
    verdiKlasse,
    stor,
}: {
    nøkkel: string;
    verdi: string;
    verdiKlasse?: string;
    stor?: boolean;
}) {
    return (
        <div className={styles.tallRad}>
            <span className={styles.tallNokkel}>{nøkkel}</span>
            <span
                className={`${stor ? styles.tallVerdiEv : styles.tallVerdi}${
                    verdiKlasse ? ` ${verdiKlasse}` : ''
                }`}
            >
                {verdi}
            </span>
        </div>
    );
}

export function Utfallskolonne({ utfall, evTerskel }: UtfallskolonneProps) {
    const framhevet = utfall.spill;
    // UTELATT har to grunner som ser like ut i taggen: OT/SO og odds over
    // pipelinens tak. Dempingen er lik, teksten er ikke.
    const grunn = utelattTekst(utfall.utelattGrunn);
    return (
        <div
            className={`${styles.utfall}${utfall.utelattGrunn !== null ? ` ${styles.utfallDempet}` : ''}`}
        >
            <span className={styles.utfallEtikett}>{utfall.etikett}</span>
            <span className={`${styles.figur} ${framhevet ? 'c-teal' : 'c-ink'}`}>
                {pcTall(utfall.modell)}
            </span>
            <div className={styles.stolpe}>
                <span
                    className={`${styles.stolpeFyll} ${framhevet ? styles.fyllSpill : styles.fyllVanlig}`}
                    style={{ width: stolpeBredde(utfall.modell) }}
                />
            </div>
            <div className={styles.tall}>
                <TallRad nøkkel="Marked" verdi={pc(utfall.marked)} />
                <TallRad nøkkel="Odds" verdi={fmtOdds(utfall.odds)} />
                <TallRad
                    nøkkel="EV"
                    verdi={sgn(utfall.ev)}
                    verdiKlasse={evKlasse(utfall.ev, evTerskel)}
                    stor
                />
            </div>
            <div className={styles.tagg}>
                <Tag variant={utfall.tagg} />
                {grunn !== null ? <span className={styles.utelattNotis}>{grunn}</span> : null}
            </div>
        </div>
    );
}
