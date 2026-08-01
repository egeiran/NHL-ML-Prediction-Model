import type { Metadata } from 'next';
import { VerdiSkjerm } from '@/components/verdi';

export const metadata: Metadata = {
    title: 'Verdi i dag',
};

/**
 * Ruten er en tynn serverkomponent: metadata og `<main>`. Selve skjermen er en
 * klientkomponent, fordi den leser data fra `public/data/*.json` og har lokal
 * tilstand (filter, og detaljvisningen på mobil).
 */
export default function VerdiPage() {
    return (
        <main>
            <VerdiSkjerm />
        </main>
    );
}
