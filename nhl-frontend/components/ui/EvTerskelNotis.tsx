'use client';

/**
 * Terskelen som tekst, uten kontroll. Motstykket til `<EvTerskelSlider>`.
 *
 * Slideren står bare på /verdi. Terskelen er delt og persistert, så den styrer
 * fortsatt SPILL/NEI-taggingen på Oversikt og Kampanalyse — og da må de to
 * skjermene fortsatt si hvilken terskel de viser, og at den avviker fra
 * pipelinens (DECISIONS punkt 6). Ellers ville en bruker som dro slideren til
 * 40 % på /verdi sett to andre skjermer endre seg uten forklaring.
 *
 *   <EvTerskelNotis />                       // «terskel EV ≥ 15 %»
 *   <EvTerskelNotis prefiks="Sesongpause · " />
 *
 * Tilbakestill-knappen vises bare når terskelen faktisk avviker: her er det
 * ingen kontroll å holde i ro, så det er ingen grunn til å reservere plass slik
 * slideren gjør.
 */

import { useEvTerskel } from '@/lib/config';
import { pc } from '@/lib/format';
import styles from './EvTerskelNotis.module.css';

export interface EvTerskelNotisProps {
    /** Tekst foran terskelen, f.eks. «Sesongpause · ». */
    prefiks?: string;
    className?: string;
}

export function EvTerskelNotis({ prefiks = '', className }: EvTerskelNotisProps) {
    const { evTerskel, pipelineTerskel, avviker, tilbakestill } = useEvTerskel();

    return (
        <span className={className}>
            {prefiks}
            {`terskel EV ≥ ${pc(evTerskel, 0)}`}
            {avviker ? (
                <>
                    {` · pipelinen spiller på ${pc(pipelineTerskel, 0)}, så tallene her følger ikke bet_history.csv `}
                    <button type="button" className={styles.tilbakestill} onClick={tilbakestill}>
                        Tilbakestill
                    </button>
                </>
            ) : null}
        </span>
    );
}
