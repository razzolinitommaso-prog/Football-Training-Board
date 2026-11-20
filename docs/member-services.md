# Membri: presenze, incarichi, uscite e KIT

## Accesso e punti di ingresso

Aggiornamento responsive: nelle card è disponibile **Contratti e compensi**, che apre direttamente Ruoli e contratti. Dettagli e collaudi in [responsive-layout.md](responsive-layout.md). Le squadre senza stagione esplicita sono proponibili nella sola stagione attiva, senza modificarne i dati.

- **Presenze → Membri · allenamenti e partite**: Presidente/Amministratore, DG, DS, DT e Segreteria. Appelli distinti da quelli dei giocatori, una riga per persona/evento anche con più ruoli. Filtri mese, settore, annata, allenamento/partita e membro/ruolo; riepilogo ed esportazioni Excel/PDF.
- **Membri → Scheda membro**: dati, certificato e allegati, incarichi, piano uscite e dotazione. Gli incarichi professionali non creano profili di accesso né ampliano i permessi di autenticazione.
- **Pagamenti → Compensi e rimborsi membri**: piano, pagamenti parziali, ricevute, ricerca, mese di competenza e stato. Scheda membro raggiungibile da ogni rata.
- **Magazzino abbigliamento → Richieste KIT membri**: elenco delle richieste con ordine, arrivo, consegna e storico, sullo stesso inventario usato per i giocatori.

Presidente/Amministratore, DG e Segreteria possono leggere/modificare dati economici e contratti. DS/DT leggono gli incarichi senza importi/contratti/ricevute economiche e registrano presenze. La gestione KIT e le variazioni di magazzino restano riservate alla Segreteria. Genitori e ruoli operativi non accedono alle nuove API amministrative. I genitori senza incarichi societari non sono membri del registro.

## Incarichi e calcoli

Ogni membro può avere più incarichi, ciascuno con ruolo, stagione, periodo da/a mese, contratto volontario/a compenso annuale/altro, compenso e rimborso separati, importi mensili o totali, note e documento. Per un volontario il compenso è zero; il rimborso resta separato. Gli importi sono interi in centesimi, visualizzati con separatore delle migliaia italiano anche per quattro cifre.

L'assegnazione alle annate ripartisce il costo con percentuali che devono sommare 100%; senza assegnazioni il costo è trasversale. Le somme per annata e il totale del membro derivano dalle rate registrate. Gli importi totali si dividono per i mesi, con l'eventuale resto sull'ultimo mese; anche le ripartizioni conservano esattamente il totale in centesimi.

Convenzione approvata **30/60/90 gg FM**: competenza settembre → scadenza 31 ottobre/30 novembre/31 dicembre. Si usa la fine del primo/secondo/terzo mese successivo, comprese le date bisestili. Il termine ultimo è calcolato e modificabile; non può precedere la scadenza dell'ultima rata. Il periodo rientra nella stagione selezionata.

Il salvataggio dell'incarico genera/aggiorna una sola rata per mese/contratto, senza duplicazioni. Le rate con un pagamento, anche parziale, conservano importi, componenti, scadenza, ripartizione e identità dell'incarico. Un accordo successivo richiede un nuovo incarico dalla nuova decorrenza; disattivare l'accordo annulla solo le rate prive di versamenti e conserva lo storico pagato. Revisioni ottimistiche bloccano salvataggi da schede obsolete.

## Pagamenti e grafico

Ogni uscita registra data effettiva, importo, metodo, note e ricevuta. Importo positivo, non superiore al residuo e data non futura. Una rata con rimborso richiede un giustificativo. Identificativi univoci e blocchi transazionali impediscono duplicati da ripetizione della richiesta e sovrapagamenti. Le ricevute registrate restano nello storico.

Nel registro/grafico i pagamenti membri hanno valori **negativi**, alla data effettiva. Il residuo è distinto tra da pagare e scaduto e segue la data di scadenza. Le somme incassi giocatori conservano il significato precedente. Il filtro annata applica la ripartizione del contratto, usando differenze sui pagamenti cumulativi per conservare i centesimi anche con acconti molto piccoli. I filtri giocatore/categoria/stato/metodo mantengono una lettura solo degli incassi giocatori; un controllo esplicito permette di nascondere le uscite. Nel dettaglio orario le uscite senza orario sono segnalate ed escluse, senza inventare un'ora.

## Presenze

Si riusano gli eventi allenamento e partita esistenti, con data effettiva delle gare rinviate. Le sedute condivise sono ricondotte a tutte le annate collegate. Nessuna presenza viene dedotta automaticamente dai compensi o dai ruoli: presente, assente e da registrare restano stati espliciti. Le revisioni conservate anche cancellando uno stato impediscono sovrascritture da appelli obsoleti. Il cambio filtri/evento e l'uscita dalla vista membri chiedono conferma se ci sono modifiche non salvate; la chiusura della pagina attiva l'avviso del browser.

## KIT e magazzino

Dotazione unica personale, non duplicata per incarico. Nessun articolo GARA. Allenatori, preparatori, responsabile preparatori, DT e DS: allenamento e rappresentanza; dirigenti: rappresentanza; altri ruoli ammessi: rappresentanza, con allenamento solo se presente un incarico sportivo abilitato. Presidente/Amministratore e Segreteria sono esclusi da nuove dotazioni anche se hanno altri ruoli. Il cambio ruolo conserva le consegne passate.

Si selezionano articolo/taglia dal catalogo, quantità, poi si richiede al magazzino. I pezzi disponibili vengono riservati, il resto è da ordinare. Arrivo: aumenta giacenza e riserva; consegna con conferma: scarica entrambe una sola volta; annullamento: libera la riserva e mantiene il record. Una nuova dotazione dello stesso articolo richiede un ciclo esplicito, preservando le consegne precedenti. Stati pagato e consegnato rimangono indipendenti.

## Persistenza e collaudo

`member-storage.ts` crea in modo additivo e transazionale le tabelle `member_profiles`, `member_contracts`, `member_dues`, `member_expense_receipts`, `member_documents`, `member_attendances`, `member_kit_rows`, `member_kit_requests` e `member_service_audit`. Inizializzazione al primo accesso autorizzato con advisory lock; nessuna cancellazione/migrazione dei dati giocatori o delle loro richieste KIT. Gli allegati sono persistenti e verificati per proprietà, tipologia e limite 8 MB. Gli interventi registrano autore e prima/dopo nell'audit.

Test: `scripts/test-match-rotation-access.cjs <percorso PGlite> --member-services` esercita gli handler HTTP reali con PostgreSQL isolato e autenticazione simulata; include permessi, isolamento società, più ruoli, centesimi/FM, rate, ricevute, documenti, revisioni appelli, KIT/scorte e idempotenza. Regressione separata `--payment-desk` per il flusso giocatori già presente. TypeScript librerie/API/frontend e build web/API; controllo browser dei componenti reali con dati simulati su telefono e desktop. Nessuna modifica ai dati reali per i test; nessuna attesa/verifica deploy.
