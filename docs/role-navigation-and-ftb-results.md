# Menu amministrativi, calendario federale e risultati FTB

## Accesso dei membri

Il login cercava l'email normalizzata in minuscolo con uguaglianza sensibile al caso, mentre i membri storici possono avere email salvate con maiuscole. La ricerca ora ignora il caso, senza cambiare password, ruolo o assegnazioni. Se esistono duplicati storici che differiscono solo per maiuscole, mantiene la precedenza del record canonico già usato dal vecchio login; senza un record canonico e con più candidati rifiuta l'accesso, evitando di scegliere un account arbitrario.

Il collaudo HTTP usa un account fittizio DS con email maiuscola. Verifica accessi SC/SG/PS e rifiuto di password, area e società errate. L'accesso dell'account reale richiede la pubblicazione del backend aggiornato e una successiva verifica live.

## Navigazione per ruolo

- Presidente: omette Sedute Allenamento e Stazioni dai menu di settore; conserva Convocazioni e le altre voci.
- Segreteria: omette Squadre, Partite, Presenze e Campionati dai menu di settore; conserva Giocatori e Stagioni. La voce Programmazione gare porta alla gestione esistente dei calendari FTB per annata, inclusi tornei e amichevoli.
- La card Campionato del cruscotto della segreteria apre Programmazione gare. DT/DS mantengono la pagina LND.
- Campionati presenta ai ruoli gestionali il collegamento Calendario FTB / Importa PDF: con annata selezionata apre direttamente il calendario e i suoi strumenti di importazione, altrimenti apre la selezione delle annate.

Sono modifiche ai collegamenti e alla presentazione; non revocano le autorizzazioni backend già esistenti né cancellano pagine o dati. Restano validi i vincoli di settore/società dei percorsi e dei servizi esistenti. Non sono stati modificati parser PDF, importazioni, convocazioni o schieramenti.

## Classifica provvisoria

Il calcolo precedente ignorava `linkedResult`. Ora usa gli stessi criteri conservativi di riconoscimento delle partite già usati dal frontend, spostati in una funzione condivisa. Le letture dei candidati sono circoscritte alla società e ai settori dei campionati richiesti. I collegamenti riconosciuti non vengono salvati automaticamente.

Nella sola classifica provvisoria, un risultato numerico valido di una scheda FTB può integrare un risultato mancante del calendario. Un risultato già salvato e discordante viene mantenuto e segnalato come da verificare. Sono esclusi risultati futuri, incompleti e non validi. Se i record di gare giocate/vittorie/pareggi/sconfitte coincidono, restano i punti ufficiali, comprese eventuali rettifiche.

Il cassetto FTB riporta quanti risultati sono integrati e quanti discordanti. Il calendario e la classifica LND salvati non vengono sovrascritti. Il calcolo richiede i risultati delle altre squadre del girone: le sole gare del club non bastano a ricostruire un'intera classifica. Non viene creata una seconda copia del campionato.

## Verifiche

- Typecheck librerie, frontend e backend; build frontend.
- Test HTTP con PGlite: login maiuscolo e controlli di accesso; integrazione risultati, ambiguità, altra società, altra stagione, date future, conflitti e punti ufficiali rettificati; nessuna scrittura di risultati, collegamenti o classifica ufficiale durante la lettura.
- Browser isolato sulla build reale con dati fittizi: menu Presidente/Segreteria, Stagioni conservate, percorso Programmazione gare → calendario → PDF, collegamento DT da Campionati, layout a 430 px. Nessun inserimento o importazione di dati di produzione.

Commit locale, push e deploy sono operazioni distinte. Nessun push automatico previsto in questa modifica.
