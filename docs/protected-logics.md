# Logiche protette

Questo documento elenca le logiche considerate stabili e protette. Qualsiasi modifica che tocchi direttamente o indirettamente queste aree richiede autorizzazione esplicita prima di procedere.

## Scheda giocatore: stato, disponibilita e assegnazioni

Stato: protetta dal 2026-10-07.

Ambito:
- pagina giocatori di Scuola Calcio, Settore Giovanile e Prima Squadra;
- salvataggio della scheda giocatore;
- stato giocatore, disponibilita, motivo indisponibilita e data rientro;
- squadra principale e squadra supplementare;
- ruolo generico, ruolo specifico e stato in formazione;
- permessi di modifica per segreteria, superiori e staff tecnico.

Regole protette:
- Se un giocatore viene impostato come disponibile, deve risultare `Disponibile / Attivo`.
- Se un giocatore viene impostato come `Sospeso`, `Infortunato`, `In attesa trasferimento` o `Inattivo`, deve risultare non disponibile con motivo coerente.
- Il salvataggio della scheda da segreteria o ruoli superiori deve preservare tutti i campi modificabili, inclusa la squadra supplementare.
- La squadra supplementare deve restare salvata dopo chiusura scheda, refresh pagina, filtro per squadra e cambio sezione.
- I ruoli non autorizzati non devono poter modificare campi non concessi.
- I ruoli autorizzati devono poter salvare i campi previsti senza perdere gli altri dati della scheda.

Procedura obbligatoria prima di modificare:
- verificare il comportamento attuale in UI o tramite payload;
- analizzare frontend e backend coinvolti;
- dichiarare se la modifica tocca questa logica protetta;
- chiedere autorizzazione esplicita se la modifica puo alterare una delle regole sopra;
- dopo la modifica, verificare almeno questi casi:
  - `Sospeso / Non disponibile` -> `Disponibile / Attivo`;
  - assegnazione o rimozione squadra supplementare;
  - salvataggio scheda da segreteria/superiore;
  - salvataggio limitato da staff tecnico, senza perdita di dati non modificabili.
