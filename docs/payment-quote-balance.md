# Saldo quote dal registro Pagamenti

21 novembre 2026.

La Segreteria può scegliere **Aggiungi voce → Saldo quote**, oppure il pulsante diretto **Saldo quote** nel riepilogo del giocatore. Il pannello mostra l'importo residuo, le voci incluse, data, orario facoltativo e metodo di incasso. Il salvataggio riusa `/player-payments/settle`: aggiorna le rate già esistenti, senza creare un nuovo addebito o duplicare la quota annuale.

Sono incluse le quote aperte (iscrizione, annuale, assicurazione) e le rate del piano totale; gli acconti del piano e le voci pagate sono esclusi. Kit, pulmino ed Extra Time registrati separatamente restano da incassare. Un piano totale già aggregato viene saldato per le sue rate esistenti, senza ridistribuirne la composizione.

Il comando generale **Incassa tutto il residuo** rimane disponibile per includere tutti i debiti aperti. Se non ci sono quote residue, il pannello impedisce il salvataggio e invita a registrare il piano quando mancante. La conferma dell'operazione appare nel riepilogo. Registro e scheda giocatore condividono il componente e gli stessi record; le cache vengono aggiornate dopo l'incasso.

Verifiche: regressione `--payment-desk` con HTTP/PostgreSQL isolato; importi corretti, nessun nuovo record al saldo, voci estranee ancora aperte, piano globale incluso, incassi già effettuati esclusi. Typecheck e build frontend superati. Browser sul componente reale con dati simulati: selezione dal menu, riepilogo 205 euro (180 annuale + 25 assicurazione), metodo obbligatorio, salvataggio e conferma; kit 67 euro rimasto aperto; nuovo saldo zero non registrabile. Nessun incasso reale eseguito.
