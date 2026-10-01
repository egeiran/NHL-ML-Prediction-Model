'use client';

/**
 * Valgt sesong, lagret i `?sesong=` slik at en visning av fjoråret kan deles
 * som lenke. Standardsesongen utelates fra URL-en. Andre parametre — filtrene
 * i Historikk — beholdes urørt.
 *
 * `useSearchParams` krever en `<Suspense>`-grense over seg i Next 15; den står
 * i rutefila til hver skjerm som bruker hooken.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { lesSesong } from '@/lib/sesong';

const P_SESONG = 'sesong';

export function useSesong(
    sesonger: readonly string[],
    standard: string,
): [sesong: string, setSesong: (v: string) => void] {
    const søk = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const sesong = lesSesong(søk.get(P_SESONG), sesonger, standard);

    const setSesong = useCallback(
        (v: string) => {
            const p = new URLSearchParams(søk.toString());
            if (v === standard) p.delete(P_SESONG);
            else p.set(P_SESONG, v);
            const spørring = p.toString();
            router.replace(spørring ? `${pathname}?${spørring}` : pathname, { scroll: false });
        },
        [søk, standard, router, pathname],
    );

    return [sesong, setSesong];
}
