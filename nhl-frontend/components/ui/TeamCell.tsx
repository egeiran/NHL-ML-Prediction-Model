'use client';

/**
 * Lagcelle og lagtlogo.
 *
 *   <TeamLogo abbr="BOS" />                       // 38px kvadrat
 *   <TeamLogo abbr="BOS" size={30} />             // Elo-tabellen
 *   <TeamCell abbr="BOS" under="Hjemme · Elo 1 514" />
 *   <TeamCell abbr="BOS" size={30} navnKlasse="t-team-name-table" gap={11} />
 *
 * Logoen hentes fra NHL-APIet (`lib/teams.ts:logoUrl`). Ved lastefeil blir den
 * stiplede plassholderen stående med forkortelsen — den er designets egen
 * laste- og feiltilstand, ikke en nødløsning.
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { lagNavn, logoUrl } from '@/lib/teams';
import styles from './TeamCell.module.css';

export interface TeamLogoProps {
    abbr: string;
    /** Sidekant i px. Default 38. */
    size?: number;
    className?: string;
}

interface LogoStatus {
    abbr: string;
    feilet: boolean;
    lastet: boolean;
}

export function TeamLogo({ abbr, size = 38, className }: TeamLogoProps) {
    // Statusen bæres sammen med forkortelsen den gjelder for. Får komponenten en
    // ny `abbr` i samme DOM-node, er den gamle statusen automatisk ugyldig — vi
    // trenger ingen effekt som nullstiller.
    const [status, setStatus] = useState<LogoStatus>({ abbr, feilet: false, lastet: false });
    const { feilet, lastet } = status.abbr === abbr ? status : { feilet: false, lastet: false };

    const stil = { '--logo-size': `${size}px` } as CSSProperties;

    return (
        <span
            className={`${styles.logo}${lastet ? ` ${styles.lastet}` : ''}${className ? ` ${className}` : ''}`}
            style={stil}
            aria-hidden="true"
        >
            {feilet ? (
                abbr
            ) : (
                // Begrunnelse for disablingen under: next/image gir ingenting her.
                // Bildet er en ekstern SVG i et fast kvadrat, og `output: 'export'`
                // har uansett ingen bildeoptimalisering. En <img> unngår dessuten
                // remotePatterns-konfigurasjon for en vert vi ikke kontrollerer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logoUrl(abbr)}
                    alt=""
                    className={styles.bilde}
                    width={size}
                    height={size}
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setStatus({ abbr, feilet: false, lastet: true })}
                    onError={() => setStatus({ abbr, feilet: true, lastet: false })}
                />
            )}
        </span>
    );
}

export interface TeamCellProps {
    abbr: string;
    /** Overstyrer lagnavnet. Default `lagNavn(abbr)`. */
    navn?: ReactNode;
    /** Typografiklasse på navnet. Default `t-team-name-list` (Serif 22px). */
    navnKlasse?: string;
    /** Linje under navnet, f.eks. `Borte · Elo 1 559`. */
    under?: ReactNode;
    /** Logoens sidekant i px. Default 38. */
    size?: number;
    /** Avstand logo↔tekst. Default 13. */
    gap?: number;
    className?: string;
}

export function TeamCell({
    abbr,
    navn,
    navnKlasse = 't-team-name-list',
    under,
    size = 38,
    gap = 13,
    className,
}: TeamCellProps) {
    const stil = { '--celle-gap': `${gap}px` } as CSSProperties;

    return (
        <span className={`${styles.celle}${className ? ` ${className}` : ''}`} style={stil}>
            <TeamLogo abbr={abbr} size={size} />
            <span className={styles.tekst}>
                <span className={`${navnKlasse} ${styles.navn}`}>{navn ?? lagNavn(abbr)}</span>
                {under ? <span className={styles.under}>{under}</span> : null}
            </span>
        </span>
    );
}
