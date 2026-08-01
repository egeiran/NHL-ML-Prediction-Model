'use client';

/**
 * Kampkort på mobil (§F.3). Hele kortet er én knapp som åpner detaljvisningen
 * for kampen — det er lokal tilstand i skjermen, ikke en egen rute
 * (DECISIONS punkt 3: de sju rutene er hele navigasjonen).
 */

import { TeamLogo } from '@/components/ui';
import { klokke, nf } from '@/lib/format';
import { utelattTekst } from '@/lib/spill';
import type { Kamp } from './beregn';
import styles from './Verdi.module.css';

export interface MobilKortProps {
    kamp: Kamp;
    onÅpne: (id: string) => void;
    /** Kalles med noden, så skjermen kan gi fokus tilbake etter «tilbake». */
    knappRef?: (node: HTMLButtonElement | null) => void;
}

export function MobilKort({ kamp, onÅpne, knappRef }: MobilKortProps) {
    const antall = kamp.antallSpill;
    // OT/SO-grunnen står i skjermens fotnote og gjentas ikke på hvert kort.
    // Oddstaket har ingen fotnote, og uten den ser «ingen» ut som at markedet
    // priser kampen som modellen — en helt annen grunn.
    const overTak = kamp.utfall.find((u) => u.utelattGrunn === 'oddstak') ?? null;
    const notis = utelattTekst(overTak?.utelattGrunn ?? null);
    return (
        <button
            type="button"
            ref={knappRef}
            className={styles.kort}
            // Innholdet nedenfor er dekorativt for skjermlesere når knappen har
            // `aria-label`, så notisen må stå i etiketten for å bli lest.
            aria-label={`${kamp.borteNavn} mot ${kamp.hjemmeNavn} — vis alle utfall${notis !== null ? `. ${notis}` : ''}`}
            onClick={() => onÅpne(kamp.id)}
        >
            <span className={styles.kortTopp}>
                <span className={styles.kortTid}>{klokke(kamp.start)}</span>
                <span className={`${styles.kortTagg}${antall > 0 ? ` ${styles.kortTaggSpill}` : ''}`}>
                    {antall > 0 ? `${nf(antall)} spill` : 'ingen'}
                </span>
            </span>
            {notis !== null ? <span className={styles.kortNotis}>{notis}</span> : null}
            <span className={styles.kortLag}>
                <TeamLogo abbr={kamp.borte} size={30} />
                <span className={styles.kortNavn}>{kamp.borteNavn}</span>
            </span>
            <span className={`${styles.kortLag} ${styles.kortLagAndre}`}>
                <TeamLogo abbr={kamp.hjemme} size={30} />
                <span className={styles.kortNavn}>{kamp.hjemmeNavn}</span>
            </span>
        </button>
    );
}
