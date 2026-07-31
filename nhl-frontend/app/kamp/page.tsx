import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Kampanalyse',
};

export default function KampPage() {
    return (
        <main>
            <SectionHeading kicker="Kampanalyse · egendefinert oppgjør" title="Sett to lag mot hverandre" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Kampanalyse er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.3.
            </p>
        </main>
    );
}
