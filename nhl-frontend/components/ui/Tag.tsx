/**
 * Tagg (§C.2):
 *
 *   <Tag variant="spill" />     → SPILL   (teal tekst, teal ramme)
 *   <Tag variant="nei" />       → NEI     (muted tekst, --rule ramme)
 *   <Tag variant="utelatt" />   → UTELATT (muted tekst, --rule ramme)
 *
 * Kildestrengene er små bokstaver; `text-transform` gjør dem store. Radens
 * `opacity: .5` for OT/SO settes av kallstedet, ikke av taggen.
 */

import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export type TagVariant = 'spill' | 'nei' | 'utelatt';

export interface TagProps {
    variant: TagVariant;
    /** Overstyrer teksten. Default er variantnavnet. */
    children?: ReactNode;
    className?: string;
}

export function Tag({ variant, children, className }: TagProps) {
    return (
        <span className={`${styles.tag} ${styles[variant]}${className ? ` ${className}` : ''}`}>
            {children ?? variant}
        </span>
    );
}
