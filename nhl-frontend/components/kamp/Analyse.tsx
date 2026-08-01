'use client';

/**
 * Høyrekolonnen i §C.3: paringstittelen, modellens anbefaling, de tre
 * utfallskolonnene og bunnpanelene med Elo og form.
 *
 * Alt er en ren funksjon av `analyse` — komponenten har ingen egen tilstand, og
 * det er dét som gjør «regnes om ved endring» sant uten en beregn-knapp.
 */

import { MANGLER, nf, sgnRaw } from '@/lib/format';
import type { Analyse as AnalyseData, FormRad } from './beregn';
import { Utfallskolonne } from './Utfallskolonne';
import styles from './Kamp.module.css';

export interface AnalyseProps {
    analyse: AnalyseData;
    evTerskel: number;
}

function EloRad({ nøkkel, verdi }: { nøkkel: string; verdi: string }) {
    return (
        <div className={styles.eloRad}>
            <span className={styles.eloNokkel}>{nøkkel}</span>
            <span className={styles.eloVerdi}>{verdi}</span>
        </div>
    );
}

function Formrad({ rad }: { rad: FormRad }) {
    const sekvens = rad.kamper.map((k) => k.result).join(' ');
    return (
        <div className={styles.formRad}>
            <div className={styles.formTopp}>
                <span className={styles.formNavn}>{rad.navn}</span>
                <span className={styles.formSekvens}>{sekvens === '' ? MANGLER : sekvens}</span>
            </div>
            {rad.kamper.length > 0 ? (
                <div className={styles.formResultater}>
                    {rad.kamper.map((k) => (
                        <span key={`${k.date}-${k.score}`}>
                            {k.venue} {k.score}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function Analyse({ analyse, evTerskel }: AnalyseProps) {
    const { elo } = analyse;
    return (
        <>
            <div className={styles.tittelrad}>
                <h2 className={styles.tittel}>{analyse.tittel}</h2>
                <span className={styles.anbefaling}>
                    Modellens anbefaling: {analyse.anbefaling}
                </span>
            </div>
            {analyse.harPris ? null : (
                <p className={`t-body-small c-faint ${styles.note}`}>
                    Ingen lagret modellpris for denne paringen.
                </p>
            )}

            <div className={styles.utfallGrid}>
                {analyse.utfall.map((u) => (
                    <Utfallskolonne key={u.nøkkel} utfall={u} evTerskel={evTerskel} />
                ))}
            </div>

            <div className={styles.bunn}>
                <section>
                    <h3 className={`t-panel-heading ${styles.panelHode}`}>Elo</h3>
                    <EloRad nøkkel={`${analyse.hjemmeNavn} (hjemme)`} verdi={nf(elo.hjemme)} />
                    <EloRad nøkkel={`${analyse.borteNavn} (borte)`} verdi={nf(elo.borte)} />
                    <EloRad nøkkel="Hjemmefordel" verdi={sgnRaw(elo.hjemmefordel)} />
                    <EloRad nøkkel="Justert differanse" verdi={sgnRaw(elo.justertDiff)} />
                </section>
                <section>
                    <h3 className={`t-panel-heading ${styles.panelHode}`}>Siste fem</h3>
                    {analyse.form.map((rad) => (
                        <Formrad key={rad.abbr} rad={rad} />
                    ))}
                </section>
            </div>
        </>
    );
}
