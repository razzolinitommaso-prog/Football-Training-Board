# Selezione convocati

## 20 novembre 2026 — Deselezione e riselezione

Nella vista compatta dei convocati, togliere una spunta nascondeva immediatamente il giocatore quando rimanevano altre selezioni. Alla prima modifica la lista ora passa alla vista completa, mantenendo visibile il giocatore per consentirne la riselezione prima del salvataggio.

Restano attivi i controlli di convocabilità, i permessi e la modalità di sola lettura. Non vengono modificati convocazioni o dati dei giocatori automaticamente.

## Controllo soglie e condotta

Verifica nell'accesso allenatore del 20 novembre: Piccoli Amici ha la regola 2 presenze su 2 allenamenti; Primi Calci 1° anno ha 1 su 2. Nella gara del 21 novembre contro Barberino, Joshua risulta con 1/2 presenze, condotta Buona e stato Convocabile.

La regola appartiene alla squadra della partita. La condotta considerata è l'ultima registrata nelle sue sedute valide, anche precedente alla settimana corrente; non serve una nuova valutazione in ogni appello. Nessuna condotta produce lo stato Da verificare; Insufficiente blocca. Le spunte già salvate non vengono cancellate automaticamente al cambiare dell'esito: deselezionare rimane possibile, riselezionare e pubblicare richiedono nuovamente l'idoneità corrente.

Estesi i test HTTP/PostgreSQL isolati con `--callup-rules`: regole 1/2 e 2/2 memorizzate per squadre distinte; buona condotta senza presenze sufficienti ancora bloccata; assenza di valutazioni da verificare; valutazione precedente valida e nuova Insufficiente che la sostituisce. Tutti superati. Nessuna modifica alle regole o alle convocazioni reali.

## Condotta non ancora registrata: opzione per annata

DT, DG e DS possono abilitare **Da verificare: consenti convocazione** nella modifica della regola. Buona e Ottima restano ammesse; Insufficiente resta sempre bloccante. L'opzione riguarda soltanto la mancanza di una condotta e non rende validi appelli incompleti, presenze sotto soglia o altre indisponibilità.

Il campo `allow_unrated_conduct` viene aggiunto in modo idempotente, con valore iniziale falso per mantenere le regole esistenti. API di lettura, anteprima, selezione e pubblicazione usano lo stesso valore per squadra. Un vecchio client che salva senza il campo mantiene la scelta già registrata. L'allenatore vede la regola ma non può modificarla.

Verifiche aggiuntive: valore booleano e permessi, persistenza, isolamento tra annate, attivazione e disattivazione, condotta Insufficiente sempre bloccata e presenze insufficienti non aggirabili. Test API/PostgreSQL superati. Verificato sul componente reale con dati simulati il percorso modifica, anteprima, salvataggio e riapertura. Typecheck API e frontend superati.

Verifica browser sul componente React reale con dati simulati: deselezione e riselezione di un giocatore, rimozione di tutte le selezioni e ripristino; giocatore non convocabile ancora disabilitato. Typecheck e build frontend superati; build con avvisi preesistenti sulle sourcemap e sulle dimensioni dei bundle.
