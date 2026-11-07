# Tempi partita: salvataggio, terzo diviso e alternanza

La modifica conserva i contenuti del quarto tempo, i minuti personalizzati e l'ordine dei periodi quando si riapre una scheda. I valori predefiniti vengono usati per i dati mancanti. Titolari, riserve, posizioni, disegni, alternative e riferimenti alla lavagna rimangono nel piano.

## Scuola Calcio

Con quarto tempo attivo si pianificano quattro tempi completi. Senza quarto, il terzo ha una prima e una seconda parte, con liste e anteprime proprie. Le due parti sommano i minuti totali del terzo; la durata della prima parte è modificabile e la seconda si ricava per differenza. Le identità operative restano t1/t2/t3/t4: la seconda parte è annidata nel terzo, senza inventare un quinto tempo.

Durata e alternanza permette di cambiare i minuti dei tempi e mostra i minuti previsti per ciascun convocato. Sono una previsione: i dati effettivi rimangono nel resoconto.

La compilazione automatica considera tutta la sequenza attiva. Dà precedenza a chi riposa nel segmento precedente e, a parità, a chi ha meno minuti previsti; considera i portieri per i formati che li prevedono. Gestisce anche rose dispari e formati diversi tra i tempi. Non promette un minutaggio identico quando durate, numero di convocati, ruoli o scelte manuali non lo consentono.

## Confronto compatto e scelte individuali — novembre 2026

La scheda mette il ritrovo prima dei convocati; il confronto resta aperto, con minuti previsti, tempi equivalenti e differenza fra minimo e massimo nel riepilogo autorizzato. Desktop: anteprime accanto alla tabella. Mobile: nome, segmenti e minuti sulla stessa riga senza scorrimento laterale; tempi equivalenti e totale effettivo sotto al nome. I minuti effettivi per segmento restano nelle celle quando esiste un resoconto. Famiglia: esclusivamente le righe del proprio figlio, come prima; dirigente: rosa già autorizzata. Nessun ampliamento dei permessi.

Nella Scuola Calcio, un tocco nel confronto fissa solo quella cella tramite `rotationLocks` (T/P), mantenuta nel piano JSON esistente. Le altre assegnazioni automatiche si riequilibrano subito. Dopo la compilazione iniziale si applicano scambi deterministici limitati, che riducono prima lo scarto di minuti, poi lo sbilanciamento complessivo e infine le ripetizioni consecutive, senza cambiare capacità, portieri o vincoli. Non è una ricerca esaustiva di tutte le combinazioni. Esempio verificato: otto bambini, cinque in campo, tre tempi da dodici minuti con terzo diviso: scarto di sei minuti. Scelte incompatibili con posti/portieri rifiutate con messaggio, senza modificare il piano.

Le formazioni manuali già salvate e quelle applicate dalle alternative restano protette. `Libera scelte fissate` libera i vincoli individuali; `Calcola tempi successivi` mantiene la prima formazione e richiede conferma per sostituire quelle successive. Alternative, editor completo e lavagna rimangono sotto al confronto. Applicare una formazione dalla lavagna o dalle alternative elimina i vincoli individuali del solo tempo interessato. Settore Giovanile/Prima Squadra mantengono l'assegnazione manuale preesistente. Nessun ricalcolo riscrive il resoconto effettivo.

## Ordine e colori delle schede

Nelle liste comuni: prossima gara disputabile in testa, poi le altre future in ordine cronologico; nella pagina annata, storico e rinvii richiudibili (aperti se si cerca una partita con filtri o collegamento diretto). Risultati, annullamenti e date originarie dei rinvii non vengono trattati come prossima gara. Le gare di recupero usano la data effettiva.

Grigio: nessuna preparazione; arancione: preparazione parziale; verde: ritrovo valido e tutti i segmenti con i titolari richiesti. La data passata o il risultato non rendono completa una preparazione. Il calcolo condiviso viene usato anche per l'etichetta pubblica delle famiglie e dei dirigenti: si trasmette soltanto l'enumerazione, non il piano tecnico. Nessuna migrazione o modifica automatica dei dati del club.

Le selezioni modificate manualmente, comprese quelle salvate dalla lavagna, sono protette. Ricalcola alternanza richiede conferma e rigenera dal secondo segmento in avanti mantenendo la prima formazione. È il comando da usare per rigenerare piani precedenti già compilati: le scelte salvate senza il nuovo marcatore vengono conservate prudentemente come manuali.

Disabilitare il quarto conserva la sua preparazione come dato non attivo, ripristinabile riabilitandolo; la seconda parte del terzo rimane conservata quando si passa a quattro tempi. Nessun minuto del segmento non attivo entra nei totali.

## Resoconto e compatibilità

La creazione di un nuovo resoconto precompila i cambi tra le due parti del terzo al minuto corrispondente, mantenendo tre periodi effettivi. I minuti calcolati dall'analisi del resoconto coincidono con quelli previsti dal piano nel caso automatico verificato. Schieramenti parziali incoerenti vanno completati prima della generazione: non si inventano ingressi senza uscita.

I resoconti esistenti non vengono rigenerati. Abilitando il quarto si può aggiungere un periodo vuoto al resoconto senza alterare gol o cambi precedenti; disabilitarlo viene bloccato se contiene già dati effettivi. Il mister deve correggerli esplicitamente prima della rimozione.

Il server conserva le nuove informazioni annidate se un client precedente le omette. Nessuna migrazione del database: il piano usa il campo JSON esistente. I normali piani a due tempi del settore giovanile/prima squadra mantengono il percorso precedente. La seconda parte ha anteprima e lavagna proprie; non usa né sovrascrive il riferimento del primo segmento.

## Verifiche

node scripts/test-match-period-rotation.cjs esegue il codice effettivo dei calcoli, la ricostruzione del piano estratta via AST, la protezione server estratta via AST e l'analisi effettiva del resoconto. Non importa credenziali o sessioni e non scrive dati reali.

Provati: riapertura con quarto/minuti/posizioni/alternative salvati; ordine personalizzato; terzo in 6+6 e 4+8; quattro tempi completi; totali dei minuti; stabilità di ricalcoli ripetuti; rose dispari; portieri; scelte manuali e panchina esplicitamente vuota; rimozione di un convocato da tutti i segmenti; conservazione delle preparazioni non attive; cambi a metà del terzo coerenti con il resoconto; quarto con dati effettivi non eliminabile; client precedenti; due tempi esistenti.

Typecheck frontend/API e build web/API verificati separatamente. La prova interattiva in pagina e su telefono resta da eseguire: il controllo browser integrato non è disponibile. Nessuna partita reale è stata modificata per il collaudo e nessun test con interfaccia è presentato come eseguito.

## Ripartire a mano e assegnare il portiere

“Azzera schieramenti” svuota titolari, riserve assegnate e scelte fissate in tutti i segmenti, comprese le formazioni temporaneamente inattive. Convocazione, durate, alternative e resoconto restano disponibili. Le lavagne scollegate restano nella libreria. Dopo il reset, il confronto modifica solo il segmento scelto; “Ricalcola alternanza” permette di ripristinare la proposta automatica per i segmenti successivi.

Il portiere è una scelta della formazione: si può assegnare in scheda o dalla lavagna a un singolo segmento (anche 3B) o a tutta la partita, e poi fare eccezioni per singolo segmento. Qualsiasi convocato può stare in porta; il portiere di ruolo può giocare fuori. La scelta non aggiorna la posizione anagrafica. Restano in vigore i permessi e l'ambito società/squadra già applicati al salvataggio del piano.
