import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Verdi i dag',
};

export default function VerdiPage() {
    return (
        <main>
            <SectionHeading kicker="Value-rapport" title="Verdi i dag" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Verdi i dag er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.2.
            </p>
        </main>
    );
}
