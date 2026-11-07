# Registro presenze e minutaggi

Il confronto offre filtri per settimana o stagione, annata, giocatore e stato, con ordinamento. I conteggi seguono i filtri. Le percentuali usano gli appelli registrati. Il dettaglio settimanale conserva gli eventi, i collegamenti all’appello per i ruoli abilitati e l’esportazione CSV o PDF. La vista mobile mostra i totali per giocatore senza scorrimento laterale.

Il dirigente ha accesso in sola lettura per le annate assegnate. La rosa corrente include i partecipanti al programma congiunto attivo nella stessa società, stagione e settore. Il registro storico rispetta i partecipanti salvati nelle singole sedute. Un allenamento congiunto non estende i permessi sulle gare autonome delle altre annate. Le famiglie ricevono soltanto i dati del figlio.

Il riepilogo usa le convocazioni salvate. Le gare di un’altra annata autorizzata nello stesso settore e stagione compaiono nello staff quando vi è convocato un giocatore della rosa considerata. Il minutaggio previsto deriva dallo schieramento. Quello effettivo deriva dal resoconto valido, anche se salvato nel vecchio formato. Il valore mancante rimane distinto da zero.

Il collaudo HTTP isolato in PostgreSQL copre accessi, rosa congiunta corrente e storica, chiamate duplicate, disponibilità, partite fuori ambito e minutaggi previsti ed effettivi.
