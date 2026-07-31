import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Historikk',
};

export default function HistorikkPage() {
    return (
        <main>
            <SectionHeading kicker="Beslutningslogg" title="Hvert spill som er lagt inn" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Historikk er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.4.
            </p>
        </main>
    );
}
