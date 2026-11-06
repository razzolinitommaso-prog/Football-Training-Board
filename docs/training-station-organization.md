# Organizzazione della seduta per stazioni

Le card e la griglia delle tre fasi restano i componenti esistenti. Una stazione nuova è indipendente: il suo tempo si aggiunge alla fase. La seconda e le successive possono essere associate alla precedente; solo quelle associate lavorano in contemporanea e condividono la durata del passaggio.

## Giocatori e tempi

La prima distribuzione del mister guida gli scambi. All'associazione le selezioni sovrapposte vengono ripartite senza duplicati; le selezioni già distinte sono conservate. Lo stesso bambino può partecipare a stazioni indipendenti successive. Nei gruppi associati il selettore esclude chi è già assegnato alle altre stazioni contemporanee.

Il dettaglio richiudibile “Rotazioni giocatori” genera i passaggi ciclici e consente il recupero prima dello scambio o della stazione successiva. I recuperi tra le tre fasi rimangono i campi esistenti. Associando/separando si conferma la reimpostazione dei soli gruppi coinvolti. Il comando Salva organizzazione conserva tutto nella singola seduta.

Esempio: 15 + 15 + 20 minuti indipendenti = 50 minuti. Associare le prime due = 35 minuti. Far ruotare i due gruppi su entrambe = 50 minuti; un recupero di 5 minuti fra i passaggi porta a 55.

## Compatibilità e lavagna

Il formato JSON preesistente conserva internamente gli elementi sequenziali; non è più l'impostazione primaria della schermata. Le rotazioni storiche vengono lette senza conversioni distruttive. Sono conservati anche i minutaggi storici senza rotazioni quando la firma della stazione è ancora valida. Nuovi collegamenti entrano come stazioni indipendenti, riferimenti rimossi sono ripuliti nella proiezione. Nessuna migrazione o aggiornamento massivo.

Le modifiche esplicite a durata/rosa nella scheda o dal salvataggio della lavagna vengono riconciliate con la distribuzione della seduta. Le assegnazioni della seduta non riscrivono le stazioni condivise della libreria. Il roster effettivo continua a rispettare l'appello e le indisponibilità, senza cambiare la relativa regola.

Aprire la lavagna dalla scheda porta la selezione attuale, preservando attrezzi, posizioni e animazione. Salvare dalla lavagna aggiorna i giocatori identificati nella selezione e il materiale; i marker generici non inventano identità. I materiali già richiesti sono indicati nel menu attrezzi della lavagna. Nel totale della seduta gli attrezzi contemporanei si sommano, quelli riutilizzati successivamente valgono una sola volta al massimo richiesto.

Le quantità manuali e quelle disegnate sono tracciate separatamente; una nuova cancellazione dalla lavagna può ridurre la parte automatica senza cancellare richieste manuali. Per i dati storici senza provenienza le quantità già presenti sono conservate prudentemente. Non vengono creati automaticamente nuovi disegni a partire dall'elenco materiali.

Se cambiano i giocatori identificati rispetto a un'immagine salvata, l'immagine obsoleta non viene mostrata come attuale: la scheda segnala che l'anteprima va aggiornata. Il nuovo salvataggio dalla lavagna produce l'immagine coerente. Le anteprime generiche o con la stessa rosa non vengono invalidate per differenze di serializzazione.

## Verifiche

- `node scripts/test-station-organization.cjs`: sequenza/contemporaneità, scambi, recuperi, esclusività, modifiche della fonte, conservazione organizzazioni storiche, materiali e fotogrammi.
- Suite `scripts/test-match-rotation-access.cjs` con PGlite isolato: handler HTTP reali di salvataggio/riapertura, duplicati simultanei, accessi, versioni obsolete e cambiamenti delle stazioni, sincronizzazione diretta lavagna/rosa/materiale. Conservate le regressioni preesistenti su famiglia, dirigenti, società, stagioni e disponibilità.
- Versione ottimistica calcolata su JSON canonico (chiavi ordinate), appello e fonti delle stazioni; verifica e risposta nello stesso salvataggio transazionale.
- Typecheck librerie/frontend/API e build web/API. Riscontro visivo della build locale a desktop e 430 px, con dati dimostrativi e senza scritture alla società reale. Il browser ha bloccato la finestra nativa di conferma: l'associazione interattiva non è stata verificata end-to-end nel browser; logica e persistenza sono verificate dalle API reali e dai test puri.
