# Tornei condivisi fra annate — implementazione

## Comportamento

- Da Crea torneo si inseriscono una volta nome, luogo, date e una o più annate della stessa stagione e settore.
- Un solo record comune identifica il torneo. L'elenco delle annate mostra soltanto quelle accessibili al profilo corrente.
- Aprendo un'annata si prepara il suo programma, con gironi e finali. Le gare assegnate all'annata diventano partite ordinarie del suo calendario. Le gare fra terzi e gli accoppiamenti ancora da assegnare rimangono solo nel programma.
- I collegamenti alle partite aprono le schede esistenti per convocazioni e schieramenti. Questi dati non sono copiati tra annate.
- Nome, luogo, date e allegati appartengono al torneo comune. Programmi, punteggi e classifiche appartengono all'annata: categorie diverse non condividono una graduatoria.
- I tornei precedenti rimangono nel flusso precedente. Nessun accorpamento automatico basato soltanto sul nome.

## Permessi e protezioni

Si conservano i ruoli gestionali del calendario per creare, programmare e cambiare dati comuni. Gli allenatori e gli altri tecnici ammessi leggono le proprie annate assegnate e continuano a lavorare nelle schede partita secondo i permessi esistenti. L'iscrizione al torneo non concede accesso ad altre annate.

Le operazioni comuni richiedono accesso a tutte le annate iscritte. Le API controllano società, settore, stagione e assegnazione; nascondere un pulsante non è il controllo di sicurezza.

Creazione e aggiornamento avvengono in transazione. Gli identificativi stabili delle gare evitano doppioni al secondo salvataggio. Un numero di revisione impedisce di sovrascrivere un programma o dati comuni modificati da un'altra pagina. In caso di conflitto si ricarica prima di riprovare.

Le gare con convocazioni, schieramenti, risultato o note di preparazione/resoconto non possono essere rimosse o trasformate in un'altra gara dal programma. Il torneo con gare collegate non viene eliminato automaticamente. La conferma di eliminazione è sempre richiesta nell'interfaccia. I programmi senza partite operative vengono ripuliti quando si elimina il torneo vuoto.

Le annate partecipanti vengono stabilite alla creazione; la modifica dei dati comuni non cambia silenziosamente le iscrizioni.

## Database e pubblicazione

Schema aggiuntivo: shared_tournaments, shared_tournament_teams, shared_tournament_matches e shared_tournament_documents. I programmi e punteggi restano nei tournament_states esistenti, uno per annata, con competizione canonica Torneo: nome. Il riferimento alla gara è in una tabella dedicata; un marcatore nelle note permette la selezione del torneo nell'elenco.

Il file docs/shared-tournaments.sql contiene soltanto la migrazione aggiuntiva e idempotente, corrispondente all'inizializzazione degli endpoint. Nessuna migrazione è stata eseguita sul database reale durante lo sviluppo. Non è necessario eseguire un db:push generale, che includerebbe eventuali altre modifiche locali.

API e frontend devono essere pubblicati insieme, con API disponibile prima dell'utilizzo della nuova interfaccia. Per un ritorno al codice precedente conservare le nuove tabelle e i dati; non eseguire DROP automatici. Le partite create sono normali partite con teamId e rimangono leggibili dal calendario precedente.

## Verifiche riproducibili

Il test scripts/test-shared-tournaments.cjs carica gli handler Express effettivi, la validazione effettiva e il driver Drizzle su PostgreSQL in memoria (PGlite). Non importa le credenziali applicative e non si collega al database reale. Autenticazione e risoluzione dell'ambito sono simulate nel test; l'assegnazione delle squadre viene letta con le query effettive.

Esecuzione con PGlite già disponibile: node scripts/test-shared-tournaments.cjs <percorso-del-pacchetto-@electric-sql/pglite>. Senza argomento cerca il pacchetto nel normale percorso Node.

Copertura: creazione unica per più annate, ruoli e isolamento, date non valide, rollback, gare operative e gare tra terzi, riapertura e salvataggio ripetuto, conflitto di revisione, protezione dei dati tecnici, modifica comune delle gare di entrambe le annate, allegati, eliminazione e conservazione del torneo precedente. L'esclusione concorrente del lock PostgreSQL non è simulata da questo test sequenziale.

Controlli aggiuntivi: compilazione degli schemi condivisi, typecheck frontend/API, build web e API. Il collaudo visivo mobile/desktop e il collaudo live autenticato restano da eseguire: il controllo del browser integrato non è disponibile in questa sessione. Non presentarli come verifiche effettuate.

## Più fasi nello stesso torneo

La creazione consente una o più fasi con nome e intervallo di date (ad esempio 12–13 dicembre e 9–10 gennaio). Il periodo complessivo si ricava automaticamente dalle fasi; non vengono create partite nei giorni intermedi. Le fasi sono dati comuni alle annate partecipanti e si possono modificare dai dati comuni.

Nel programma ogni gara sceglie la fase del torneo. Gironi e turni (Gironi, Finale ecc.) restano un campo distinto. Le API rifiutano gare senza fase per i nuovi tornei a fasi, riferimenti inesistenti e date fuori dalla fase scelta. Una fase usata non si può rimuovere né restringere escludendo gare salvate. Gli identificativi rimangono stabili quando cambia il nome della fase.

Compatibilità: i tornei precedenti senza fasi mantengono il comportamento precedente; un client che non invia le fasi non cancella quelle esistenti. L'aggiunta di fasi a un torneo precedente richiede che le gare già salvate rientrino nei nuovi intervalli. Alla lettura si propone l'abbinamento per data solo quando la fase è univoca. Il salvataggio dei risultati conserva il collegamento alla fase.

La migrazione aggiunge soltanto la colonna JSONB phases con valore predefinito vuoto. Test reali degli handler su database isolato coprono anche dicembre/gennaio, intervalli vuoti tra le fasi, ID e date errati, rimozione protetta, rinomina, salvataggio risultati e compatibilità con client precedenti. Nessun test di scrittura è stato eseguito in produzione.
