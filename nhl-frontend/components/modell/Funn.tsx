/**
 * De åpne funnene fra `PROBLEMS.md`, nederst på skjermen.
 *
 * Teksten er redaksjonell og gjengitt fra `PROBLEMS.md`. Den er bevisst uten
 * tall: hvert funn har allerede sitt eget bevis lenger opp på skjermen, regnet
 * fra `portfolio.json` i samme lasting — de tre treff-tallene for funn 01,
 * EV-kvartilene og innsatssimulatoren for funn 02.
 *
 * En tidligere versjon gjentok tallene her som sitater. De frøs på historikken
 * slik den var da funnene ble skrevet (202 spill), og sto igjen og motsa
 * kickeren i samme skjermbilde etter at 20 sluttspillrader ble fjernet. Skal et
 * tall stå her, må det leses fra dataen — ellers skal det ikke stå.
 *
 * PROBLEMS.md har ett funn til — at loggene bare lagrer det valgte utfallet.
 * Det står ikke her: det er forbeholdet til kalibreringskurven, og hører hjemme
 * ved siden av den. `Kalibrering.tsx` sier det der.
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
            'Modellen forventer systematisk flere treff enn den får, mens markedet er godt kalibrert på ' +
            'den samme porteføljen — se de tre tallene øverst på skjermen, og hvor mange bøtter som ' +
            'ligger under diagonalen i kalibreringskurven. Det gjelder hvert spill vi legger inn, ikke ' +
            'bare OT/SO, og er dermed et større problem enn uavgjort-seleksjonen. Sannsynlig retning: ' +
            'kalibrer sannsynlighetene isotonisk eller med Platt på en kronologisk holdout før EV regnes ' +
            'ut, i stedet for å bruke Random Forest-ens rå predict_proba.',
    },
    {
        nr: '02',
        tittel: 'EV er ikke informativ nok til å skalere innsatsen etter',
        tekst:
            'Korrelasjonen mellom EV og realisert avkastning per krone er ikke til å skille fra null — ' +
            'permutasjonstesten står under «Betaler høy EV seg?». Å satse mer der modellen ser størst ' +
            'kant gjør derfor bare variansen dyrere, og ingen av regimene i simulatoren har et ' +
            'bootstrap-intervall som utelukker null. Slår en regel flat innsats, kommer gevinsten fra ' +
            'odds-leddet og ikke fra EV-leddet: regelen som satser 1/(odds − 1) og ignorerer EV helt er ' +
            'den å måle mot. Med sammensatt bankrull er ekte Kelly dessuten direkte farlig så lenge ' +
            'modellen er overkonfident. Behold flat innsats til sannsynlighetene er kalibrert.',
    },
];

export function Funn() {
    return (
        <section className={styles.funn}>
            <span className="t-kicker">Åpne funn · ikke fikset</span>
            <h2 className={styles.panelTittel}>Det vi vet er galt</h2>
            <p className={styles.note}>
                Punktene er gjengitt fra PROBLEMS.md og følger ikke OT/SO-toggelen. De står uten tall med
                vilje: beviset for hvert av dem er figurene over, som regnes fra historikken slik den er nå.
                Punktene strykes først når de faktisk er løst.
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
