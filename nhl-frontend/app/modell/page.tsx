import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Modell',
};

export default function ModellPage() {
    return (
        <main>
            <SectionHeading kicker="Modellkvalitet" title="Er modellen god?" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Modell er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.6.
            </p>
        </main>
    );
}
