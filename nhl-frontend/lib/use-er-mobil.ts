'use client';

/**
 * Er vi under skjermens ene brytepunkt (§F, 768px)?
 *
 * De fleste responsive forskjellene i designet er ren layout og hører hjemme i
 * CSS. To av dem er ikke det, og begge trenger brytepunktet i JS:
 *
 * - Verdi i dag bytter navigasjon på mobil, ikke bare layout: lista blir
 *   tappbar og fører til en detaljvisning per kamp.
 * - Historikk bytter fra tabell til kort, med «Away hos Home» på én linje og
 *   `dato · side · odds` under. Å gjøre den omgrupperingen i CSS ville krevd
 *   enten 202 dupliserte rader i DOM-en eller at tabellsemantikken ofres.
 *
 * `useSyncExternalStore` framfor `useEffect`: serversnapshotet er `false`, så
 * statisk HTML og første klientrender er like, og React bytter til
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
