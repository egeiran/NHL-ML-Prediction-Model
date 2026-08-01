'use client';

/**
 * Elo (§C.5) — hele skjermen.
 *
 * Tabellen til venstre er ligaen rangert etter Elo; parameterpanelet til høyre
 * viser hva ratingene faktisk er regnet med, og hvilket datavindu de hviler på.
 *
 * `elo.json` skrives med visningsforkortelser (`display_keys: true`): Utah står
 * under `UTA`, `ARI` finnes ikke, og historiske lag er allerede filtrert bort i
 * eksport-steget. Det er derfor ingen aliaslogikk her, og skal ikke komme noen
 * heller (DECISIONS punkt 5). Utah-forbeholdet i panelet handler om noe annet:
 * perioden da formberegningen leste laget speilvendt.
 */

import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, Laster, PillGroup, SectionHeading } from '@/components/ui';
import { dISO } from '@/lib/format';
import { konferanse, kollator, lagNavn, type Konferanse } from '@/lib/teams';
import { useElo } from '@/lib/use-data';
import { EloTabell, type EloRad } from './EloTabell';
import { Parametere } from './Parametere';
import styles from './Elo.module.css';

type Filter = 'alle' | 'øst' | 'vest';

const FILTRE: readonly { value: Filter; label: string }[] = [
    { value: 'alle', label: 'Alle' },
    { value: 'øst', label: 'Øst' },
    { value: 'vest', label: 'Vest' },
];

const KONFERANSE_FOR_FILTER: Readonly<Record<Filter, Konferanse | null>> = {
    alle: null,
    øst: 'Øst',
    vest: 'Vest',
};

/**
 * `ratings` er allerede sortert synkende av eksport-steget. Vi sorterer likevel
 * her — rangkolonnen skal ikke kunne lyve hvis filen en dag skrives i en annen
 * rekkefølge. Lik rating brytes på lagnavn med norsk kollasjon.
 */
function tilRader(ratings: Record<string, number>): EloRad[] {
    return Object.entries(ratings)
        .sort(([aAbbr, aRating], [bAbbr, bRating]) =>
            bRating - aRating || kollator.compare(lagNavn(aAbbr), lagNavn(bAbbr)),
        )
        .map(([abbr, rating], i) => ({
            abbr,
            rating,
            rang: i + 1,
            konferanse: konferanse(abbr),
        }));
}

export function EloSkjerm() {
    const elo = useElo();
    const [filter, setFilter] = useState<Filter>('alle');

    const rader = useMemo(() => (elo.data ? tilRader(elo.data.ratings) : []), [elo.data]);

    const synlige = useMemo(() => {
        const ønsket = KONFERANSE_FOR_FILTER[filter];
        return ønsket === null ? rader : rader.filter((r) => r.konferanse === ønsket);
    }, [rader, filter]);

    const through = elo.data?.meta.through;
    const kicker = through ? `Elo · t.o.m. ${dISO(through)}` : 'Elo';

    return (
        <main>
            <SectionHeading
                kicker={kicker}
                title="Styrkeforholdet modellen ser"
                right={
                    <PillGroup
                        label="Konferanse"
                        size="lg"
                        value={filter}
                        options={FILTRE}
                        onChange={setFilter}
                    />
                }
            />

            {elo.error ? (
                <ErrorState error={elo.error} onRetry={elo.retry} />
            ) : elo.loading || !elo.data ? (
                <Laster className={styles.laster} />
            ) : (
                <section className={styles.oppsett}>
                    <div className={styles.venstre}>
                        {synlige.length === 0 ? (
                            <div className={styles.tabellTom}>
                                <EmptyState size="md" headline="Ingen lag i denne konferansen" />
                            </div>
                        ) : (
                            <EloTabell rader={synlige} midtpunkt={elo.data.config.base_rating} />
                        )}
                    </div>
                    <div className={styles.hoyre}>
                        <Parametere config={elo.data.config} meta={elo.data.meta} />
                    </div>
                </section>
            )}
        </main>
    );
}
