# Test motori su più giornate

Una sessione conserva identificativo, data iniziale, ciclo e programma originario. La giornata di rilevazione seleziona invece l’appello della seduta corrispondente per la stessa annata. Se ci sono più sedute occorre sceglierne una; il sistema non crea presenze.

Il preparatore può aggiungere o completare risultati solo per i presenti nella giornata scelta. I giocatori già valutati restano consultabili anche se assenti oggi. I risultati invariati non vengono rifiutati perché riferiti a un’altra giornata. Lo storico giornaliero è mantenuto dal server e non può essere cancellato inviando un vecchio modulo. Le bozze e il controllo delle revisioni restano attivi.

Le rilevazioni conservano la data effettiva; statura e peso attuali seguono le misure cronologicamente più recenti, preservando i dati d’ingresso. Una continuazione non diventa un nuovo test di crescita. Le stazioni della seduta iniziale restano collegate al programma originario.

Il percorso test → seduta → appello → seduta → chiusura riapre il test con giornata, giocatore, esercizio, sezione e filtri. Anche l’indirizzo della pagina conserva la scheda aperta per il ritorno del browser.

“Test e crescita” è visibile nella sidebar dei profili autorizzati. Il mister consulta le proprie annate; le modifiche ai test richiedono il permesso dell’area preparatori anche nelle API. La card del cruscotto include le sessioni motorie oltre alle rilevazioni atletiche singole.

“Scarica PDF” genera il file senza richiedere la stampa. Dopo la generazione restano distinti il collegamento di download e quello di apertura/stampa. PDF ed Excel riportano le date di rilevazione. Le esportazioni giornaliere sono disponibili nello storico della sessione.

## Verifica

- Handler HTTP e database PostgreSQL isolato: continuazione su una seconda giornata, nuovo presente, conservazione dell’assente con risultati precedenti, rifiuto dell’appello di un’altra data, permesso del mister in sola lettura e misurazioni attuali.
- Regressioni delle bozze: recupero, conflitti, sincronizzazione, dati parziali e isolamento tra profili.
- Generatore PDF: paginazione, tabelle, note, accenti e valori pari a zero.
- Anteprima con dati sintetici: ritorno completo dalla seduta/appello alla scheda e verifica a 390 px senza debordamento orizzontale. Aggiunti casi CI a 390 e 1024 px; non sono un collaudo su telefono fisico.

Non è richiesta una migrazione distruttiva: i vecchi record rimangono leggibili. Le nuove date non ricostruiscono retroattivamente una giornata reale non registrata.
