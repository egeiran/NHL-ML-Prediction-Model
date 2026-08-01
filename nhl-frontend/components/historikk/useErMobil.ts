'use client';

/**
 * Er vi under brytepunktet (§F, 768px)?
 *
 * Under 768px er tabellen ikke en smalere tabell, den er kort: «Away hos Home»
 * på én linje og `dato · side · odds` under. Den omgrupperingen kan ikke gjøres
 * i CSS uten å enten duplisere 202 rader i DOM-en eller ofre tabellsemantikken,
 * så brytepunktet leses i JS.
 *
 * `useSyncExternalStore` framfor `useEffect`: serversnapshotet er `false`, så
 * statisk HTML og første klientrender er like, og React bytter til
 * klientsnapshotet uten en ekstra kaskade.
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
