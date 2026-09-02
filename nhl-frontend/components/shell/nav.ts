/**
 * Navigasjonen — én kilde for begge navene.
 *
 * Rekkefølgen er bindende: Oversikt · Verdi i dag · Kampanalyse — skille —
 * Historikk · Elo · Modell · Skyggelogg.
 */

export interface NavRute {
    href: string;
    /** Etikett i toppnaven. */
    tittel: string;
    /** Kort etikett i mobilens bunnbar. */
    kort: string;
    /** Skjermens `<title>`-del og overskrift i lenkelister. */
    skjermtittel: string;
    /** Én linje om hva skjermen viser. Brukes i analyse-lenkelista på Oversikt. */
    beskrivelse: string;
}

export const RUTER = {
    oversikt: {
        href: '/',
        tittel: 'Oversikt',
        kort: 'Oversikt',
        skjermtittel: 'Oversikt',
        beskrivelse: 'Dagens spill, kurven og de siste avgjorte',
    },
    verdi: {
        href: '/verdi',
        tittel: 'Verdi i dag',
        kort: 'Verdi',
        skjermtittel: 'Verdi i dag',
        beskrivelse: 'Value-rapporten for kampprogrammet',
    },
    kamp: {
        href: '/kamp',
        tittel: 'Kampanalyse',
        kort: 'Kamp',
        skjermtittel: 'Kampanalyse',
        beskrivelse: 'Sett to lag mot hverandre',
    },
    historikk: {
        href: '/historikk',
        tittel: 'Historikk',
        kort: 'Logg',
        skjermtittel: 'Historikk',
        beskrivelse: 'Hvert spill som er lagt inn',
    },
    elo: {
        href: '/elo',
        tittel: 'Elo',
        kort: 'Elo',
        skjermtittel: 'Elo',
        beskrivelse: 'Styrkeforholdet modellen ser',
    },
    modell: {
        href: '/modell',
        tittel: 'Modell',
        kort: 'Modell',
        skjermtittel: 'Modell',
        beskrivelse: 'Kalibrering, bøtter og neste steg',
    },
    skygge: {
        href: '/skygge',
        tittel: 'Skyggelogg',
        kort: 'Skygge',
        skjermtittel: 'Skyggelogg',
        beskrivelse: 'Kampene som røk på en terskel',
    },
} as const satisfies Record<string, NavRute>;

/** De sju rutene i navrekkefølge. */
export const NAV_RUTER: readonly NavRute[] = [
    RUTER.oversikt,
    RUTER.verdi,
    RUTER.kamp,
    RUTER.historikk,
    RUTER.elo,
    RUTER.modell,
    RUTER.skygge,
];

/** Skillelinja står etter Kampanalyse, altså etter indeks 2. */
export const NAV_SKILLE_ETTER = 2;

/** Mobilens bunnbar: nøyaktig fire. */
export const BUNNNAV_RUTER: readonly NavRute[] = [
    RUTER.oversikt,
    RUTER.verdi,
    RUTER.kamp,
    RUTER.historikk,
];

/** Analysevisningene som ikke får plass i bunnbaren — lenkes fra Oversikt. */
export const ANALYSE_RUTER: readonly NavRute[] = [RUTER.elo, RUTER.modell, RUTER.skygge];

/** Aktiv rute: eksakt treff på `/`, prefikstreff ellers. */
export function erAktiv(pathname: string, href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
}
