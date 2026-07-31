import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui';

/**
 * `title.template` fra rot-layouten gjelder ikke segmentet den er definert i,
 * derfor står hele tittelen her.
 */
export const metadata: Metadata = {
    title: 'Blålinja · Oversikt',
};

export default function OversiktPage() {
    return (
        <main>
            <SectionHeading kicker="Blålinja" title="Oversikt" />
            <p className="t-body-small c-vermillion" style={{ marginTop: 28 }}>
                TODO: Oversikt er ikke bygget ennå. Se docs/blalinja/design-spec.md §C.1.
            </p>
        </main>
    );
}
