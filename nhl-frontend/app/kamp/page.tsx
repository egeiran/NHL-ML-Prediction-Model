import { Suspense } from 'react';
import type { Metadata } from 'next';
import { KampSkjerm } from '@/components/kamp';
import { Laster, SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Kampanalyse',
};

/**
 * Ruten er en tynn serverkomponent: metadata, skjermhodet og `<main>`.
 *
 * Skjermen leser paringen fra query-parametrene med `useSearchParams`, og den
 * krever en `<Suspense>`-grense i Next 15 — uten den feiler byggingen av den
 * statiske eksporten.
 */
export default function KampPage() {
    return (
        <main>
            <SectionHeading kicker="Kampanalyse · egendefinert oppgjør" title="Sett to lag mot hverandre" />
            <Suspense fallback={<div style={{ paddingTop: 36 }}><Laster /></div>}>
                <KampSkjerm />
            </Suspense>
        </main>
    );
}
