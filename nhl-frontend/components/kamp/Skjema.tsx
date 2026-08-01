'use client';

/**
 * Venstrekolonnen i §C.3: to lagvelgere, bytteknappen og de tre oddsfeltene.
 *
 * Ingen submit — hver `change` går rett i tilstanden, og høyrekolonnen regnes om.
 * Derfor er det heller ingen `<form>`: det finnes ikke noe å sende, og en
 * `<form>` uten handling inviterer bare Enter-tasten til å laste siden på nytt.
 *
 * Hver kontroll har en ekte `<label htmlFor>`. Oddsradene har etiketten til
 * venstre og feltet til høyre, så innpakning ville brutt oppsettet.
 *
 * Oddsfeltene er `type="text" inputMode="decimal"`, ikke `type="number"`. En
 * `number`-input gir tom streng fra `.value` når innholdet ikke er en gyldig
 * flyttallsstreng, så «2,4» ble enten spist eller tømte feltet — avhengig av
 * nettleser og locale — og komma-støtten i `tolkOdds` var uvirksom. `min`/`step`
 * gjorde heller ingenting: det finnes ingen `<form>` og ingen validering som
 * leser dem, så tilstanden «odds ≤ 1 → EV −100 %» som `beregn.ts` implementerer
 * var uoppnåelig fra tastaturet. Nå er `tolkOdds` eneste kilde til sannhet, og
 * det som sto i `min` står som hjelpetekst via `aria-describedby`.
 */

import { pc } from '@/lib/format';
import { lagEtikett } from '@/lib/teams';
import type { Valg } from './beregn';
import styles from './Kamp.module.css';

export type LagFelt = 'home' | 'away';
export type OddsFelt = 'oh' | 'od' | 'oa';

/** Én hjelpetekst for alle tre feltene — de har samme regler. */
const ODDS_HJELP_ID = 'kamp-odds-hjelp';

export interface SkjemaProps {
    /** Forkortelsene som skal ligge i nedtrekkene, ferdig sortert. */
    lag: readonly string[];
    valg: Valg;
    onLag: (felt: LagFelt, abbr: string) => void;
    onOdds: (felt: OddsFelt, verdi: string) => void;
    onBytt: () => void;
    /** Sant mens data lastes — kontrollene vises, men er ikke i bruk (§C.3). */
    deaktivert?: boolean;
}

const ODDS_RADER: readonly { felt: OddsFelt; etikett: string }[] = [
    { felt: 'oh', etikett: 'Hjemmeseier' },
    { felt: 'od', etikett: 'OT/SO' },
    { felt: 'oa', etikett: 'Borteseier' },
];

function Lagvelger({
    id,
    etikett,
    verdi,
    lag,
    deaktivert,
    onEndre,
}: {
    id: string;
    etikett: string;
    verdi: string;
    lag: readonly string[];
    deaktivert: boolean;
    onEndre: (abbr: string) => void;
}) {
    return (
        <div>
            <label className={`t-panel-heading ${styles.feltEtikett}`} htmlFor={id}>
                {etikett}
            </label>
            <select
                id={id}
                className={styles.velger}
                value={verdi}
                disabled={deaktivert}
                onChange={(e) => onEndre(e.target.value)}
            >
                {lag.map((abbr) => (
                    <option key={abbr} value={abbr}>
                        {lagEtikett(abbr)}
                    </option>
                ))}
            </select>
        </div>
    );
}

export function Skjema({ lag, valg, onLag, onOdds, onBytt, deaktivert = false }: SkjemaProps) {
    return (
        <>
            <div className={styles.felter}>
                <Lagvelger
                    id="kamp-hjemmelag"
                    etikett="Hjemmelag"
                    verdi={valg.home}
                    lag={lag}
                    deaktivert={deaktivert}
                    onEndre={(abbr) => onLag('home', abbr)}
                />
                <button
                    type="button"
                    className={styles.bytt}
                    onClick={onBytt}
                    disabled={deaktivert}
                    aria-label="Bytt hjemmelag og bortelag"
                >
                    <span aria-hidden="true">⇅</span> Bytt
                </button>
                <Lagvelger
                    id="kamp-bortelag"
                    etikett="Bortelag"
                    verdi={valg.away}
                    lag={lag}
                    deaktivert={deaktivert}
                    onEndre={(abbr) => onLag('away', abbr)}
                />
            </div>

            <div className={styles.oddsBolk}>
                <h2 className={`t-panel-heading ${styles.oddsHode}`}>Odds fra bookmaker</h2>
                <div className={styles.oddsRader}>
                    {ODDS_RADER.map((rad) => (
                        <div key={rad.felt} className={styles.oddsRad}>
                            <label className={styles.oddsEtikett} htmlFor={`kamp-odds-${rad.felt}`}>
                                {rad.etikett}
                            </label>
                            <input
                                id={`kamp-odds-${rad.felt}`}
                                className={styles.oddsFelt}
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                aria-describedby={ODDS_HJELP_ID}
                                value={valg[rad.felt]}
                                disabled={deaktivert}
                                onChange={(e) => onOdds(rad.felt, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
                <p id={ODDS_HJELP_ID} className={styles.oddsHjelp}>
                    {`Desimalodds. Både komma og punktum virker som desimalskille. Odds på 1 eller lavere gir EV ${pc(-1, 0)}.`}
                </p>
            </div>
        </>
    );
}
