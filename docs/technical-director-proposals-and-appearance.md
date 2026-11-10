# Direzione tecnica, libreria per annata e aspetto

## Navigazione

Il direttore tecnico dispone di `/technical/dashboard`. Il collegamento `/dashboard` lo reindirizza al nuovo cruscotto. Il menu distingue Sedute del mister, Linee guida sedute, Convocazioni e Stazioni. Partite apre l’elenco delle annate con i collegamenti ai calendari/campionati esistenti.

Il contesto condiviso settore/annata è memorizzato sul dispositivo per società e utente. L’elenco deriva dalle squadre autorizzate dell’endpoint esistente. Squadre, Giocatori, Sedute, Convocazioni, Presenze, Stazioni e cruscotto usano lo stesso contesto; le pagine societarie Membri/Stagioni mantengono il proprio ambito. I permessi lato server restano la fonte dell’accesso. La lista delle stazioni chiede prima l’annata quando sono disponibili più squadre e distingue le stazioni comuni.

## Linee guida facoltative

Si riusa `sessionKind=tipo`. Le nuove sedute del direttore sono forzate a tipo sul server e non diventano appuntamenti operativi nel calendario. Le sedute regolari storiche restano intatte. Il direttore può consultarle e aggiungere commenti/indicazioni, ma non modificarne preparazione, collegamenti, stazioni o organizzazione. La ricerca per contenuto delle stazioni carica i dati solo quando è usata, evitando richieste per tutte le sedute all’apertura.

Lo staff destinatario può consultare una proposta e scegliere tutte o alcune stazioni da aggiungere a una propria seduta operativa già esistente. Prima della conferma vede quante stazioni sono già presenti. Nessuna sostituzione automatica: l’adozione aggiunge copie indipendenti, preserva materiale, fasi e durata delle stazioni e registra la provenienza. Date e squadra appartengono alla seduta destinataria. Giocatori, identità della lavagna e collegamento alla lavagna originale sono rimossi; anteprime non più fedeli vengono scartate. Minutaggio complessivo, recuperi e gruppi restano da verificare e adattare nella preparazione del mister. La proposta originale non cambia.

`POST /training-sessions/:id/adopt` richiede destinatario autorizzato, ruolo staff, seduta operativa modificabile, annata compatibile e lista dei collegamenti già consultati. L’inserimento è transazionale con lock della seduta. Richieste ripetute o preparazioni cambiate restituiscono 409. Una risposta di disponibilità o un appello non si trasferiscono dalla proposta. Sono protetti anche gli endpoint di collegamento/rimozione stazioni e la modifica delle stazioni originali delle proposte.

## Aspetto condiviso

Tema Chiaro/Scuro/Sistema nel menu Aspetto della testata, salvato sul dispositivo con next-themes. La scelta non modifica la società o i dati degli altri utenti. Superfici, font, schede, campi e pulsanti condivisi hanno bordi più leggeri e ombre ridotte. Lo stemma resta nella testata; lo sfondo societario si può riattivare dal menu Aspetto. La stampa usa una palette chiara. I colori delle figure e dei campi della lavagna restano quelli salvati.

## Verifiche

Test HTTP/Express/Drizzle su PostgreSQL PGlite isolato: destinatari, assegnazioni, copia indipendente e pulita, mantenimento preparazione esistente, richieste obsolete/duplicate, protezione stazioni operative e della proposta, creazione DT forzata a tipo. Regressioni parent/manager, storico giocatore e disponibilità seduta nello stesso harness.

Verifica UI della build reale con API locali fittizie: navigazione, cambio settore e persistenza, categorie Scuola Calcio, Chiaro/Scuro e persistenza al reload, vista mobile 430px senza overflow orizzontale. Nessuna sessione reale o dato di produzione usato per i test.

## Modelli metodologici e obiettivi

Nella scheda Linee guida proposte il DT trova cinque modelli di riferimento per fascia. La transizione Esordienti–Giovanissimi è descritta nella guida degli Esordienti. Ogni modello include indicazioni per il mister, un comportamento da osservare e cinque blocchi nelle tre fasi già usate in FTB. Il modello Prima Squadra è una traccia del club da adattare al suo contesto.

Il DT può avviare una proposta da un modello, scegliere l’annata e i destinatari e confermare. Le stazioni nascono insieme alla proposta e i loro minuti vengono adattati alla durata impostata. Lo staff consulta le proposte ricevute e può adottare stazioni nella propria seduta con il flusso esistente.

La seduta ha un solo obiettivo prevalente. Condizionale si aggiunge per Settore Giovanile e Prima Squadra. In ogni stazione si può scegliere il catalogo oppure usare un principio, sottoprincipio o dettaglio libero. Salva come mia voce lo rende riutilizzabile dal proprio account nella stessa società e nello stesso settore. Con la palla e Senza palla si possono selezionare insieme.

## Annullamento dell’appello

Richiesto indica che il giocatore è richiesto da un’altra squadra. È uno stato dell’appello e non invia una richiesta o una notifica. Un secondo clic sullo stato attivo cancella la registrazione staff e la condotta associata. Le risposte dei genitori sono separate. L’annullamento agisce sul registro corrente. Eventuali comunicazioni già inviate e rimozioni di assegnazioni alle stazioni richiedono una gestione separata.
