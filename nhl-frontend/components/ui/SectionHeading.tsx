/**
 * Skjermhode / seksjonsoverskrift med kicker (§C).
 *
 *   <SectionHeading kicker="Beslutningslogg" title="Hvert spill som er lagt inn" />
 *
 *   <SectionHeading
 *     kicker={`Elo · t.o.m. ${through}`}
 *     title="Styrkeforholdet modellen ser"
 *     right={<PillGroup … />}          // hodet blir flex når `right` er satt
 *   />
 *
 * `rule` styrer bunnlinja: `strong` (default, 1px ink), `light` (1px --rule)
 * eller `none`. `ingress` er den valgfrie brødteksten under tittelen
 * (Skyggelogg).
 */

import type { ElementType, ReactNode } from 'react';
import styles from './SectionHeading.module.css';

export interface SectionHeadingProps {
    kicker: ReactNode;
    title?: ReactNode;
    /** Kontrollklynge til høyre. Gjør hodet til en flex-rad. */
    right?: ReactNode;
    /** Brødtekst under tittelen. */
    ingress?: ReactNode;
    /** Overskriftsnivå. Default `h1` — én per skjerm. */
    as?: ElementType;
    /** Typografiklasse på tittelen. Default `t-screen-title`. */
    titleClassName?: string;
    rule?: 'strong' | 'light' | 'none';
    className?: string;
}

export function SectionHeading({
    kicker,
    title,
    right,
    ingress,
    as: Tittel = 'h1',
    titleClassName = 't-screen-title',
    rule = 'strong',
    className,
}: SectionHeadingProps) {
    const linje = rule === 'strong' ? styles.medLinje : rule === 'light' ? styles.medSvakLinje : '';
    const innhold = (
        <div className={styles.venstre}>
            <span className="t-kicker">{kicker}</span>
            {title ? <Tittel className={`${titleClassName} ${styles.tittel}`}>{title}</Tittel> : null}
            {ingress ? <p className={`t-body ${styles.ingress}`}>{ingress}</p> : null}
        </div>
    );

    return (
        <section
            className={`${styles.hode} ${linje}${right ? ` ${styles.flex}` : ''}${className ? ` ${className}` : ''}`}
        >
            {innhold}
            {right}
        </section>
    );
}
