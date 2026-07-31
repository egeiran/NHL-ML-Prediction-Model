'use client';

/**
 * Understrekede faner (§E.2) — kurvelabbens modusvelger («Verdikurve» /
 * «Daglig P&L»). Hovednavigasjonen bruker ikke denne; den er lenker, ikke
 * knapper, og bor i `components/shell/Header.tsx`.
 *
 *     <Tabs
 *       label="Kurvemodus"
 *       value={modus}
 *       options={[{ value: 'pnl', label: 'Daglig P&L' }, …]}
 *       onChange={setModus}
 *     />
 */

import styles from './Tabs.module.css';

export interface TabOption<V extends string> {
    value: V;
    label: string;
}

export interface TabsProps<V extends string> {
    options: readonly TabOption<V>[];
    value: V;
    onChange: (value: V) => void;
    label?: string;
    className?: string;
}

export function Tabs<V extends string>({ options, value, onChange, label, className }: TabsProps<V>) {
    return (
        <div className={`${styles.faner}${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={styles.fane}
                    aria-current={o.value === value}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
