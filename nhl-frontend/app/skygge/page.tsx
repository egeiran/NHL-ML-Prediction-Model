import type { Metadata } from 'next';
import { SkyggeSkjerm } from '@/components/skygge';

export const metadata: Metadata = {
    title: 'Skyggelogg',
};

/**
 * Ruta er en serverkomponent slik at `metadata` kan eksporteres. Alt innhold
 * ligger i `<SkyggeSkjerm />`, som er klientside — den leser både `shadow.json`
 * og `portfolio.json` og velger kilde ut fra hvilken av dem som har rader.
 */
export default function SkyggePage() {
    return <SkyggeSkjerm />;
}
