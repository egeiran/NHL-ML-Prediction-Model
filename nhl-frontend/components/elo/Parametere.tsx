'use client';

/**
 * Parameterpanelet på Elo-skjermen (§C.5).
 *
 * De seks parameterne kommer fra `elo.json:config` — ingenting er hardkodet,
 * så panelet følger pipelinen når den endres. Under står datagrunnlaget
 * (`meta.n_games`, `meta.through`) og Utah-forbeholdet.
 *
 * Omfanget av Utah-vinduet (antall spill, treff, netto) telles av `utahVindu()`
 * i `lib/utah.ts`, som Skyggeloggen bruker på samme måte — samme filter, samme
 * tall, ett sted. Auditens anslag (`−280 kr`) står som konstant: det er en
 * konklusjon fra en analyse, ikke noe som lar seg utlede av historikken.
 *
 * Omfangssetningen trenger `portfolio.json` (130 KB), som Elo-skjermen ellers
 * ikke bruker. Den ligger derfor bevisst utenfor `EloSkjerm`s lastegate —
 * ratingtabellen skal ikke vente på en fil den ikke trenger. Prisen er at
 * setningen kommer etter resten av panelet, og den betales med en eksplisitt
 * lastetilstand i stedet for at teksten popper inn fra ingenting.
 */

import { useMemo } from 'react';
import { Laster } from '@/components/ui';
import { dl, kr, nf, sgnRaw } from '@/lib/format';
import { usePortfolio } from '@/lib/use-data';
import { utahVindu } from '@/lib/utah';
import type { EloConfig, EloMeta } from '@/types';
import styles from './Elo.module.css';

/**
 * Rekkefølgen er designets, ikke `config`-objektets alfabetiske. Etikettene er
 * norske; nøklene står ikke i UI-et.
 */
function parameterRader(config: EloConfig): readonly { nøkkel: string; verdi: string }[] {
    return [
        { nøkkel: 'Grunnrating', verdi: nf(config.base_rating) },
        { nøkkel: 'K-faktor', verdi: nf(config.k_factor) },
        // Hjemmefordelen er et påslag, ikke et nivå — derfor eksplisitt fortegn.
        { nøkkel: 'Hjemmefordel', verdi: sgnRaw(config.home_advantage) },
        { nøkkel: 'Skala', verdi: nf(config.scale) },
        { nøkkel: 'Sesongregresjon', verdi: nf(config.season_regression, 2) },
        { nøkkel: 'OT-seiersvekt', verdi: nf(config.ot_win_score, 2) },
    ];
}

/** «Ingen traff» · «Ett traff» · «3 traff». Ett treff i dag, men det telles. */
function treffSetning(treff: number): string {
    if (treff === 0) return 'Ingen traff';
    if (treff === 1) return 'Ett traff';
    return `${nf(treff)} traff`;
}

export interface ParametereProps {
    config: EloConfig;
    meta: EloMeta;
}

export function Parametere({ config, meta }: ParametereProps) {
    const portefølje = usePortfolio();
    const rader = portefølje.data?.bets;

    // `undefined` mens historikken laster, ved lastefeil, og hvis vinduet er
    // tomt. Da står forbeholdet uten omfangssetningen framfor å påstå «0 spill».
    const vindu = useMemo(() => {
        if (rader === undefined) return undefined;
        const v = utahVindu(rader);
        return v.sammendrag.n > 0 ? v : undefined;
    }, [rader]);

    return (
        <>
            <section aria-labelledby="elo-parametere">
                <h2 id="elo-parametere" className={`t-panel-heading ${styles.panelHeading}`}>
                    Parametere
                </h2>
                <dl className={styles.parameterListe}>
                    {parameterRader(config).map((p) => (
                        <div key={p.nøkkel} className={styles.parameterRad}>
                            <dt className={styles.parameterNokkel}>{p.nøkkel}</dt>
                            <dd className={styles.parameterVerdi}>{p.verdi}</dd>
                        </div>
                    ))}
                </dl>
                <p className={styles.grunnlag}>
                    Ratingene hviler på {nf(meta.n_games)} kamper, til og med {dl(meta.through)}.
                </p>
            </section>

            {/*
             * Forbeholdet handler ikke om nøkkelnavnet i denne filen — `elo.json`
             * skrives med visningsforkortelser, så Utah står under UTA her.
             * Det handler om perioden da formberegningen leste laget feil.
             * Ordlyden følger PROBLEMS.md; tallene er auditens, ikke avrundet i
             * vår favør.
             */}
            <section className={styles.forbehold} aria-labelledby="elo-forbehold">
                <h2 id="elo-forbehold" className={styles.forbeholdEtikett}>
                    Kjent datavindu
                </h2>
                <p className={styles.forbeholdTekst}>
                    Fram til {dl('2026-04-17')} leste formberegningen Utahs hjemmekamper som
                    bortekamper, med målene byttet om: kampene fra NHL-APIet er merket UTA, mens
                    formberegningen fikk den kanoniske forkortelsen ARI, så hjemme/borte-sjekken
                    aldri traff.
                </p>
                {/*
                 * Omfangssetningen står som eget avsnitt med sin egen
                 * lastetilstand. Den ventet før på `portfolio.json` inne i
                 * avsnittet under og dukket opp midt i en ferdig setning når
                 * fila landet; nå sier plassen fra at det kommer noe.
                 */}
                {portefølje.loading ? (
                    <p className={styles.forbeholdTekst}>
                        <Laster />
                    </p>
                ) : vindu === undefined ? (
                    <p className={styles.forbeholdTekst}>
                        Omfanget kunne ikke telles — porteføljen er ikke tilgjengelig.
                    </p>
                ) : (
                    <p className={styles.forbeholdTekst}>
                        {nf(vindu.sammendrag.n)} spill ble lagt inn på det grunnlaget.{' '}
                        {treffSetning(vindu.sammendrag.hits)}, {kr(vindu.sammendrag.profit)} totalt.
                    </p>
                )}
                <p className={styles.forbeholdTekst}>
                    Auditen konkluderte med at rundt {kr(-280)} kan tilskrives feilen, og at resten er
                    varians. Feilen er rettet i live/live_feature_builder.py og låst av en test. Den
                    lå i formberegningen, ikke i Elo — ratingene i tabellen er ikke berørt.
                </p>
            </section>
        </>
    );
}
