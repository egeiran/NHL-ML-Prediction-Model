import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SkyggeSkjerm } from '@/components/skygge';
import { Laster } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Skyggelogg',
};

/**
 * Ruta er en serverkomponent slik at `metadata` kan eksporteres. Alt innhold
 * ligger i `<SkyggeSkjerm />`, som er klientside — den leser `shadow.json` og
 * `portfolio-history.json` og viser én sesong om gangen.
 *
 * `<Suspense>` er ikke pynt: sesongvalget bor i `?sesong=`, og
 * `useSearchParams()` krever en grense over seg i Next 15.
 */
export default function SkyggePage() {
    return (
        <Suspense fallback={<Laster />}>
            <SkyggeSkjerm />
        </Suspense>
    );
}
