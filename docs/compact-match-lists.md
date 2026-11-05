# Elenchi partite compatti

La presentazione condivisa `CompactMatchHeading` / `CompactMatchDetails` uniforma gli elenchi operativi del calendario annata (allenatori, preparatori, direttori e ruoli amministrativi già autorizzati), la lista generica Partite, le partite Genitori e le convocazioni Dirigenti. Le pagine dei gironi LND conservano la propria visualizzazione del calendario e della classifica.

## Informazioni e azioni mantenute

| Informazione | Presentazione |
| --- | --- |
| Data, ora, squadre e risultato | Sempre visibili nell'intestazione compatta; nomi completi anche su mobile |
| Casa/trasferta, competizione e luogo | Metadati visibili quando presenti |
| Rinvio, data recupero e riferimento alla gara originale | Conservati nelle viste operative, senza cambiare la costruzione della cronologia |
| Convocati e disponibilità | Indicatori visibili solo nei ruoli che già ricevevano questi dati; la disponibilità dei genitori rimane riferita al proprio figlio |
| Note pre/post | Indicatori sintetici in elenco; testo completo, allegati e resoconto nei dettagli |
| Note d'importazione | Testo integrale nei dettagli della scheda operativa |
| Rosa, moduli, minutaggi e lavagna | Editor e controlli esistenti nella scheda aperta, con gli stessi permessi |
| Export convocazione | Menu rapido e pulsante originale nei dettagli; apertura dei dettagli per rendere visibile anche il successivo Scarica |
| Modifica data/luogo | Menu rapido per i ruoli già abilitati; editor originale conservato |
| Eliminazione | Azione nella scheda aperta e conferma originale, senza cambi di autorizzazione |
| Import/export calendario, duplicati, selezione multipla | Raccolti in pannelli apribili; Crea partita sempre raggiungibile quando prima consentito |
| Risultato nella lista generica | Valore visibile in intestazione, editor e salvataggio nei dettagli |
| Ritrovo, convocazione e confronto presenze/minuti per dirigenti | Contenuti originali nel dettaglio apribile |

## Interazioni

- Le righe iniziano chiuse per ridurre l'ingombro. I collegamenti diretti con openMatchId e la scheda singola incorporata mantengono l'apertura iniziale.
- I disclosure nativi mantengono i figli montati: chiudere una riga non azzera una bozza di data, luogo, risultato, disponibilità o nota. Non vengono inviati salvataggi durante apertura o chiusura.
- Apri scheda mantiene il comportamento operativo dell'allenatore; Dettagli e note consente anche la semplice lettura senza attivare l'editor del piano.
- La ricerca principale è sempre visibile e mantiene gli stessi criteri di filtraggio. Non apre automaticamente i filtri avanzati; questi conservano i controlli precedenti. La selezione multipla rende accessibili gli strumenti di gruppo.
- Riepiloghi delle fasi su due colonne su mobile, quattro su desktop; conteggi e descrizioni restano visibili.
- CSS basato sui colori del tema corrente. Nessuna tabella con scorrimento orizzontale aggiunta. In stampa il contenuto dei disclosure montati viene reso disponibile.

## Collaudo

Typecheck e build frontend. Verifica della build con risposte API fittizie locali: altezza delle righe, ricerca e azzeramento, selezione multipla, accesso all'importazione, dati e note complete, conferma/cancellazione dell'eliminazione, bozza di luogo mantenuta chiudendo e riaprendo, apertura diretta del piano allenatore, limiti della segreteria, disponibilità dei genitori e convocati dei dirigenti, editor del risultato generico, viewport desktop e mobile a 430px senza overflow della pagina.

Nessuna modifica alle API, ai payload, ai dati salvati o alle autorizzazioni. Il test non invia modifiche a partite reali.
