# Organizzazione della seduta per stazioni

Le card e la griglia delle tre fasi restano i componenti esistenti. Una stazione nuova è indipendente: il suo tempo si aggiunge alla fase. La seconda e le successive possono essere associate alla precedente; solo quelle associate lavorano in contemporanea e condividono la durata del passaggio.

## Giocatori e tempi

La prima distribuzione del mister guida gli scambi. All'associazione le selezioni sovrapposte vengono ripartite senza duplicati; le selezioni già distinte sono conservate. Lo stesso bambino può partecipare a stazioni indipendenti successive. Nei gruppi associati il selettore esclude chi è già assegnato alle altre stazioni contemporanee.

Il dettaglio richiudibile “Rotazioni giocatori” è sincronizzato sulle card associate. L’associazione genera subito il giro completo; “Personalizza scambi” consente partecipanti, ripetizioni e recuperi del passaggio. I recuperi tra le tre fasi rimangono i campi esistenti. Associando/separando si conferma la reimpostazione dei soli gruppi coinvolti. Il comando Salva organizzazione conserva tutto nella singola seduta.

Esempio: due stazioni associate da 15 minuti producono subito 2 passaggi per 30 minuti di attività; un recupero di 5 minuti porta a 35. Con una terza stazione indipendente da 20 minuti si arriva a 50 minuti di attività, più i recuperi. Un gruppo da 4 e uno da 3 possono scambiarsi normalmente; una ripetizione individuale nello stesso passaggio non aggiunge tempo.

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
- Typecheck librerie/frontend/API e build web/API. Riscontro visivo della build locale a desktop e 430 px, con dati dimostrativi e senza scritture alla società reale. La conferma di associazione usa ora il dialogo dell’app. Verificati nel browser associazione, ripetizione individuale, salvataggio/riapertura, eredità dei gruppi, apertura e salvataggio della lavagna del passaggio, su fixture locali.


## Giro completo, continuità e lavagna del passaggio (06/11/2026)

- Anche le associazioni già salvate con un solo passaggio automatico vengono proiettate come giro completo, senza scritture alla lettura. Sono conservate le eccezioni manuali e il recupero prima della successiva stazione indipendente. Un salvataggio esplicito conserva la nuova organizzazione.
- La prima distribuzione è la base delle fasi successive: la nuova associazione riprende l’ultimo gruppo precedente compatibile solo quando il riferimento è univoco e ha lo stesso numero di stazioni. Nessuna distribuzione arbitraria su strutture differenti. Il collegamento si conserva come groupSource nel JSON della seduta; può essere disattivato dalla personalizzazione. Le modifiche alla distribuzione iniziale aggiornano le fasi collegate, lasciando le eccezioni manuali.
- Dal secondo passaggio si può scegliere “Scegli chi resta a ripetere”; il bambino viene tolto dall’altra stazione contemporanea. “Modifica partecipanti” consente anche le altre correzioni. La casella dedicata applica l’eccezione allo stesso passaggio delle fasi successive univoche e compatibili; altrimenti si adattano separatamente. “Aggiungi passaggio” aggiunge effettivamente tempo. Le eccezioni manualPlayers restano finché il mister rigenera esplicitamente il giro, previa conferma.
- Ogni passaggio ha la propria lavagna: boardJson e anteprima risiedono nel piano della seduta. Il primo accesso copia la scena della stazione separandola dalla lavagna originale; le successive riaperture usano la scena salvata del passaggio. La rigenerazione conserva le scene, adattando i marker alla nuova rosa e invalidando solo anteprime obsolete.
- La lavagna mostra la selezione del passaggio già schierata, mantiene attrezzi/animazioni e offre la rosa effettivamente disponibile secondo l’appello. Il salvataggio aggiorna il passaggio e la pianificazione con la versione corrente; non riscrive la stazione condivisa in libreria. Se si aggiunge un bambino da un’altra stazione contemporanea, viene spostato. Lo snapshot salvato nella libreria lavagne contiene anche il contesto trainingRotation (seduta, link, fase, passaggio, riferimento sequenziale); non costituisce un’autorizzazione di accesso.
- La lettura con assenti esclude i loro marker da scene e fotogrammi e rimuove anteprime superate. L’API rifiuta scene con attori estranei alla selezione del passaggio. Il totale materiali comprende anche le scene dei passaggi, mantenendo le richieste manuali e il massimo per materiale riutilizzato.
- Resta un unico formato JSON compatibile, senza migrazione o interventi sui dati reali. Permessi e perimetro società/annate restano quelli del piano della seduta. Limiti validati per passaggi, immagini e scene. Controlli ottimistici preservati.
