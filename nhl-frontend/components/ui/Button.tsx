/**
 * Outline-knapper (§E.3).
 *
 *   <Button variant="secondary" onClick={…}>Prøv igjen</Button>
 *   <ButtonLink href="/kamp">Analyser en kamp</ButtonLink>
 *
 * Standard padding er `13px 20px` (§H.5, avgjort). Kallstedet kan overstyre med
 * `pad`, f.eks. `pad="14px 20px"` — den settes som `--btn-pad`, ikke som en ny
 * klasse, så CSS-en beholder ett sted for resten av stilen.
 *
 * `variant="compact"` er den tredje, mindre varianten («⇅ Bytt»), som har
 * `9px 13px` som standard.
 */

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'compact';

function klasser(variant: ButtonVariant, className?: string): string {
    return `${styles.knapp} ${styles[variant]}${className ? ` ${className}` : ''}`;
}

function padStil(pad?: string): CSSProperties | undefined {
    return pad ? ({ '--btn-pad': pad } as CSSProperties) : undefined;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    /** Overstyrer paddingen, f.eks. `'14px 20px'`. */
    pad?: string;
}

export function Button({ variant = 'primary', pad, className, style, type, ...rest }: ButtonProps) {
    return (
        <button
            type={type ?? 'button'}
            className={klasser(variant, className)}
            style={{ ...padStil(pad), ...style }}
            {...rest}
        />
    );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string;
    variant?: ButtonVariant;
    pad?: string;
}

export function ButtonLink({
    href,
    variant = 'primary',
    pad,
    className,
    style,
    ...rest
}: ButtonLinkProps) {
    return (
        <Link
            href={href}
            className={klasser(variant, className)}
            style={{ ...padStil(pad), ...style }}
            {...rest}
        />
    );
}
