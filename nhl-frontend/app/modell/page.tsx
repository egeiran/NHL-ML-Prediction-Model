import type { Metadata } from 'next';
import { ModellSkjerm } from '@/components/modell';

export const metadata: Metadata = {
    title: 'Modell',
};

/**
 * Ruta er en serverkomponent slik at `metadata` kan eksporteres. Alt innhold
 * ligger i `<ModellSkjerm />`, som er klientside — den leser `portfolio.json`
 * med `usePortfolio()` og eier både OT/SO-toggelen og innsatssimulatoren.
 */
export default function ModellPage() {
    return <ModellSkjerm />;
}
