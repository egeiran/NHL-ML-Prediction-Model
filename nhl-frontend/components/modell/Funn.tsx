/**
 * De åpne funnene fra `PROBLEMS.md`, nederst på skjermen.
 *
 * Teksten gjelder hele historikken på 202 spill og endres ikke av
 * OT/SO-toggelen — det står eksplisitt i ingressen.
 */

import styles from './Modell.module.css';

interface Funn {
    nr: string;
    tittel: string;
    tekst: string;
}

const FUNN: readonly Funn[] = [
    {
        nr: '01',
        tittel: 'Modellen er globalt overkonfident',
        tekst:
            'På de 202 spillene i historikken forventet modellen 85,5 treff, markedet 66,4, og 68 skjedde. ' +
            'Markedet er godt kalibrert på denne porteføljen; modellen ligger cirka 26 % for høyt. Det gjelder ' +
            'hvert spill vi legger inn, ikke bare OT/SO, og er dermed et større problem enn både Utah-feilen og ' +
            'uavgjort-seleksjonen. Sannsynlig retning: kalibrer sannsynlighetene isotonisk eller med Platt på en ' +
            'kronologisk holdout før EV regnes ut, i stedet for å bruke Random Forest-ens rå predict_proba.',
    },
    {
        nr: '02',
        tittel: 'EV er ikke informativ nok til å skalere innsatsen etter',
        tekst:
            'Korrelasjonen mellom EV og realisert avkastning per krone er r = −0,03 med permutasjonstest ' +
            'p = 0,74: sammenhengen finnes ikke i dataen. Lineær skalering gir −311 kr mot flat innsats, ' +
            'kvadratisk −1 004 kr, ved lik omsetning, og ingen av regimene har et bootstrap-intervall som ' +
            'utelukker null. Kelly slår flat med +448 kr, men gevinsten kommer fra odds-leddet, ikke ' +
            'EV-leddet: en regel som satser 1/(odds − 1) og ignorerer EV helt gir +634 kr. Med sammensatt ' +
            'bankrull er ekte Kelly direkte farlig med dagens overkonfidens — full Kelly ender på −93 %, halv ' +
            'på −51 %, kvart på −6 %, mot flat +0,2 %. Behold flat innsats til sannsynlighetene er kalibrert.',
    },
    {
        nr: '03',
        tittel: 'Loggene lagrer bare det valgte utfallet',
        tekst:
            'model_prob og implied_prob finnes kun for utfallet vi spilte, ikke for alle tre. Det gir ' +
            'seleksjonsskjevhet i all etteranalyse — vi kan ikke se hva modellen mente om de to andre ' +
            'utfallene, og kalibreringskurven over måler derfor bare de utfallene modellen var mest ' +
            'optimistisk om. Å logge alle tre per kamp ville fjernet den begrensningen for framtidige ' +
            'undersøkelser.',
    },
];

export function Funn() {
    return (
        <section className={styles.funn}>
            <span className="t-kicker">Åpne funn · ikke fikset</span>
            <h2 className={styles.panelTittel}>Det vi vet er galt</h2>
            <p className={styles.note}>
                Punktene gjelder hele historikken på 202 spill og følger ikke OT/SO-toggelen. De står i
                PROBLEMS.md og strykes først når de faktisk er løst.
            </p>
            {FUNN.map((f) => (
                <div key={f.nr} className={styles.funnPunkt}>
                    <span className={styles.funnNummer} aria-hidden="true">
                        {f.nr}
                    </span>
                    <div>
                        <h3 className={styles.funnTittel}>{f.tittel}</h3>
                        <p className={styles.funnTekst}>{f.tekst}</p>
                    </div>
                </div>
            ))}
        </section>
    );
}
