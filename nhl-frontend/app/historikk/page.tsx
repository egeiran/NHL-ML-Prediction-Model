import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HistorikkSkjerm } from '@/components/historikk';
import { Laster } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Historikk',
};

/**
 * Ruten er en tynn serverkomponent. Skjermen er en klientkomponent — den leser
 * `portfolio.json` og holder filtertilstanden i query-parametrene.
 *
 * `<Suspense>` er ikke pynt: `useSearchParams()` krever en grense over seg i
 * Next 15, ellers feiler prerenderingen av `/historikk` i byggingen.
 */
export default function HistorikkPage() {
    return (
        <main>
            <Suspense fallback={<Laster />}>
                <HistorikkSkjerm />
            </Suspense>
        </main>
    );
}
