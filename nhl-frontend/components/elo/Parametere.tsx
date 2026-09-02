/**
 * Parameterpanelet på Elo-skjermen (§C.5).
 *
 * De seks parameterne kommer fra `elo.json:config` — ingenting er hardkodet,
 * så panelet følger pipelinen når den endres. Under står datagrunnlaget
 * (`meta.n_games`, `meta.through`).
 *
 * Panelet sto en periode med et forbehold om Utah-vinduet: perioden da
 * formberegningen leste laget speilvendt. Feilen er rettet og låst av en test,
 * den lå i formberegningen og ikke i Elo, og ratingene i tabellen var aldri
 * berørt — så notatet forklarte noe skjermen ikke viser. Det er tatt ut, og
 * står fortsatt i `PROBLEMS.md`, som er stedet for den slags. Med det forsvant
 * også skjermens eneste grunn til å laste `portfolio.json` (130 KB).
 */

import { dl, nf, sgnRaw } from '@/lib/format';
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

export interface ParametereProps {
    config: EloConfig;
    meta: EloMeta;
}

export function Parametere({ config, meta }: ParametereProps) {
    return (
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
    );
}
