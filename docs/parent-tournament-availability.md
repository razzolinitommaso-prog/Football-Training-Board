# Disponibilità dei genitori per torneo

La card torneo dell’area genitori riunisce il programma per giornata e una sola risposta: **Disponibile** oppure **Non disponibile**. La risposta vale per tutte le giornate e tutte le gare del torneo, senza opzioni parziali. La convocazione del mister rimane un dato distinto.

## Ambito e conservazione

- GET/PATCH `/api/parent/tournaments` usa esclusivamente società e figlio della sessione genitore, con la squadra attuale del figlio. Non accetta un altro giocatore o società dal corpo della richiesta.
- Il torneo condiviso è identificato dal suo ID stabile. I tornei precedenti sono raggruppati per squadra, stagione e nome della competizione, senza usare gli alias delle società.
- Il programma dei tornei condivisi proviene dallo stato salvato della sola annata. Le gare operative sono riconosciute tramite il collegamento autorevole `entry_id`; una gara di un’altra società allo stesso orario non diventa una convocazione del figlio.
- Una risposta canonica per società/squadra/figlio/torneo è conservata in `parent_tournament_availability`. È replicata nei soli campi di disponibilità genitore delle `call_ups` collegate, per mantenere compatibili i consumatori dello staff. Il campo `status` della convocazione non viene cambiato.
- Il salvataggio della risposta e delle repliche è transazionale. Il programma condiviso e la risposta serializzano le scritture sulla stessa squadra; una gara aggiunta successivamente eredita la risposta già registrata.
- La singola API di disponibilità partita rifiuta aggiornamenti isolati su una gara di torneo e rimanda alla card torneo. Le partite singole e gli allenamenti mantengono il comportamento precedente.
- Le precedenti risposte sulle singole gare vengono conservate: la card segnala che occorre confermare una risposta unica, senza inventare un consenso di torneo.

Il termine è il mercoledì precedente la prima giornata del programma, alle 23:59 in Europa/Roma, anche attraversando mesi, anni e ora legale. È una sola scadenza per tutto il torneo. Il motivo è richiesto per l’indisponibilità; per “Altro” serve la motivazione.

## Interfaccia

Le card dei tornei futuri e quelli della data selezionata sono nella sezione “Tornei della squadra” del Calendario generale. Il calendario evidenzia anche le giornate dei programmi che non rientrano nelle prime 50 gare caricate. Il programma è apribile per giornata; i dettagli delle gare conservano convocazione, ritrovo e minuti senza mostrare altri comandi di disponibilità. Errori e attesa di caricamento sono visibili. Il programma completo può contenere anche gare fra altre società e finali ancora da assegnare.

## Verifiche ripetibili

`node scripts/test-parent-tournament-availability.cjs <percorso-@electric-sql/pglite>` esegue le route vere su PostgreSQL isolato: ambiti di società/figlio/squadra, rifiuto di stati parziali, risposta su più giornate, conservazione della convocazione, nuova gara, tornei precedenti, scadenza e rollback. La contesa degli advisory lock non è simulata.

`node scripts/test-parent-tournament-ui.cjs` verifica il Calendario genitori reale con API simulate: una card, programma su più giorni, due stati, assenza di comandi per gara interna, risposta ritrovata dopo ricaricamento, errore di salvataggio visibile e layout desktop/mobile.

`node scripts/test-shared-tournaments.cjs <percorso-@electric-sql/pglite>` mantiene le regressioni di programmi multiannata, gare preparate, revisioni, documenti e cancellazione globale.

Il mockup per popup e ricevute delle notifiche è una proposta separata in attesa di approvazione; questo intervento non lo implementa.
