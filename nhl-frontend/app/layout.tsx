import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import { EvTerskelProvider } from '@/lib/config';
import { BottomNav, Footer, Header } from '@/components/shell';
import './globals.css';

/**
 * Tre familier, selvhostet via `next/font/google` (§A.4). Ingen `<link>` til
 * Google Fonts. Variablene brukes av `--serif` / `--sans` / `--mono` i
 * `globals.css`; ingen komponent navngir en fontfamilie selv.
 */
const serif = Instrument_Serif({
    variable: '--font-serif',
    subsets: ['latin'],
    weight: ['400'],
    style: ['normal', 'italic'],
    display: 'swap',
});

const sans = IBM_Plex_Sans({
    variable: '--font-sans',
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    display: 'swap',
});

const mono = IBM_Plex_Mono({
    variable: '--font-mono',
    subsets: ['latin'],
    weight: ['400', '500'],
    display: 'swap',
});

export const metadata: Metadata = {
    title: {
        default: 'Blålinja',
        template: '%s · Blålinja',
    },
    description:
        'Porteføljerapport for en NHL-modell: dagens value-spill, kalibrering, Elo og hele beslutningsloggen.',
    applicationName: 'Blålinja',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="nb" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
            <body>
                <EvTerskelProvider>
                    <div className="app-ground">
                        <Header />
                        {children}
                        <Footer />
                        <BottomNav />
                    </div>
                </EvTerskelProvider>
            </body>
        </html>
    );
}
