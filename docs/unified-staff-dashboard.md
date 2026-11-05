# Cruscotto comune dello staff

## Ambito e struttura

Il cruscotto dello staff usa una sola struttura, con selettori Settore/Annata e menu comune. Si applica ad amministratore, presidente, DG (`director`), DS, DT, segreteria, allenatore, preparatore e responsabile atletico. Famiglie e dirigenti conservano i percorsi dedicati.

`GET /api/teams/navigation-scope` legge società, utente, ruolo, settori della membership e assegnazioni staff/coach. Restituisce soltanto metadati di navigazione. I settori espliciti hanno precedenza; settori espliciti non validi non diventano accesso a tutto il club. Gli account gestionali storici privi di settori espliciti conservano l'ambito gestionale precedente. Per lo staff tecnico operativo servono assegnazione personale o `coach_id`. Nessuna assegnazione o autorizzazione viene creata.

La selezione è salvata separatamente per società, utente e ruolo; il DT mantiene la propria preferenza precedente. Valori salvati non più autorizzati vengono scartati. Le vecchie pagine di settore continuano ad aprire il settore indicato nell'indirizzo, con blocco quando non autorizzato. La selezione comune filtra cruscotto, squadre, giocatori, sedute, libreria, riepilogo convocazioni e accessi ai calendari. Presenze conserva il registro settimanale esistente e il dettaglio della singola seduta.

## Presentazione e capacità

- DT: giocatori, sedute operative, linee guida e gare; preparazione completa/parziale/da impostare ricavata dai riepiloghi esistenti. Le proposte rimangono facoltative e separate dalle sedute dei mister.
- Segreteria: rosa e programmazione; accesso alla gestione gare/PDF e situazione di tesseramento/certificati. Non ricompaiono nel menu Squadre, Presenze, Campionati o strumenti tecnici rimossi.
- Presidente: conserva Convocazioni e i riepiloghi consentiti; nessuna voce Sedute o Stazioni nel menu.
- DS, DG e amministratori: collegamenti corrispondenti alle capacità già previste per il ruolo.
- Allenatori e preparatori: annate assegnate, preparazione e accessi operativi già autorizzati.

Contatori e pannelli usano i dati del contesto selezionato; richieste in caricamento o fallite non diventano zeri certi. I dati mancanti di preparazione sono indicati come da verificare. Le sedute annullate non entrano nel riepilogo della preparazione. I giocatori senza annata restano consultabili quando il settore è identificabile e autorizzato, senza attribuirli a un'annata selezionata.

Calendario mensile, comunicazioni, dialoghi, modifiche e schede sono riutilizzati. Fasi/eventi e funzioni aggiuntive sono richiudibili; le azioni rapide sono nelle funzioni aggiuntive. Statistiche generali e conteggi dei membri non necessari alle card del ruolo vengono richiesti aprendo le funzioni aggiuntive. I temi chiaro/scuro restano quelli esistenti. Nessuna modifica a convocazioni, minutaggi, regole delle presenze o salvataggi delle sedute.

## Compatibilità e autorizzazioni

Frontend e API possono essere distribuiti in momenti diversi: solo quando il nuovo percorso risponde 400/404, il selettore può usare il vecchio elenco squadre già autorizzato, restringendolo ai settori dell'accesso. Un 401/403 non attiva questo ripiego. Un settore vietato, un errore di ambito o l'assenza di assegnazioni impediscono di mostrare le pagine contestuali.

La nuova API protegge la risposta dell'ambito. Le operazioni sui dati continuano a passare dai servizi e dai controlli esistenti: il menu e i selettori non concedono diritti di scrittura e questa modifica non riscrive la matrice di autorizzazione di tutti i vecchi endpoint.

## Collaudo

- Typecheck frontend e backend; build frontend.
- Suite HTTP/PGlite: tutti i ruoli gestionali con settori espliciti, staff assegnato e coach diretto, account senza assegnazioni, settori non validi, parametri alterati, società separate; genitore/dirigente/anonimo esclusi dall'API di ambito. Regressioni di presenze, convocazioni, proposte, supervisione e classifica conservate.
- Browser isolato sulla build reale con dati dimostrativi: nove ruoli dello staff, menu unico, esclusioni Presidente/Segreteria, cambio settore e annata, propagazione a Giocatori e ritorno al cruscotto, apertura del dialogo calendario senza salvataggio, desktop e 430px, settore vietato, vecchia API 400 e rifiuto 403 senza ripiego. Nessun dato reale modificato.

Gli screenshot di collaudo sono della build locale con dati fittizi, non del deploy Render. Commit, push e deploy vanno indicati separatamente.
