import type { Metadata } from 'next';
import { EloSkjerm } from '@/components/elo';

export const metadata: Metadata = {
    title: 'Elo',
};

/**
 * Ruta er en serverkomponent slik at `metadata` kan eksporteres. Alt innhold
 * ligger i `<EloSkjerm />`, som er klientside — den leser `elo.json` med
 * `useElo()` og eier konferansefilteret.
 */
export default function EloPage() {
    return <EloSkjerm />;
}
