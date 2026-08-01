'use client';

/**
 * Fylt pillegruppe (§E.1) — hero-vindu, kurvelab-rekkevidde, Verdi-filter,
 * Historikk-filtre, Elo konferansefilter.
 *
 *     <PillGroup
 *       label="Tidsvindu"
 *       size="sm"
 *       value={vindu}
 *       options={[{ value: '60', label: '60D' }, { value: 'alt', label: 'Alt' }]}
 *       onChange={setVindu}
 *     />
 *
 * Aktiv pille markeres med `aria-pressed`, som også er selektoren i CSS-en.
 */

import styles from './PillGroup.module.css';

export interface PillOption<V extends string> {
    value: V;
    label: string;
}

export interface PillGroupProps<V extends string> {
    options: readonly PillOption<V>[];
    value: V;
    onChange: (value: V) => void;
    /** `sm` = 7×11 @9.5px · `md` = 8×12 @9.5px · `lg` = 9×14 @10px. Default `sm`. */
    size?: 'sm' | 'md' | 'lg';
    /** Tilgjengelig navn på gruppen. Anbefalt. */
    label?: string;
    className?: string;
}

export function PillGroup<V extends string>({
    options,
    value,
    onChange,
    size = 'sm',
    label,
    className,
}: PillGroupProps<V>) {
    return (
        <div
            className={`${styles.gruppe}${className ? ` ${className}` : ''}`}
            role="group"
            aria-label={label}
        >
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={`${styles.pille} ${styles[size]}`}
                    aria-pressed={o.value === value}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
