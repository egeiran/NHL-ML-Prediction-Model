import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Skyggelogg',
};

export default function SkyggePage() {
    return (
        <main>
            <SectionHeading kicker="Skyggelogg" title="Spillene vi sluttet å ta" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Skyggelogg er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.7.
            </p>
        </main>
    );
}
