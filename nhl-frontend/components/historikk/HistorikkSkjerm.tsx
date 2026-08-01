'use client';

/**
 * Historikk (§C.4) — hver beslutning som faktisk ble tatt, 202 rader.
 *
 * Nøkkeltallene i hodet regnes av det **filtrerte** utvalget, ikke av totalen.
 * Står det «Utvalg 26 · Treffrate 33,7 %» samtidig, lyver treffraten.
 *
 * Filtertilstanden bor i query-parametrene (`useHistorikkFilter`), så en
 * filtrert visning kan deles som lenke. Filtrering og sortering er memoisert;
 * 202 rader sorteres ikke på nytt fordi en hover endret noe annet.
 */

import { useMemo } from 'react';
import { Button, EmptyState, ErrorState, Laster, PillGroup, SectionHeading } from '@/components/ui';
import { FLAT_INNSATS } from '@/lib/config';
import { MANGLER, kr, krp, nf, pc } from '@/lib/format';
import { usePortfolio } from '@/lib/use-data';
import type { BetEntry } from '@/types';
import {
    SORT_VALG,
    STATUS_VALG,
    UTFALL_VALG,
    filtrer,
    fortegn,
    nøkkeltall,
    sorter,
} from './filter';
import { MobilKort } from './MobilKort';
import { Tabell } from './Tabell';
import { useErMobil } from './useErMobil';
import { useHistorikkFilter } from './useHistorikkFilter';
import styles from './Historikk.module.css';

/** Stabil referanse — ellers ville memoiseringene brytes hver render mens data laster. */
const INGEN: readonly BetEntry[] = [];

const FARGE = {
    positiv: 'c-teal',
    negativ: 'c-vermillion',
    null: 'c-ink',
} as const;

function Nøkkeltall({ etikett, verdi, farge }: { etikett: string; verdi: string; farge?: string }) {
    return (
        <div className={styles.nokkel}>
            <span className="t-stat-label">{etikett}</span>
            <span className={`t-stat-figure-lg ${styles.nokkelVerdi}${farge ? ` ${farge}` : ''}`}>
                {verdi}
            </span>
        </div>
    );
}

export function HistorikkSkjerm() {
    const portefølje = usePortfolio();
    const filter = useHistorikkFilter();
    const erMobil = useErMobil();

    const alle = portefølje.data?.bets ?? INGEN;

    const filtrerte = useMemo(
        () => filtrer(alle, filter.status, filter.utfall),
        [alle, filter.status, filter.utfall],
    );
    const rader = useMemo(() => sorter(filtrerte, filter.sort), [filtrerte, filter.sort]);
    const tall = useMemo(() => nøkkeltall(filtrerte), [filtrerte]);

    const harData = portefølje.data !== null;
    const visTall = harData && !portefølje.error;

    return (
        <>
            <SectionHeading
                kicker="Beslutningslogg"
                title="Hvert spill som er lagt inn"
                right={
                    visTall ? (
                        <div className={styles.nokkeltall}>
                            <Nøkkeltall etikett="Utvalg" verdi={nf(tall.utvalg)} />
                            <Nøkkeltall
                                etikett="Treffrate"
                                verdi={tall.treffrate === null ? MANGLER : pc(tall.treffrate)}
                            />
                            <Nøkkeltall
                                etikett="Netto"
                                verdi={tall.avregnede > 0 ? kr(tall.netto) : MANGLER}
                                farge={FARGE[fortegn(tall.avregnede > 0 ? tall.netto : 0)]}
                            />
                        </div>
                    ) : null
                }
            />

            {portefølje.error ? (
                <ErrorState
                    error={portefølje.error}
                    onRetry={portefølje.retry}
                    className={styles.tilstand}
                />
            ) : portefølje.loading ? (
                <div className={styles.tilstand}>
                    <Laster />
                </div>
            ) : (
                <>
                    <section className={styles.filtre}>
                        <PillGroup
                            label="Status"
                            size="md"
                            options={STATUS_VALG}
                            value={filter.status}
                            onChange={filter.setStatus}
                        />
                        <PillGroup
                            label="Utfall"
                            size="md"
                            options={UTFALL_VALG}
                            value={filter.utfall}
                            onChange={filter.setUtfall}
                        />
                        <PillGroup
                            label="Sortering"
                            size="md"
                            options={SORT_VALG}
                            value={filter.sort}
                            onChange={filter.setSort}
                        />
                        <p className={styles.note}>{`Alle spill ${krp(FLAT_INNSATS)}`}</p>
                    </section>

                    {tall.åpne > 0 ? (
                        <p className={styles.apneNote}>
                            {`${nf(tall.åpne)} åpne spill i utvalget. De teller verken i treffraten eller i nettoen.`}
                        </p>
                    ) : null}

                    <section aria-label="Spillhistorikk">
                        {rader.length === 0 ? (
                            <EmptyState
                                size="md"
                                headline="Ingen spill matcher filteret"
                                body="Løsne på ett av filtrene."
                                actions={
                                    filter.erFiltrert ? (
                                        <Button variant="secondary" onClick={filter.nullstill}>
                                            Nullstill filtre
                                        </Button>
                                    ) : null
                                }
                            />
                        ) : erMobil ? (
                            <MobilKort rader={rader} />
                        ) : (
                            <Tabell rader={rader} />
                        )}
                    </section>
                </>
            )}
        </>
    );
}
