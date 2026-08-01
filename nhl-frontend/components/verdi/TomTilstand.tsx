/**
 * Tomtilstanden (§C.2). Dette er den ekte tilstanden mesteparten av året —
 * `value-report.json` er `[]` i sesongpausen — og er derfor bygget ferdig, ikke
 * som et ettertanke.
 *
 * To likeverdige kolonner: setningen om at det ikke er noe å prise til venstre,
 * kvitteringen på at pipelinen faktisk kjørte til høyre. Splitten er 50/50
 * fordi panelene er likeverdige; den asymmetriske splitten på Oversikt er en
 * innholdssplitt, og hører ikke hjemme her.
 */

import type { CSSProperties } from 'react';
import { ButtonLink, EmptyState } from '@/components/ui';
import { MANGLER, nf, sistOppdatert } from '@/lib/format';
import type { SiteMeta } from '@/types';
import styles from './Verdi.module.css';

export interface TomTilstandProps {
    meta: SiteMeta | null;
    /** Antall kamper i rapporten — `0` her, men leses fra dataen. */
    antallKamper: number;
    /** Antall utfall over brukerens terskel. */
    antallSpill: number;
}

const SPLIT: CSSProperties = {
    '--split-cols': 'minmax(0,1fr) minmax(0,1fr)',
    '--split-gutter': '48px',
} as CSSProperties;

function feilede(meta: SiteMeta | null): string {
    if (!meta) return MANGLER;
    return meta.failed.length === 0 ? 'ingen' : meta.failed.join(' · ');
}

function horisont(meta: SiteMeta | null): string {
    if (!meta) return MANGLER;
    return `${nf(meta.days_ahead)} døgn`;
}

export function TomTilstand({ meta, antallKamper, antallSpill }: TomTilstandProps) {
    const rader: readonly { nøkkel: string; verdi: string }[] = [
        { nøkkel: 'Kjørt', verdi: sistOppdatert(meta?.generated_at) },
        { nøkkel: 'Horisont', verdi: horisont(meta) },
        { nøkkel: 'Kamper funnet', verdi: nf(antallKamper) },
        { nøkkel: 'Value-spill', verdi: nf(antallSpill) },
        { nøkkel: 'Feilede jobber', verdi: feilede(meta) },
    ];

    return (
        <section className={`split ${styles.tom}`} style={SPLIT}>
            <div className={styles.tomVenstre}>
                <EmptyState
                    headline="Ingen kamper å prise"
                    body="Modellen kjører hver morgen, men kampprogrammet er tomt."
                    actions={<ButtonLink href="/kamp">Analyser en kamp selv</ButtonLink>}
                />
            </div>

            <div className={styles.tomHoyre}>
                <h2 className={`t-kicker ${styles.kjoringHode}`}>Siste kjøring</h2>
                {rader.map((r) => (
                    <div key={r.nøkkel} className={styles.kjoringRad}>
                        <span className={styles.kjoringNokkel}>{r.nøkkel}</span>
                        <span className={styles.kjoringVerdi}>{r.verdi}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
