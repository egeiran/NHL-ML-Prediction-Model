import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ModellSkjerm } from '@/components/modell';
import { Laster } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Modell',
};

/**
 * Ruta er en serverkomponent slik at `metadata` kan eksporteres. Alt innhold
 * ligger i `<ModellSkjerm />`, som er klientside — den leser
 * `portfolio-history.json` og eier sesongvalget, OT/SO-toggelen og
 * innsatssimulatoren.
 *
 * `<Suspense>` er ikke pynt: sesongvalget bor i `?sesong=`, og
 * `useSearchParams()` krever en grense over seg i Next 15.
 */
export default function ModellPage() {
    return (
        <Suspense fallback={<Laster />}>
            <ModellSkjerm />
        </Suspense>
    );
}
