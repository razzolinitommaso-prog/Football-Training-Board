# Tempi partita: salvataggio, terzo diviso e alternanza

La modifica conserva i contenuti del quarto tempo, i minuti personalizzati e l'ordine dei periodi quando si riapre una scheda. I valori predefiniti vengono usati per i dati mancanti. Titolari, riserve, posizioni, disegni, alternative e riferimenti alla lavagna rimangono nel piano.

## Scuola Calcio

Con quarto tempo attivo si pianificano quattro tempi completi. Senza quarto, il terzo ha una prima e una seconda parte, con liste e anteprime proprie. Le due parti sommano i minuti totali del terzo; la durata della prima parte è modificabile e la seconda si ricava per differenza. Le identità operative restano t1/t2/t3/t4: la seconda parte è annidata nel terzo, senza inventare un quinto tempo.

Durata e alternanza permette di cambiare i minuti dei tempi e mostra i minuti previsti per ciascun convocato. Sono una previsione: i dati effettivi rimangono nel resoconto.

La compilazione automatica considera tutta la sequenza attiva. Dà precedenza a chi riposa nel segmento precedente e, a parità, a chi ha meno minuti previsti; considera i portieri per i formati che li prevedono. Gestisce anche rose dispari e formati diversi tra i tempi. Non promette un minutaggio identico quando durate, numero di convocati, ruoli o scelte manuali non lo consentono.

Le selezioni modificate manualmente, comprese quelle salvate dalla lavagna, sono protette. Ricalcola alternanza richiede conferma e rigenera dal secondo segmento in avanti mantenendo la prima formazione. È il comando da usare per rigenerare piani precedenti già compilati: le scelte salvate senza il nuovo marcatore vengono conservate prudentemente come manuali.

Disabilitare il quarto conserva la sua preparazione come dato non attivo, ripristinabile riabilitandolo; la seconda parte del terzo rimane conservata quando si passa a quattro tempi. Nessun minuto del segmento non attivo entra nei totali.

## Resoconto e compatibilità

La creazione di un nuovo resoconto precompila i cambi tra le due parti del terzo al minuto corrispondente, mantenendo tre periodi effettivi. I minuti calcolati dall'analisi del resoconto coincidono con quelli previsti dal piano nel caso automatico verificato. Schieramenti parziali incoerenti vanno completati prima della generazione: non si inventano ingressi senza uscita.

I resoconti esistenti non vengono rigenerati. Abilitando il quarto si può aggiungere un periodo vuoto al resoconto senza alterare gol o cambi precedenti; disabilitarlo viene bloccato se contiene già dati effettivi. Il mister deve correggerli esplicitamente prima della rimozione.

Il server conserva le nuove informazioni annidate se un client precedente le omette. Nessuna migrazione del database: il piano usa il campo JSON esistente. I normali piani a due tempi del settore giovanile/prima squadra mantengono il percorso precedente. La seconda parte ha l'anteprima modificabile nella scheda; non usa né sovrascrive il riferimento della lavagna del primo segmento.

## Verifiche

node scripts/test-match-period-rotation.cjs esegue il codice effettivo dei calcoli, la ricostruzione del piano estratta via AST, la protezione server estratta via AST e l'analisi effettiva del resoconto. Non importa credenziali o sessioni e non scrive dati reali.

Provati: riapertura con quarto/minuti/posizioni/alternative salvati; ordine personalizzato; terzo in 6+6 e 4+8; quattro tempi completi; totali dei minuti; stabilità di ricalcoli ripetuti; rose dispari; portieri; scelte manuali e panchina esplicitamente vuota; rimozione di un convocato da tutti i segmenti; conservazione delle preparazioni non attive; cambi a metà del terzo coerenti con il resoconto; quarto con dati effettivi non eliminabile; client precedenti; due tempi esistenti.

Typecheck frontend/API e build web/API verificati separatamente. La prova interattiva in pagina e su telefono resta da eseguire: il controllo browser integrato non è disponibile. Nessuna partita reale è stata modificata per il collaudo e nessun test con interfaccia è presentato come eseguito.
