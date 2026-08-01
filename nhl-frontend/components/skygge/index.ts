export { SkyggeSkjerm } from './SkyggeSkjerm';
export { Panel, type PanelProps } from './Panel';
export { UtahVindu, type UtahVinduProps } from './UtahVindu';
export { stolpeBredde, stolpeNevner, velgUtvalg, type Kilde, type Utvalg } from './beregn';
// Utah-vinduet er delt med Elo-skjermen og bor i `lib/utah.ts`.
export { utahVindu, UTAH_VINDU_TIL, type UtahVindu as UtahVinduTall } from '@/lib/utah';
