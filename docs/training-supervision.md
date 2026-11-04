# Quadro annata e valutazioni del direttore tecnico

Nelle pagine **Sedute del mister** e **Linee guida sedute**, il direttore tecnico vede un riepilogo prima dell'elenco. Settore e annata seguono la selezione condivisa; il periodo iniziale va dal 1 luglio al 30 giugno della stagione corrente ed è modificabile. I contatori sono indipendenti dalla ricerca testuale nell'elenco.

## Significato dei dati

- Le sedute registrate sono schede operative salvate, comprese quelle future; le annullate non entrano negli indicatori. Non rappresentano un controllo dell'esistenza di tutti gli appuntamenti dell'orario.
- Complete: stazioni con titolo presenti nelle tre fasi, secondo la regola già usata dal calendario. Da impostare: bozza automatica senza stazioni, obiettivo o descrizione. Le altre sono da completare; preparazione mancante resta non rilevabile.
- La continuità di compilazione è la quota delle sedute già terminate oggi complete. Usa la durata della seduta, non penalizza le future e non dimostra che la preparazione fosse pronta prima dell'inizio. L'assenza di uno storico completo è dichiarata, senza attribuzioni retroattive ai tecnici.
- Appello senza stazioni: almeno una registrazione nella tabella presenze, senza stazioni collegate, su una seduta trascorsa. Non equivale a una prova di mancato lavoro del mister.
- Staff: incarichi correnti della società per le squadre selezionate, inclusi coachId e assegnazioni; il creatore della scheda è indicato separatamente. Gli incarichi correnti non ricostruiscono le responsabilità storiche.
- Linee guida adottate: una stazione copiata con sourceExerciseId è collegata a una seduta operativa non annullata. Il numero in riepilogo conta le proposte che hanno almeno un utilizzo; la card indica le sedute destinatarie distinte. L'adozione è facoltativa e non genera penalizzazioni.
- Direttive in riepilogo: inviate nel periodo ad almeno un componente dello staff corrente. La scheda Direttive conserva l'elenco della società nel periodo per non nascondere invii storici a personale non più assegnato. Lettura ed esecuzione non hanno una traccia affidabile e non vengono dichiarate avvenute.

## Valutazione tecnica

Quattro criteri manuali, ciascuno da 1 a 4 o Non valutato: coerenza, organizzazione, adeguatezza e progressione. Sono disponibili osservazioni fino a 2000 caratteri. Non esistono voto automatico, media complessiva o graduatoria dei mister. La valutazione resta riservata al direttore tecnico; non è esposta alle famiglie o ai dirigenti.

I dati risiedono in `training_session_reviews`, separati dalla seduta operativa, con autore e data dell'ultima valutazione. L'endpoint PUT verifica ruolo, società, settore della squadra e natura operativa della seduta. Un confronto su expectedUpdatedAt evita sovrascritture concorrenti. Una firma dei contenuti rilevanti e del piano rileva variazioni successive della preparazione: la valutazione resta leggibile ma compare Da riverificare e non conta fra quelle attuali. Non è un registro completo delle precedenti revisioni.

## Compatibilità e collaudo

Nessun dato operativo, presenza, proposta o stazione esistente viene modificato dal riepilogo. La tabella aggiuntiva è dichiarata nello schema Drizzle e creata in modo idempotente al primo accesso, come le tabelle dei piani esistenti. Le API restanti mantengono le autorizzazioni precedenti. Le card TD usano il riepilogo di preparazione già disponibile, evitando una nuova richiesta di esercizi per ogni card.

Test HTTP su PostgreSQL isolato: accesso per ruolo/società/settore, incarichi, appelli, prove di adozione, criteri nullable, rifiuto di punteggi fuori scala e scritture concorrenti, persistenza e variazioni dopo una valutazione. Test UI della build con dati dimostrativi: conteggi, separazione fra operative e proposte, tab direttive, dialogo valutazione e viewport desktop/mobile a 430px senza overflow orizzontale. Nessun dato reale viene scritto nel collaudo.

## Sedute da assegnare e accesso ai campionati

Le sedute operative con teamId nullo non rappresentano una squadra: nel calendario condiviso sono raccolte nel cassetto **Sedute da assegnare**, con conteggio, date di tutti i mesi e apertura della scheda secondo i permessi esistenti. Sono escluse dall'elenco e dagli indicatori delle annate nella pagina TD. Non vengono eliminate né attribuite automaticamente; le proposte tipo senza annata non entrano nel cassetto operativo.

Il menu TD include **Campionati e classifiche** (`/technical/championships`). La pagina riutilizza SectionChampionshipsPage per Settore Giovanile e Prima Squadra, seguendo settore e annata della selezione condivisa. Per Scuola Calcio rimanda al programma delle partite senza introdurre classifiche LND. Risultati, classifica ufficiale, cassetto provvisorio FTB e collegamenti alle schede partita restano quelli esistenti.

**Apri fonte LND** apre il collegamento HTTPS LND salvato per il campionato selezionato. **Sincronizza LND** mantiene il flusso di anteprima e conferma già esistente, con URL precompilato; passando a un altro campionato la finestra viene ricreata per non riutilizzare il link precedente. Non cambia la logica di importazione, associazione o aggiornamento sul server e non parte alcuna sincronizzazione automatica.
