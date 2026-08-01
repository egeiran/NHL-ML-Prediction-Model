import type { Metadata } from 'next';
import { Oversikt } from '@/components/oversikt';
import { AnalyseLenker } from '@/components/shell';

/**
 * `title.template` fra rot-layouten gjelder ikke segmentet den er definert i,
 * derfor står hele tittelen her.
 */
export const metadata: Metadata = {
    title: 'Blålinja · Oversikt',
};

/**
 * Ruta er et skall: alt som trenger data og state ligger i `<Oversikt>`, som er
 * en klientkomponent. `<AnalyseLenker>` er grunnmurens egen — Elo, Modell og
 * Skyggelogg får ikke plass i mobilens bunnbar og nås herfra. Den er skjult over
 * 768px, så den kan stå ubetinget.
 */
export default function OversiktPage() {
    return (
        <main>
            <Oversikt />
            <AnalyseLenker />
        </main>
    );
}
