'use client';

/**
 * Filtertilstanden ligger i query-parametrene, ikke i `useState`. En filtrert
 * visning er da en delbar lenke, og tilbakeknappen gjør det man tror.
 *
 * Skjema (standardverdier utelates, så den ufiltrerte visningen har ren URL):
 *
 *     ?status=vunnet|tapt          default «alle»
 *     &utfall=hjemme|borte|otso    default «alle»
 *     &sort=ev|netto               default «nyeste»
 *
 * Ukjente verdier faller tilbake til standarden i stedet for å tømme tabellen.
 * Andre parametre i URL-en beholdes urørt.
 *
 * `useSearchParams` krever en `<Suspense>`-grense over seg i Next 15 — den står
 * i `app/historikk/page.tsx`. `router.replace` framfor `push`, fordi et
 * pilletrykk ikke er et nytt sted i historikken.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
    lesSort,
    lesStatus,
    lesUtfall,
    STANDARD_SORT,
    STANDARD_STATUS,
    STANDARD_UTFALL,
    type Sortering,
    type StatusFilter,
    type UtfallFilter,
} from './filter';

const P_STATUS = 'status';
const P_UTFALL = 'utfall';
const P_SORT = 'sort';

export interface HistorikkFilter {
    status: StatusFilter;
    utfall: UtfallFilter;
    sort: Sortering;
    setStatus: (v: StatusFilter) => void;
    setUtfall: (v: UtfallFilter) => void;
    setSort: (v: Sortering) => void;
    /** Tilbake til alle rader. Sorteringen står — den skjuler ingenting. */
    nullstill: () => void;
    /** Sant når minst ett filter skjuler rader. Styrer «Nullstill filtre». */
    erFiltrert: boolean;
}

function settEllerFjern(p: URLSearchParams, nøkkel: string, verdi: string, standard: string): void {
    if (verdi === standard) p.delete(nøkkel);
    else p.set(nøkkel, verdi);
}

export function useHistorikkFilter(): HistorikkFilter {
    const søk = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const status = lesStatus(søk.get(P_STATUS));
    const utfall = lesUtfall(søk.get(P_UTFALL));
    const sort = lesSort(søk.get(P_SORT));

    const skriv = useCallback(
        (neste: { status?: StatusFilter; utfall?: UtfallFilter; sort?: Sortering }) => {
            const p = new URLSearchParams(søk.toString());
            settEllerFjern(p, P_STATUS, neste.status ?? status, STANDARD_STATUS);
            settEllerFjern(p, P_UTFALL, neste.utfall ?? utfall, STANDARD_UTFALL);
            settEllerFjern(p, P_SORT, neste.sort ?? sort, STANDARD_SORT);
            const spørring = p.toString();
            router.replace(spørring ? `${pathname}?${spørring}` : pathname, { scroll: false });
        },
        [søk, status, utfall, sort, router, pathname],
    );

    return useMemo<HistorikkFilter>(
        () => ({
            status,
            utfall,
            sort,
            setStatus: (v) => skriv({ status: v }),
            setUtfall: (v) => skriv({ utfall: v }),
            setSort: (v) => skriv({ sort: v }),
            nullstill: () => skriv({ status: STANDARD_STATUS, utfall: STANDARD_UTFALL }),
            erFiltrert: status !== STANDARD_STATUS || utfall !== STANDARD_UTFALL,
        }),
        [status, utfall, sort, skriv],
    );
}
