/**
 * Utah-vinduet (§C.7, høyre kolonne nederst).
 *
 * Tallene telles fra historikken; ordlyden er gjengitt fra `PROBLEMS.md` og
 * skal ikke pyntes. Poenget med panelet er at det står *sammen med*
 * skyggeloggen: fem av de fjorten spillene i vinduet var OT/SO-spill, så en del
 * av skyggetapet ligger her.
 */

import { dl, kr, MANGLER, nf } from '@/lib/format';
import { UTAH_VINDU_TIL, type UtahVindu as UtahVinduTall } from '@/lib/utah';
import styles from './Skygge.module.css';

export interface UtahVinduProps {
    tall: UtahVinduTall;
}

export function UtahVindu({ tall }: UtahVinduProps) {
    const { sammendrag, otso, otsoNetto } = tall;
    const harRader = sammendrag.n > 0;

    return (
        <div>
            <span className="t-kicker">Utah-vinduet</span>
            <div className={styles.utahPanel}>
                <div className={styles.utahStats}>
                    <div>
                        <span className="t-stat-label">Spill</span>
                        <span className={`${styles.utahFigur} c-ink`}>
                            {harRader ? nf(sammendrag.n) : MANGLER}
                        </span>
                    </div>
                    <div>
                        <span className="t-stat-label">Treff</span>
                        <span className={`${styles.utahFigur} c-ink`}>
                            {harRader ? nf(sammendrag.hits) : MANGLER}
                        </span>
                    </div>
                    <div>
                        <span className="t-stat-label">Netto</span>
                        {/* Fortegnet fargelegger, som alle andre nettotall i appen.
                            Verdien er negativ i dag; den skal ikke være rød av vane.
                            Uten rader er `profit` 0, og et grønt `—` ville vært en
                            påstand om noe vi ikke har tall for. Da står `—` i samme
                            farge som de to andre cellene i panelet. */}
                        <span
                            className={`${styles.utahFigur} ${
                                !harRader ? 'c-ink' : sammendrag.profit >= 0 ? 'c-teal' : 'c-vermillion'
                            }`}
                        >
                            {harRader ? kr(sammendrag.profit) : MANGLER}
                        </span>
                    </div>
                </div>
                <p className={styles.utahNote}>
                    Utah-formen ble bygget på feil lagforkortelse til og med {dl(UTAH_VINDU_TIL)}:
                    hjemmekampene ble lest som bortekamper, med mål for og mot byttet om. En audit
                    med {nf(2304)} parvise scenarier anslår at cirka {kr(-280)} — omtrent en fjerdedel —
                    kan tilskrives feilen i øvre ende; resten er varians. Avregnes de {nf(sammendrag.n)}{' '}
                    spillene med treffraten resten av porteføljen faktisk hadde per utfallstype,
                    ender de på {kr(-6)}. Radene står urørt i historikken: den er en logg over
                    beslutninger som ble tatt, ikke over hva modellen burde ha gjort.
                </p>
                {otso > 0 ? (
                    <p className={styles.utahNote}>
                        {nf(otso)} av spillene i vinduet var OT/SO-spill ({kr(otsoNetto)}), og ligger
                        derfor også i skyggeloggen. Auditen tilskriver aliasfeilen {kr(-98)} av dem —
                        støy fra feilen løftet kryssingsraten mot en terskel som uansett lå langt ute
                        i halen.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
