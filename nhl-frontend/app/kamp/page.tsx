import { Suspense } from 'react';
import type { Metadata } from 'next';
import { KampSkjerm } from '@/components/kamp';
import { EvTerskelNotis, Laster, SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Kampanalyse',
};

/**
 * Ruten er en tynn serverkomponent: metadata, skjermhodet og `<main>`.
 *
 * Skjermen leser paringen fra query-parametrene med `useSearchParams`, og den
 * krever en `<Suspense>`-grense i Next 15 — uten den feiler byggingen av den
 * statiske eksporten.
 *
 * Terskelen styrer SPILL/NEI-taggingen i utfallskolonnene, men justeres bare på
 * /verdi. `<EvTerskelNotis>` sier derfor hvilken terskel som gjelder, og at den
 * avviker fra pipelinens (DECISIONS punkt 6). Den er en klientkomponent i en
 * serverkomponent — det er greit, den rendres som et barn og har provideren fra
 * `app/layout.tsx`.
 */
export default function KampPage() {
    return (
        <main>
            <SectionHeading
                kicker={<EvTerskelNotis prefiks="Kampanalyse · egendefinert oppgjør · " />}
                title="Sett to lag mot hverandre"
            />
            <Suspense fallback={<div style={{ paddingTop: 36 }}><Laster /></div>}>
                <KampSkjerm />
            </Suspense>
        </main>
    );
}
