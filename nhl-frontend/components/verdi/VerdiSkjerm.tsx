'use client';

/**
 * Verdi i dag (§C.2) — dagens kamper med modellens pris mot markedets.
 *
 * Tre tilstander som alle er ekte:
 *   · tom      — `value-report.json` er `[]`. Hovedtilstanden mesteparten av året.
 *   · populert — filterrad + én rad per kamp. Value er et FILTER, ikke en port,
 *                derfor står filteret på «Alle kamper» som standard.
 *   · mobil    — lista er tappbar og fører til en detaljvisning per kamp. Det
 *                er lokal tilstand i denne skjermen, ikke en egen rute.
 *
 * EV-terskelen leses fra `useEvTerskel()` og ingen andre steder (DECISIONS).
 * Den styrer både kickeren, SPILL/NEI-taggingen og «Bare value»-filteret.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    EmptyState,
    ErrorState,
    EvTerskelSlider,
    Laster,
    PillGroup,
    SectionHeading,
    type PillOption,
} from '@/components/ui';
import { useEvTerskel } from '@/lib/config';
import { dl, nf, pc } from '@/lib/format';
import { kombiner, useElo, useMatchups, useMeta, useValueReport } from '@/lib/use-data';
import { byggKamper, kampKontekst, tellSpill } from './beregn';
import { KampDetalj } from './KampDetalj';
import { KampRad } from './KampRad';
import { MobilKort } from './MobilKort';
import { TomTilstand } from './TomTilstand';
import { useErMobil } from '@/lib/use-er-mobil';
import styles from './Verdi.module.css';

type Filter = 'value' | 'alle';

const FILTERVALG: readonly PillOption<Filter>[] = [
    { value: 'value', label: 'Bare value' },
    { value: 'alle', label: 'Alle kamper' },
];

/** OT/SO-noten. `allow_draw_bets` forklarer hvorfor raden alltid er UTELATT. */
function fotnoteTekst(tillaterUavgjort: boolean | undefined): string {
    const hvorfor =
        tillaterUavgjort === false
            ? 'pipelinen kjører med allow_draw_bets = false'
            : 'OT/SO-spill tas ikke lenger';
    return `OT/SO prises, men spilles ikke — ${hvorfor}. Prisen står likevel, fordi skyggeloggen trenger den.`;
}

export function VerdiSkjerm() {
    const rapport = useValueReport();
    const meta = useMeta();
    const elo = useElo();
    const matchups = useMatchups();
    const { evTerskel } = useEvTerskel();

    const [filter, setFilter] = useState<Filter>('alle');
    const [valgtId, setValgtId] = useState<string | null>(null);
    const erMobil = useErMobil();

    // Fokus må tilbake til kortet man kom fra når detaljvisningen lukkes.
    const kortRefs = useRef(new Map<string, HTMLButtonElement>());
    const fokusEtter = useRef<string | null>(null);

    // `max_odds` hører til utvelgelsen, ikke bare EV-terskelen: pipelinen krever
    // `odds < max_odds`, så uten den kunne lista tagge SPILL på et utfall
    // `bet_history.csv` aldri får.
    const maxOdds = meta.data?.max_odds;
    // OT/SO har egen, høyere terskel og kan være skrudd av. Begge er
    // pipeline-regler, ikke brukervalg, så de kommer fra meta – ikke slideren.
    const drawEvTerskel = meta.data?.draw_value_min;
    const allowDrawBets = meta.data?.allow_draw_bets;
    const kamper = useMemo(
        () => byggKamper(rapport.data ?? [], evTerskel, maxOdds, drawEvTerskel, allowDrawBets),
        [rapport.data, evTerskel, maxOdds, drawEvTerskel, allowDrawBets],
    );

    // Elo og form trengs bare når det finnes kamper å vise. I sesongpausen
    // skal ikke en treg `matchups.json` holde tomtilstanden tilbake.
    const harKamper = kamper.length > 0;
    const tilstand = harKamper
        ? kombiner(rapport, meta, elo, matchups)
        : kombiner(rapport, meta);

    const viste = filter === 'value' ? kamper.filter((k) => k.antallSpill > 0) : kamper;
    const antallSpill = tellSpill(kamper);
    const ingenTreff = harKamper && viste.length === 0;

    const lukk = useCallback(() => {
        fokusEtter.current = valgtId;
        setValgtId(null);
    }, [valgtId]);

    useEffect(() => {
        if (valgtId !== null || fokusEtter.current === null) return;
        const node = kortRefs.current.get(fokusEtter.current);
        fokusEtter.current = null;
        node?.focus();
    }, [valgtId]);

    const fotnote = fotnoteTekst(meta.data?.allow_draw_bets);
    const kicker = `Value-rapport · terskel EV ≥ ${pc(evTerskel, 0)}`;
    const tittel = dl(kamper[0]?.dato ?? meta.data?.generated_at);

    const valgt = valgtId === null ? null : (kamper.find((k) => k.id === valgtId) ?? null);

    if (erMobil && valgt !== null) {
        return (
            <KampDetalj
                kamp={valgt}
                kontekst={kampKontekst(valgt, elo.data, matchups.data)}
                evTerskel={evTerskel}
                onTilbake={lukk}
                fotnote={fotnote}
            />
        );
    }

    return (
        <>
            <SectionHeading kicker={kicker} title={tittel} right={<EvTerskelSlider />} />

            {tilstand.loading ? (
                <div className={styles.kroppLaster}>
                    <Laster />
                </div>
            ) : tilstand.error !== null ? (
                <ErrorState
                    className={styles.feilblokk}
                    error={tilstand.error}
                    onRetry={tilstand.retry}
                />
            ) : !harKamper ? (
                <TomTilstand
                    meta={meta.data}
                    antallKamper={kamper.length}
                    antallSpill={antallSpill}
                />
            ) : (
                <section className={styles.liste}>
                    <div className={styles.filterrad}>
                        <PillGroup
                            label="Filtrer kampene"
                            size="lg"
                            options={FILTERVALG}
                            value={filter}
                            onChange={setFilter}
                        />
                        <span className={styles.telling}>
                            {`${nf(viste.length)} av ${nf(kamper.length)} ${kamper.length === 1 ? 'kamp' : 'kamper'} · ${nf(antallSpill)} spill over terskel`}
                        </span>
                    </div>

                    {ingenTreff ? (
                        <div className={styles.ingenTreff}>
                            <EmptyState
                                size="md"
                                headline="Ingen utfall over terskel"
                                body={
                                    <>
                                        {'Markedet priser alle '}
                                        <span className={styles.ingenTreffTall}>
                                            {nf(kamper.length)}
                                        </span>
                                        {' kampene som modellen. Senk EV-terskelen eller vis alle kamper.'}
                                    </>
                                }
                                actions={
                                    <Button onClick={() => setFilter('alle')}>Vis alle kamper</Button>
                                }
                            />
                        </div>
                    ) : null}

                    {erMobil
                        ? viste.map((k) => (
                              <MobilKort
                                  key={k.id}
                                  kamp={k}
                                  onÅpne={setValgtId}
                                  knappRef={(node) => {
                                      if (node) kortRefs.current.set(k.id, node);
                                      else kortRefs.current.delete(k.id);
                                  }}
                              />
                          ))
                        : viste.map((k) => (
                              <KampRad
                                  key={k.id}
                                  kamp={k}
                                  kontekst={kampKontekst(k, elo.data, matchups.data)}
                                  evTerskel={evTerskel}
                              />
                          ))}

                    {viste.length > 0 ? <p className={styles.fotnote}>{fotnote}</p> : null}
                </section>
            )}
        </>
    );
}
