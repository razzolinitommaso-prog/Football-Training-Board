# Società collegate, posizioni giocatori e compensi Prima Squadra

## Percorsi disponibili

- **Società e incarichi**, sotto l'intestazione: gruppo, società, accessi espliciti per membro/ruolo/società/settori, esoneri motivati e riepilogo. I profili operativi vedono solo le proprie scelte di società/ruolo e non ricevono automaticamente permessi amministrativi.
- **Scheda giocatore → Posizione e archivio**: attivo, ritiro con possibile rientro, mancato rinnovo, trasferimento ad altra società, ritiro definitivo; decorrenza, motivo obbligatorio, conferma e controllo revisione. Non cancellare il giocatore per archiviarlo.
- **Transizione stagionale**: Tutti, Rosa attiva, Possibili rientri; i definitivi non sono proposti. Stato e scheda giocatore si aggiornano sulla stagione attiva. Gli stati di stagioni future diventano operativi soltanto all'attivazione della stagione. Il rientro resta esplicito.
- **Prima Squadra**: scheda dimostrativa creata una sola volta per società al primo accesso all'area di Presidente/Amministratore/DG/Segreteria. Collegamento diretto al giocatore TEST, escluso dalle rose attive, dai conteggi/previsioni e dalle uscite reali; le rate di prova sono visibili dentro la scheda test.
- **Scheda giocatore Prima Squadra → Contratti e compensi**: accordi, periodo, compenso/rimborso, mensile/totale, rate, FM, documenti, ricevute e pagamenti parziali. Riutilizzati validazione economica, calcoli in centesimi e componenti dei membri; persistenza separata per giocatore, senza account fittizi.
- **Pagamenti**: nuovo registro compensi giocatori Prima Squadra; uscite reali senior e membri insieme nel grafico, con identità distinte. I filtri specifici degli incassi mantengono la lettura esistente.
- **Squadre**: più squadre nella sezione Prima Squadra; disciplina calcio a 11/calcio a 5/altra e ambito maschile/femminile/misto separati dalla categoria. Ampliate categorie suggerite. Competizioni e gironi rimangono nel modulo campionati esistente. Non modificate logiche di parser e alias.

## Regole dei conteggi

Attivo nella società e disponibile sono concetti separati. Infortuni, certificato, pagamento, condotta e altri blocchi temporanei non archiviano il giocatore. Gli archiviati sono esclusi dalle rose operative, dalle liste squadra e dalle nuove convocazioni, ma rimangono nell'anagrafica e nello storico. Gli archivi stagionali JSON includono anche gli archiviati, compresi i definitivi; il formato preesistente non rappresenta un backup integrale di tutti gli allegati e registri.

La card Giocatori presenta anagrafiche totali, attivi con indisponibili temporanei, archiviati con possibili rientri e definitivi. Ogni ID giocatore conta una volta nel perimetro selezionato. La stima KIT e le somme future della previsione annuale escludono archiviati, prove, TEST e non tesserati. Gli incassi reali e le somme già dovute rimangono nel registro; non si estingue un debito cambiando stato. Nel gruppo si riepilogano le associazioni per società: non si presume che ID diversi nelle diverse società siano la stessa persona.

## Incarichi ed esoneri

Nuove voci: magazziniere, manutentore, custode/responsabile impianto, autista, fisioterapista/massaggiatore, medico sociale, comunicazione/stampa, organizzazione eventi, responsabile amministrativo e altro incarico. I contratti possono descrivere questi incarichi senza ampliare l'autenticazione. Un profilo operativo privo di altri accessi non riceve dati sportivi/amministrativi.

L'esonero è per società e ruolo, con data e motivazione, autore e audit. Blocca le richieste successive di quel profilo, anche da una sessione già aperta; altri ruoli e società restano indipendenti. Login/logout rimangono possibili per passare a un profilo valido. Ripristino esplicito con motivazione. Gli accordi economici non vengono annullati dall'esonero: una revisione economica resta separata. Quote già pagate sono immutabili secondo le regole dei registri membri.

## Società e accessi

Le società conservano club ID, dati fiscali, tesseramenti, squadre, contabilità e magazzini propri. Il gruppo non crea una nuova identità fiscale e non copia tesseramenti o movimenti tra società. Presidente/Amministratore crea il gruppo; il suo gestore può creare nuove società e collegare società esistenti soltanto se è Presidente/Amministratore anche lì. Non si auto-collegano società omonime.

Le abilitazioni aggiungono/aggiornano un ruolo nelle società e nei settori selezionati. Un ruolo precedentemente esonerato si ripristina dall'operazione esplicita sugli incarichi; non basta una nuova assegnazione di settori. Revoca per società/ruolo tramite esonero e ripristino tracciati. Il gestore del gruppo è un'abilitazione distinta; riepiloghi economici limitati alle società dove l'utente possiede un profilo amministrativo valido. Non basta essere amministratore di una sola società per leggere le altre.

Il cambio società verifica l'associazione, aggiorna sessione/token, cancella le query in memoria e ricarica il contesto. Prima del cambio viene chiesto di salvare le modifiche aperte. Ogni scrittura continua a operare su una singola società. Non sono stati creati gruppi o concessi nuovi accessi su dati reali durante lo sviluppo.

## Persistenza e collaudo

Dal 21/11 è disponibile anche un backup distinto di tutti i dati della società e degli allegati conservati nel database, con manifesto e verifica d'integrità: [backup e collaudo](club-backup-and-prelaunch-followup.md). L'export JSON della singola stagione conserva il suo formato precedente.

Migrazioni additive al primo accesso autenticato, con advisory lock: tabelle gruppo, collegamenti, gestori, esoneri, posizioni e audit; campo `players.is_test` e campi disciplina/ambito sulle squadre. Riconciliazione dei soli stati espliciti di uscita presenti nella transizione attiva, senza archiviare i semplici problemi amministrativi. Registri compensi senior separati `player_finance_*`, revisioni e idempotenza dei pagamenti. Nessuna cancellazione o trasferimento massivo di dati esistenti.

Suite HTTP con PostgreSQL isolato:

```powershell
node scripts/test-match-rotation-access.cjs <percorso-assoluto-PGlite> --member-services --withdrawals --societies
node scripts/test-match-rotation-access.cjs <percorso-assoluto-PGlite> --member-services
node scripts/test-match-rotation-access.cjs <percorso-assoluto-PGlite> --withdrawals
node scripts/test-match-rotation-access.cjs <percorso-assoluto-PGlite> --payment-desk
```

Controlli di tipo librerie/server/frontend e build server/frontend; verifica browser dei componenti reali con dati simulati, desktop e telefono. Il programma generale di collaudo responsive è distinto e rimane nel Capitolo 9 del libro. Nessuna attesa o verifica del deploy.
