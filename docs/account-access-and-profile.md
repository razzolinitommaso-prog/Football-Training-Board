# Accessi e profilo personale

La pagina pubblica della società offre un accesso diretto per genitori e uno per membri. Gli accessi per settore restano disponibili per lo staff. L’accesso membri usa la società indicata nel link e i permessi già assegnati. Il percorso con i codici per i genitori esistenti rimane disponibile da `/parent/login`.

## Inviti e recupero

- Il link di attivazione dura 48 ore e può essere usato una volta. La password viene scelta dal destinatario. Gli inviti a un nuovo club per un membro con un account FTB già attivo conservano le sue credenziali.
- I nuovi delegati con recapito valido ricevono l’invito al salvataggio. Un operatore autorizzato può inviare o reinviare dalla scheda giocatore. Dopo l’attivazione il delegato usa il nuovo accesso. In caso di reset, la segreteria può ripristinare il percorso con codice e inviare un nuovo invito.
- Per email si riusa la configurazione SMTP esistente. Impostare `PUBLIC_APP_URL` sull’indirizzo pubblico del frontend statico. Se il recapito o il servizio di invio non funziona, l’app mostra che occorre riprovare.
- Per SMS configurare `ACTIVATION_SMS_WEBHOOK_URL` (HTTPS) e `ACTIVATION_SMS_WEBHOOK_TOKEN`. Il gateway riceve un POST autenticato Bearer con JSON `{ "to": "+39…", "message": "…" }`. Un esito HTTP 2xx conferma la presa in carico del gateway. Serve un numero con prefisso internazionale.
- Per un recapito condiviso fra più deleghe nella stessa società, gli accessi rimangono distinti e richiedono password diverse. Le informazioni mostrate continuano a seguire il legame già autorizzato.

## Profilo

Dal proprio avatar si raggiungono i dati personali, il cambio password, le sessioni registrate sul server e le preferenze di tema e caratteri sul dispositivo. Per i genitori c’è un collegamento ai pagamenti dei figli abilitati. I movimenti amministrativi della società restano nell’area autorizzata. Le password degli accessi a codice esistenti si gestiscono dal collegamento alla chiave personale.
