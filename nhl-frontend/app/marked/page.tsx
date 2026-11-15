import type { Metadata } from 'next';
import { MarkedSkjerm } from '@/components/marked';

export const metadata: Metadata = {
    title: 'Markedet',
};

/**
 * Serverkomponent så `metadata` kan eksporteres. Innholdet ligger i
 * `<MarkedSkjerm />`, som leser `strategy-ml.json` klientside.
 */
export default function MarkedPage() {
    return <MarkedSkjerm />;
}
