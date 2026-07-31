import type { NextConfig } from 'next';

/**
 * Statisk eksport. Ingen server actions, ingen route handlers, ingen `fs` i
 * komponenter — all data leses klientside fra `public/data/*.json`.
 *
 * `basePath` kan settes med `NEXT_PUBLIC_BASE_PATH` når siten mountes under et
 * underkatalog-prefiks. Samme variabel leses av `lib/data.ts`, slik at
 * datafilene hentes fra riktig sti.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

const nextConfig: NextConfig = {
    output: 'export',
    ...(basePath ? { basePath } : {}),
    images: {
        unoptimized: true,
    },
};

export default nextConfig;
