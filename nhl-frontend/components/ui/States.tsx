/**
 * Fellestilstandene fra §C: lastende, feil, tom.
 *
 *   <Laster />                                  → «Laster …» (Mono, --faint)
 *   <ErrorState error={p.error} onRetry={p.retry} />
 *   <EmptyState headline="Ingen kamper å prise"
 *               body="Modellen kjører hver morgen, men kampprogrammet er tomt."
 *               actions={<ButtonLink href="/kamp">Analyser en kamp selv</ButtonLink>} />
 *
 * Designet beveger seg ikke: ingen spinner, ingen skjelettpuls.
 */

import type { ReactNode } from 'react';
import type { DataFeil } from '@/lib/data';
import { Button } from './Button';
import styles from './States.module.css';

/* -------------------------------------------------------------------------- */

export function Laster({ className }: { className?: string }) {
    return <span className={`laster${className ? ` ${className}` : ''}`}>Laster …</span>;
}

/* -------------------------------------------------------------------------- */

export interface ErrorStateProps {
    /** `DataFeil` fra datahooken — bærer filnavnet. Ellers oppgi `fil`. */
    error?: DataFeil | null;
    /** Filnavnet som ikke svarte, hvis `error` ikke er tilgjengelig. */
    fil?: string;
    /** Vises som brødtekst i stedet for standardsetningen. */
    melding?: ReactNode;
    onRetry?: () => void;
    className?: string;
}

export function ErrorState({ error, fil, melding, onRetry, className }: ErrorStateProps) {
    const filnavn = fil ?? error?.fil ?? 'Datafilen';
    return (
        <div className={`${styles.feil}${className ? ` ${className}` : ''}`} role="alert">
            <span className={`t-stat-label ${styles.feilEtikett}`}>Kunne ikke laste data</span>
            <p className={`t-body-small ${styles.feilTekst}`}>
                {melding ?? `${filnavn} svarte ikke. Tallene under kan være utdaterte.`}
            </p>
            {onRetry ? (
                <div className={styles.feilHandling}>
                    <Button variant="secondary" onClick={onRetry}>
                        Prøv igjen
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
    headline: ReactNode;
    body?: ReactNode;
    /** Knapper, typisk `<ButtonLink>` / `<Button>`. */
    actions?: ReactNode;
    /** `lg` = tomtilstanden på Verdi · `md` = filtrert-tom i tabeller. Default `lg`. */
    size?: 'lg' | 'md';
    className?: string;
}

export function EmptyState({ headline, body, actions, size = 'lg', className }: EmptyStateProps) {
    return (
        <div className={`${styles.tom}${className ? ` ${className}` : ''}`}>
            <h2 className={size === 'lg' ? styles.tomOverskriftLg : styles.tomOverskriftMd}>{headline}</h2>
            {body ? (
                <p className={`t-body${size === 'lg' ? '' : '-small'} ${size === 'lg' ? styles.tomBrødtekst : styles.tomBrødtekstMd}`}>
                    {body}
                </p>
            ) : null}
            {actions ? <div className={styles.handlinger}>{actions}</div> : null}
        </div>
    );
}
