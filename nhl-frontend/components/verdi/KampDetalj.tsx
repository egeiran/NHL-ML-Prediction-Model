'use client';

/**
 * Detaljvisningen bak et kampkort på mobil (§F.3). Alle tre utfall stablet, med
 * en `←`-kontroll i headeren. Den erstatter skjermhodet mens den står åpen, så
 * den bærer skjermens eneste `<h1>`.
 */

import { useEffect, useRef } from 'react';
import { Tag } from '@/components/ui';
import { MANGLER, dl, klokke, odds as fmtOdds, pc, sgn, sgnRaw } from '@/lib/format';
import { evKlasse, type Kamp, type KampKontekst, type Utfall } from './beregn';
import { Stolpe } from './Stolpe';
import styles from './Verdi.module.css';

export interface KampDetaljProps {
    kamp: Kamp;
    kontekst: KampKontekst;
    evTerskel: number;
    onTilbake: () => void;
    /** Fotnoten om at OT/SO prises, men ikke spilles. */
    fotnote: string;
}

function DetaljTall({
    etikett,
    verdi,
    verdiKlasse,
    høyre,
}: {
    etikett: string;
    verdi: string;
    verdiKlasse?: string;
    høyre?: boolean;
}) {
    return (
        <span className={høyre ? styles.detaljTallHoyre : undefined}>
            <span className={styles.detaljTallEtikett}>{etikett}</span>
            <span className={`${styles.detaljTallVerdi}${verdiKlasse ? ` ${verdiKlasse}` : ''}`}>
                {verdi}
            </span>
        </span>
    );
}

function DetaljUtfall({ utfall, evTerskel }: { utfall: Utfall; evTerskel: number }) {
    return (
        <div className={`${styles.detaljUtfall}${utfall.erUavgjort ? ` ${styles.utfallDempet}` : ''}`}>
            <div className={styles.detaljTopp}>
                <span className="t-row-label">{utfall.etikett}</span>
                <Tag variant={utfall.tagg} />
            </div>
            <Stolpe
                marked={utfall.marked}
                modell={utfall.modell}
                spill={utfall.tagg === 'spill'}
                className={styles.detaljStolpe}
            />
            <div className={styles.detaljTall}>
                <DetaljTall etikett="Modell" verdi={pc(utfall.modell)} />
                <DetaljTall
                    etikett="Marked"
                    verdi={pc(utfall.marked)}
                    verdiKlasse={styles.detaljTallVerdiFaint}
                />
                <DetaljTall etikett="Odds" verdi={fmtOdds(utfall.odds)} />
                <DetaljTall
                    etikett="EV"
                    verdi={sgn(utfall.ev)}
                    verdiKlasse={`${styles.detaljTallVerdiEv} ${evKlasse(utfall.ev, evTerskel)}`}
                    høyre
                />
            </div>
        </div>
    );
}

export function KampDetalj({ kamp, kontekst, evTerskel, onTilbake, fotnote }: KampDetaljProps) {
    const tilbakeRef = useRef<HTMLButtonElement | null>(null);

    // Skjermen bytter innhold uten at ruten endres, så fokus må flyttes hit
    // selv. Uten dette blir tastaturfokus stående på et kort som ikke finnes.
    useEffect(() => {
        tilbakeRef.current?.focus();
    }, [kamp.id]);

    const tid = klokke(kamp.start);
    const dato = dl(kamp.dato);

    return (
        <>
            <header className={styles.detaljHode}>
                <button
                    type="button"
                    ref={tilbakeRef}
                    className={styles.tilbake}
                    onClick={onTilbake}
                    aria-label="Tilbake til kamplista"
                >
                    <span aria-hidden="true">←</span>
                </button>
                <div>
                    <h1 className={styles.detaljTittel}>{`${kamp.borteNavn} – ${kamp.hjemmeNavn}`}</h1>
                    <p className={styles.detaljUnder}>
                        {tid === MANGLER ? dato : `${dato} · ${tid}`}
                    </p>
                </div>
            </header>

            <div className={styles.detaljStripe}>
                <span>
                    <span className={styles.detaljTallEtikett}>Elo-diff</span>
                    <span className={styles.detaljTallVerdi}>{sgnRaw(kontekst.eloDiff)}</span>
                </span>
                <span>
                    <span className={styles.detaljTallEtikett}>Form B/H</span>
                    <span className={`${styles.detaljTallVerdi} ${styles.formVerdi}`}>
                        {kontekst.form ?? MANGLER}
                    </span>
                </span>
            </div>

            {kamp.utfall.map((u) => (
                <DetaljUtfall key={u.nøkkel} utfall={u} evTerskel={evTerskel} />
            ))}

            <p className={styles.fotnote}>{fotnote}</p>
        </>
    );
}
