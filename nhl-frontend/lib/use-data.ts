'use client';

/**
 * Delt datahook. Én per datasett, alle med samme form:
 *
 *     const { data, loading, error, retry } = usePortfolio();
 *
 * Ingen skjerm skal skrive sin egen `useEffect` mot `public/data/`. Lasterne i
 * `lib/data.ts` memoiserer promiset, så sju skjermer som alle spør etter
 * `portfolio.json` deler ett nettverkskall. `retry()` invaliderer cachen for
 * nøyaktig det datasettet og henter på nytt.
 *
 * `error` er en `DataFeil` med `.fil` — send den rett til `<ErrorState />`.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    DataFeil,
    fetchElo,
    fetchMatchups,
    fetchMeta,
    fetchPortfolio,
    fetchShadow,
    fetchTeams,
    fetchValueReport,
    invalider,
    type DataNøkkel,
    DATA_FILER,
} from '@/lib/data';
import type {
    EloData,
    MatchupsData,
    PortfolioResponse,
    ShadowEntry,
    SiteMeta,
    Team,
    ValueGame,
} from '@/types';

export interface DataState<T> {
    /** `null` til lastingen er ferdig, og ved feil. */
    data: T | null;
    loading: boolean;
    error: DataFeil | null;
    /** Invaliderer cachen og henter på nytt. Stabil referanse. */
    retry: () => void;
}

function tilDataFeil(nøkkel: DataNøkkel, err: unknown): DataFeil {
    if (err instanceof DataFeil) return err;
    const melding = err instanceof Error ? err.message : 'Ukjent feil';
    return new DataFeil(DATA_FILER[nøkkel], melding);
}

function useDatasett<T>(nøkkel: DataNøkkel, last: () => Promise<T>): DataState<T> {
    const [runde, setRunde] = useState(0);
    const [tilstand, setTilstand] = useState<Omit<DataState<T>, 'retry'>>({
        data: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        let aktiv = true;
        last().then(
            (data) => {
                if (aktiv) setTilstand({ data, loading: false, error: null });
            },
            (err: unknown) => {
                if (aktiv) setTilstand({ data: null, loading: false, error: tilDataFeil(nøkkel, err) });
            },
        );
        return () => {
            aktiv = false;
        };
    }, [nøkkel, last, runde]);

    // Tilbake til lastende gjøres her, i hendelsen — ikke i effekten. Effekten
    // rører bare state fra promise-callbackene.
    const retry = useCallback(() => {
        invalider(nøkkel);
        setTilstand({ data: null, loading: true, error: null });
        setRunde((r) => r + 1);
    }, [nøkkel]);

    return { ...tilstand, retry };
}

/* -------------------------------------------------------------------------- */
/* Ett hook per datasett                                                       */
/* -------------------------------------------------------------------------- */

export function useTeams(): DataState<Team[]> {
    return useDatasett('teams', fetchTeams);
}

export function useMeta(): DataState<SiteMeta> {
    return useDatasett('meta', fetchMeta);
}

export function useValueReport(): DataState<ValueGame[]> {
    return useDatasett('valueReport', fetchValueReport);
}

export function usePortfolio(): DataState<PortfolioResponse> {
    return useDatasett('portfolio', fetchPortfolio);
}

export function useMatchups(): DataState<MatchupsData> {
    return useDatasett('matchups', fetchMatchups);
}

export function useElo(): DataState<EloData> {
    return useDatasett('elo', fetchElo);
}

export function useShadow(): DataState<ShadowEntry[]> {
    return useDatasett('shadow', fetchShadow);
}

/* -------------------------------------------------------------------------- */
/* Kombinasjon                                                                 */
/* -------------------------------------------------------------------------- */

export interface KombinertTilstand {
    /** Sant så lenge minst ett datasett laster. */
    loading: boolean;
    /** Første feil i argumentrekkefølge, ellers `null`. */
    error: DataFeil | null;
    /** Prøver alle de kombinerte datasettene på nytt. */
    retry: () => void;
}

/**
 * Slår sammen flere datasett til én laste-/feiltilstand:
 *
 *     const portfolio = usePortfolio();
 *     const elo = useElo();
 *     const { loading, error, retry } = kombiner(portfolio, elo);
 *
 * Ren funksjon, ikke et hook — kall den hvor som helst i render.
 */
export function kombiner(...tilstander: readonly DataState<unknown>[]): KombinertTilstand {
    return {
        loading: tilstander.some((t) => t.loading),
        error: tilstander.find((t) => t.error !== null)?.error ?? null,
        retry: () => {
            for (const t of tilstander) t.retry();
        },
    };
}
