'use client';

/**
 * Innstillinger og terskler.
 *
 * EV-terskelen er én verdi for hele appen. DECISIONS er tydelig på at drift
 * mellom skjermer er en bug, derfor ligger den i en React-context og leses via
 * `useEvTerskel()` — aldri som lokal state i en skjerm.
 *
 * Presedens:
 *   1. Brukerens lagrede verdi i `localStorage` (slider 5–45 %, steg 1)
 *   2. `meta.json:value_min` — pipelinens terskel (`NHL_VALUE_MIN`, i dag 0,15)
 *   3. `EV_TERSKEL_FALLBACK` (0,15) hvis meta ikke er lastet
 *
 * Fila er en `.ts`, ikke `.tsx`, så provideren bygges med `createElement`.
 * Det er én linje, og til gjengjeld ligger konfigurasjonen der DECISIONS sier.
 */

import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useMemo,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { useMeta } from '@/lib/use-data';

/* -------------------------------------------------------------------------- */
/* EV-terskel                                                                  */
/* -------------------------------------------------------------------------- */

/** Slideren går 5–45 % med steg 1. Verdiene lagres som brøk. */
export const EV_TERSKEL_MIN = 0.05;
export const EV_TERSKEL_MAKS = 0.45;
export const EV_TERSKEL_STEG = 0.01;

/** Brukes bare før `meta.json` er lastet. Samme tall som pipelinens default. */
export const EV_TERSKEL_FALLBACK = 0.15;

export const EV_TERSKEL_LAGRINGSNØKKEL = 'blalinja.evTerskel';

/** Runder til nærmeste hele prosentpoeng og klemmer inn i [5 %, 45 %]. */
export function normaliserEvTerskel(verdi: number): number {
    if (!Number.isFinite(verdi)) return EV_TERSKEL_FALLBACK;
    const prosent = Math.round(verdi * 100);
    const klemt = Math.min(Math.max(prosent, EV_TERSKEL_MIN * 100), EV_TERSKEL_MAKS * 100);
    return klemt / 100;
}

/**
 * Sier om brukerens terskel avviker fra pipelinens. Når den gjør det, viser
 * siten noe annet enn `bet_history.csv`, og UI skal si fra.
 */
export function avvikerFraPipeline(bruker: number, pipeline: number): boolean {
    return Math.abs(bruker - pipeline) > 1e-9;
}

export interface EvTerskelKontekst {
    /** Aktiv terskel som brøk, f.eks. 0,15. */
    evTerskel: number;
    /** Setter og persisterer. Verdien normaliseres. */
    setEvTerskel: (verdi: number) => void;
    /** Pipelinens terskel (`meta.json:value_min`), eller fallback. */
    pipelineTerskel: number;
    /** `true` når brukerens terskel ikke er pipelinens. */
    avviker: boolean;
    /** Tilbake til pipelinens terskel, og glem den lagrede verdien. */
    tilbakestill: () => void;
}

/*
 * Det fantes en `klar: boolean` her — «localStorage er lest» — men ingen skjerm
 * leste den, så den var en løs tråd som så ut som en garanti. Serversnapshotet
 * er `null`, altså pipelinens terskel, og den er riktig for de aller fleste
 * brukerne; en bruker med lagret avvik ser ett kort blink. Trengs et flagg for
 * å utsette rendringen, legges det tilbake sammen med kallstedet som bruker det.
 */

const Kontekst = createContext<EvTerskelKontekst | null>(null);

function lesLagret(): number | null {
    if (typeof window === 'undefined') return null;
    try {
        const rå = window.localStorage.getItem(EV_TERSKEL_LAGRINGSNØKKEL);
        if (rå === null) return null;
        const tall = Number.parseFloat(rå);
        return Number.isFinite(tall) ? normaliserEvTerskel(tall) : null;
    } catch {
        // Privat modus / blokkerte cookies. Da kjører vi bare uten persistering.
        return null;
    }
}

function skrivLagret(verdi: number | null): void {
    if (typeof window === 'undefined') return;
    try {
        if (verdi === null) window.localStorage.removeItem(EV_TERSKEL_LAGRINGSNØKKEL);
        else window.localStorage.setItem(EV_TERSKEL_LAGRINGSNØKKEL, String(verdi));
    } catch {
        /* ignorer — persistering er en bekvemmelighet, ikke et krav */
    }
}

/* -------------------------------------------------------------------------- */
/* localStorage som ekstern kilde                                              */
/*                                                                             */
/* `useSyncExternalStore` framfor `useEffect` + `setState`: server-snapshotet   */
/* er `null`, så server-HTML og hydrering er identiske, og React bytter til     */
/* klient-snapshotet uten en kaskaderende ekstra render. `storage`-hendelsen    */
/* gir samtidig synk mellom faner gratis.                                      */
/* -------------------------------------------------------------------------- */

let bufret: number | null | undefined;
const lyttere = new Set<() => void>();

function abonner(varsle: () => void): () => void {
    lyttere.add(varsle);
    const påStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === EV_TERSKEL_LAGRINGSNØKKEL) {
            bufret = undefined;
            for (const l of lyttere) l();
        }
    };
    window.addEventListener('storage', påStorage);
    return () => {
        lyttere.delete(varsle);
        window.removeEventListener('storage', påStorage);
    };
}

function klientSnapshot(): number | null {
    if (bufret === undefined) bufret = lesLagret();
    return bufret;
}

function serverSnapshot(): number | null {
    return null;
}

function settLagret(verdi: number | null): void {
    bufret = verdi;
    skrivLagret(verdi);
    for (const l of lyttere) l();
}

export function EvTerskelProvider({ children }: { children: ReactNode }): ReactNode {
    const meta = useMeta();
    // `null` = brukeren har ikke valgt noe; da følger vi pipelinen.
    const valgt = useSyncExternalStore(abonner, klientSnapshot, serverSnapshot);

    const pipelineTerskel = useMemo(() => {
        const fraMeta = meta.data?.value_min;
        return typeof fraMeta === 'number' && Number.isFinite(fraMeta)
            ? normaliserEvTerskel(fraMeta)
            : EV_TERSKEL_FALLBACK;
    }, [meta.data]);

    const evTerskel = valgt ?? pipelineTerskel;

    const setEvTerskel = useCallback((verdi: number) => {
        settLagret(normaliserEvTerskel(verdi));
    }, []);

    const tilbakestill = useCallback(() => {
        settLagret(null);
    }, []);

    const verdi = useMemo<EvTerskelKontekst>(
        () => ({
            evTerskel,
            setEvTerskel,
            pipelineTerskel,
            avviker: avvikerFraPipeline(evTerskel, pipelineTerskel),
            tilbakestill,
        }),
        [evTerskel, setEvTerskel, pipelineTerskel, tilbakestill],
    );

    return createElement(Kontekst.Provider, { value: verdi }, children);
}

/** Leser den delte EV-terskelen. Må kalles under `<EvTerskelProvider>`. */
export function useEvTerskel(): EvTerskelKontekst {
    const kontekst = useContext(Kontekst);
    if (kontekst === null) {
        throw new Error('useEvTerskel må brukes inne i <EvTerskelProvider> (settes i app/layout.tsx)');
    }
    return kontekst;
}

/* -------------------------------------------------------------------------- */
/* Undertrykkingsterskler — env, ikke UI                                       */
/* -------------------------------------------------------------------------- */

function envTall(rå: string | undefined, fallback: number): number {
    if (rå === undefined || rå === '') return fallback;
    const tall = Number.parseFloat(rå);
    return Number.isFinite(tall) ? tall : fallback;
}

/**
 * `+35 kr siden start` vises kun når `|profit| >= TALL_TERSKEL`.
 * `NEXT_PUBLIC_TALL_TERSKEL`, default 1000 (kr).
 */
export const TALL_TERSKEL = envTall(process.env.NEXT_PUBLIC_TALL_TERSKEL, 1000);

/**
 * ROI-figuren vises kun når `|roi * 100| >= ROI_TERSKEL`.
 * `NEXT_PUBLIC_ROI_TERSKEL`, default 5 (prosentpoeng).
 */
export const ROI_TERSKEL = envTall(process.env.NEXT_PUBLIC_ROI_TERSKEL, 5);

/** Alle spill i historikken er 100 kr. Står i noten på Historikk. */
export const FLAT_INNSATS = 100;
