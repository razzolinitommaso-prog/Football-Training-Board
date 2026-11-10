import type { TrainingPrincipleSection } from "./training-principles";
import type { RotationPhase } from "./training-rotations";

type Station = { phase: RotationPhase; durationMinutes: number; title: string; description: string };
type Guide = {
  id: string; section: TrainingPrincipleSection; label: string; objective: string;
  focus: string; guidance: string[]; observe: string; transition?: string; stations: Station[];
};
type Block = [number, string, string];
function blocks(initial: Block, centralA: Block, centralB: Block, finalA: Block, finalB: Block): Station[] {
  const toStation = ([durationMinutes, title, description]: Block, phase: RotationPhase) => ({ phase, durationMinutes, title, description });
  return [
    toStation(initial, "iniziale"), toStation(centralA, "centrale"), toStation(centralB, "centrale"),
    toStation(finalA, "finale"), toStation(finalB, "finale"),
  ];
}

export const TRAINING_METHOD_GUIDES: Guide[] = [
  {
    id: "first-play", section: "scuola_calcio", label: "Piccoli Amici e Primi Calci", objective: "goal1:motor",
    focus: "Esplorare movimenti, spazio e palla. Dare ai bambini molte occasioni di provare e scegliere.",
    guidance: ["Usa gruppi piccoli e consegne brevi.", "Parti da giochi semplici. Nei Primi Calci introduci progressivamente l’opposizione e la collaborazione."],
    observe: "Il bambino cambia direzione o velocità quando cambia lo spazio disponibile?",
    stations: blocks(
      [15, "Esplora lo spazio", "Muoviti tra le porticine con e senza palla. Varia percorso e direzione."],
      [25, "Conduci e scegli", "Scegli una porta libera. Introduci un avversario quando il gruppo è pronto."],
      [20, "Piccole sfide", "Organizza partite da due o tre per gruppo, con ripartenze rapide."],
      [20, "Partita libera", "Usa campi paralleli e fai giocare tutti con tempi simili."],
      [10, "Rientro alla calma", "Chiedi ai bambini quale strada hanno scelto e cosa hanno visto."],
    ),
  },
  {
    id: "pulcini", section: "scuola_calcio", label: "Pulcini", objective: "goal1:collaborative",
    focus: "Usare la tecnica in situazione e scoprire le prime collaborazioni in 2 contro 1 e 2 contro 2.",
    guidance: ["Alterna situazioni brevi e giochi ridotti.", "Chiedi ai giocatori di spiegare una scelta con parole loro."],
    observe: "Chi ha trasmesso la palla si offre di nuovo in appoggio?",
    stations: blocks(
      [15, "Attivazione con scelte", "Conduci verso uno spazio libero e cambia direzione alla comparsa di un compagno."],
      [25, "Due contro uno", "Scegli tra conduzione e trasmissione in base al movimento del difensore."],
      [20, "Due contro due", "Crea una linea di passaggio dopo la trasmissione. Cambia spesso coppie e avversari."],
      [20, "Partita libera", "Osserva se l’appoggio emerge anche senza consegna."],
      [10, "Rientro alla calma", "Raccogli un esempio di collaborazione che ha aiutato il compagno."],
    ),
  },
  {
    id: "esordienti", section: "scuola_calcio", label: "Esordienti", objective: "goal1:cognitive",
    focus: "Riconoscere gli spazi, scegliere in autonomia e collaborare in piccoli gruppi.",
    guidance: ["Fai scegliere i giocatori in situazioni semplici.", "Adatta spazi e numero di giocatori al gruppo."],
    observe: "Il sostegno dopo la trasmissione compare anche nella partita libera?",
    transition: "Verso i Giovanissimi amplia gradualmente spazi e distanze. Adatta difficoltà e tempi ai diversi ritmi di crescita e di apprendimento.",
    stations: blocks(
      [15, "Attivazione coordinativa e percettiva", "Varia spazi, direzioni e stimoli, con o senza palla."],
      [25, "Tecnica situazionale", "Dal 1 contro 1 al 2 contro 2. Scegli se condurre, trasmettere o sostenere."],
      [20, "Giochi ridotti e collaborazioni", "Lavora in 3 contro 3 o 4 contro 4. Aggiungi sponde se aiutano a trovare linee di passaggio."],
      [20, "Partita libera", "Lascia spazio alle scelte. Osserva le collaborazioni senza imporre soluzioni."],
      [10, "Rientro alla calma e domande", "Chiedi ai giocatori come hanno riconosciuto spazio e compagni liberi."],
    ),
  },
  {
    id: "youth", section: "settore_giovanile", label: "Giovanissimi e Allievi", objective: "goal1:transitions",
    focus: "Collegare tecnica, preparazione fisica progressiva e letture di reparto.",
    guidance: ["Adatta spazio e difficoltà alla maturazione del gruppo.", "Aumenta gradualmente l’intensità e mantieni la qualità del gesto tecnico."],
    observe: "Dopo un recupero la squadra riconosce quando attaccare subito e quando consolidare il possesso?",
    stations: blocks(
      [20, "Attivazione e prevenzione", "Combina mobilità, stabilità e cambi di direzione progressivi."],
      [20, "Lavoro specifico", "Organizza situazioni tecniche ad intensità progressiva, con recuperi adatti al gruppo."],
      [25, "Tattica situazionale", "Usa un 6 contro 6 o un 8 contro 8 per allenare sostegno, coperture e transizioni."],
      [20, "Partita a tema", "Alterna gioco libero e un vincolo legato al principio della seduta."],
      [5, "Chiusura e verifica", "Riprendi una situazione di gioco e chiedi quali soluzioni erano disponibili."],
    ),
  },
  {
    id: "senior", section: "prima_squadra", label: "Prima Squadra", objective: "goal1:attack",
    focus: "Traccia da adattare al modello di gioco del club, al microciclo e alla prossima gara.",
    guidance: ["Il DT definisce priorità e carico in base agli impegni.", "Collega il tema alle situazioni di gara e alle caratteristiche della rosa."],
    observe: "Il principio scelto si riconosce anche quando la partita perde il vincolo iniziale?",
    stations: blocks(
      [15, "Attivazione specifica", "Introduci gesti e movimenti legati al tema della seduta."],
      [20, "Tecnica in situazione", "Allena le soluzioni individuali utili al principio di gioco scelto."],
      [30, "Lavoro di reparto e collettivo", "Crea scenari coerenti con il modello di gioco e con gli spazi che si vogliono occupare."],
      [20, "Partita a tema", "Verifica il trasferimento del principio sotto pressione. Togli progressivamente i vincoli."],
      [5, "Chiusura e verifica", "Confronta le soluzioni osservate con l’obiettivo iniziale."],
    ),
  },
];
