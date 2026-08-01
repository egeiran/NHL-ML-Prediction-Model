'use client';

/**
 * Kampanalyse (§C.3) — prising av en hvilken som helst lagparing for hånd.
 *
 * Tilstanden er fem strenger: to forkortelser og tre rå oddsfelt. Oddsen holdes
 * som tekst, ikke tall, fordi et halvskrevet felt («2,», «») ellers ville blitt
 * til `NaN` og tvunget markøren ut av feltet. Tolkningen skjer i `beregn.ts`.
 *
 * `useSearchParams` gjør paringen delbar som lenke. Den krever en
 * `<Suspense>`-grense i Next 15 — den står i `app/kamp/page.tsx`.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { ErrorState, Laster } from '@/components/ui';
import { useEvTerskel } from '@/lib/config';
import { ALLE_LAG, LAG, sorterAbbr } from '@/lib/teams';
import { kombiner, useElo, useMatchups, useTeams } from '@/lib/use-data';
import { byggAnalyse, type Valg } from './beregn';
import { Analyse } from './Analyse';
import { Skjema, type LagFelt, type OddsFelt } from './Skjema';
import { fraQuery, tilQuery } from './url';
import styles from './Kamp.module.css';

const SPLITT: CSSProperties = {
    '--split-cols': 'minmax(300px,.8fr) minmax(0,1.6fr)',
    '--split-gutter': '44px',
} as CSSProperties;

export function KampSkjerm() {
    const søk = useSearchParams();
    const teams = useTeams();
    const matchups = useMatchups();
    const elo = useElo();
    const { loading, error, retry } = kombiner(teams, matchups, elo);
    const { evTerskel } = useEvTerskel();

    // Query-parametrene leses én gang, som starttilstand. Etterpå eier skjemaet
    // tilstanden og skriver URL-en, ikke omvendt.
    const [valg, setValg] = useState<Valg>(() => fraQuery(søk));

    useEffect(() => {
        const ny = `${window.location.pathname}?${tilQuery(valg)}`;
        if (`${window.location.pathname}${window.location.search}` !== ny) {
            window.history.replaceState(window.history.state, '', ny);
        }
    }, [valg]);

    const settLag = useCallback((felt: LagFelt, abbr: string) => {
        setValg((v) => (v[felt] === abbr ? v : { ...v, [felt]: abbr }));
    }, []);

    const settOdds = useCallback((felt: OddsFelt, verdi: string) => {
        setValg((v) => ({ ...v, [felt]: verdi }));
    }, []);

    const bytt = useCallback(() => {
        setValg((v) => ({ ...v, home: v.away, away: v.home, oh: v.oa, oa: v.oh }));
    }, []);

    /**
     * Lagene i nedtrekkene kommer fra `teams.json`, sortert med norsk
     * kollasjon. Faller tilbake på de 32 i `lib/teams` mens fila laster, slik at
     * velgerne aldri står tomme.
     */
    const lagListe = useMemo(() => {
        const fraFil = teams.data?.map((t) => t.abbreviation).filter((a) => LAG[a]) ?? [];
        const kilde = fraFil.length > 0 ? fraFil : ALLE_LAG.map((l) => l.abbr);
        return sorterAbbr(Array.from(new Set(kilde)));
    }, [teams.data]);

    const analyse = useMemo(
        () => byggAnalyse(matchups.data, elo.data, valg, evTerskel),
        [matchups.data, elo.data, valg, evTerskel],
    );

    if (error) {
        return (
            <div className={styles.feil}>
                <ErrorState error={error} onRetry={retry} />
            </div>
        );
    }

    return (
        <section className={`split ${styles.oppsett}`} style={SPLITT}>
            <div className={styles.venstre}>
                <Skjema
                    lag={lagListe}
                    valg={valg}
                    onLag={settLag}
                    onOdds={settOdds}
                    onBytt={bytt}
                    deaktivert={loading}
                />
            </div>
            <div className={styles.hoyre}>
                {loading ? <Laster /> : <Analyse analyse={analyse} evTerskel={evTerskel} />}
            </div>
        </section>
    );
}
