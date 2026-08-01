'use client';

/**
 * Er vi under skjermens ene brytepunkt (§F, 768px)?
 *
 * Verdi i dag er den ene skjermen der mobil ikke bare er en annen layout, men
 * en annen navigasjon: lista blir tappbar og fører til en detaljvisning per
 * kamp. Den forskjellen kan ikke uttrykkes i CSS alene, så brytepunktet må
 * leses i JS her — resten av skjermen bruker vanlige media queries.
 *
 * `useSyncExternalStore` framfor `useEffect`: serversnapshotet er `false`, så
 * server-HTML og første klientrender er identiske, og React bytter til
 * klientsnapshotet uten en ekstra kaskaderende render.
 */

import { useSyncExternalStore } from 'react';

const SPØRRING = '(max-width: 767px)';

function abonner(varsle: () => void): () => void {
    const liste = window.matchMedia(SPØRRING);
    liste.addEventListener('change', varsle);
    return () => liste.removeEventListener('change', varsle);
}

function klientSnapshot(): boolean {
    return window.matchMedia(SPØRRING).matches;
}

function serverSnapshot(): boolean {
    return false;
}

export function useErMobil(): boolean {
    return useSyncExternalStore(abonner, klientSnapshot, serverSnapshot);
}
