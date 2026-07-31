import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Elo',
};

export default function EloPage() {
    return (
        <main>
            <SectionHeading kicker="Elo" title="Styrkeforholdet modellen ser" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Elo er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.5.
            </p>
        </main>
    );
}
