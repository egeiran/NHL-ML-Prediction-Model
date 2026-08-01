/**
 * Merking av kvantilbøtter — delt av kalibreringstabellen og kvartilfigurene.
 *
 * Begge filene hadde sin egen `TANKESTREK` og sin egen `K${i + 1}`-funksjon,
 * den ene kalt `kvantil` og den andre `kvartil`. Kvartiler *er* kvantiler, så
 * det var samme konstant og samme funksjon under to navn, i to filer i samme
 * mappe. De bor her.
 */

/** U+2013, tankestrek i intervaller. Ikke bindestrek, ikke U+2212. */
export const TANKESTREK = '–';

/**
 * `K1`…`Kn`. Bøttene er kvantiler, ikke faste intervaller: `lo`/`hi` er
 * observert minimum og maksimum i bøtta, og to nabobøtter kan derfor møtes på
 * samme råverdi (kvantilsplitten deler like verdier på posisjon — dokumentert
 * og bevisst i `lib/analysis.ts`). Da kan ikke intervallet bære identiteten til
 * bøtta uten å lese som en av-med-én; K-merket gjør det, og intervallet står
 * som sekundærtekst.
 */
export function kvantil(i: number): string {
    return `K${i + 1}`;
}
