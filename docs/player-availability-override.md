# Ambito della disponibilità forzata

Nella scheda giocatore, all'attivazione di Forza disponibilità, la scelta «Valida per» distingue:

- Solo allenamenti: la deroga temporanea consente le sedute, senza rendere il giocatore convocabile alle partite.
- Allenamenti e partite: mantiene il comportamento delle deroghe precedenti.

Le opzioni sono due radio sempre visibili, accanto al periodo e al motivo della deroga. Il riepilogo in sola lettura e le notifiche esistenti indicano l'ambito. Permessi di forzatura invariati; allenatori e altri ruoli senza facoltà di deroga non possono cambiarlo.

Campo persistente `availability_override_scope`, valori `training_only` e `training_and_matches`. Migrazione non distruttiva all'avvio, con default `training_and_matches` per i record precedenti; SQL disponibile in `lib/db/sql/player_availability_override_scope.sql`. Enum validato nelle richieste API.

La lista giocatori espone l'indisponibilità alle partite durante la deroga limitata agli allenamenti. Le sedute mantengono la gestione esistente della deroga e dell'appello. Le API rifiutano, con messaggio esplicito, la convocazione singola, il cambio di stato a convocato, il piano con quel giocatore e la pubblicazione dei convocati se la deroga solo allenamenti è valida alla data effettiva della gara (compreso un rinvio con nuova data). Nessuna cancellazione automatica di convocazioni o resoconti storici.

Verifiche: handler HTTP reali con PostgreSQL isolato, salvataggio e riapertura, accesso alla seduta, blocchi partita, enum non valido, ruoli non autorizzati, cambio di ambito e validità alla data gara; TypeScript librerie/API/frontend e build API/frontend. Nessuna modifica ai dati reali e nessuna attesa o verifica deploy.
