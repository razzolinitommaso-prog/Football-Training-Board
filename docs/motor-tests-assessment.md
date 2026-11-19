# Sessioni motorie, stazioni e valutazione — 19 novembre 2026

## Funzionamento

Il programma si riordina per trascinamento, con supporto touch e frecce accessibili. Il salvataggio aggiorna l’ordine delle esercitazioni interne della stazione già collegata e la durata complessiva. Le descrizioni personalizzate, le note, le varianti e le lavagne modificate restano conservate. Metadati illeggibili o stazione rimossa producono un conflitto visibile, senza riscrittura distruttiva.

Ogni prova contiene descrizione operativa, materiali e un disegno illustrativo originale. Le esercitazioni della stazione includono una lavagna modificabile, l’anteprima illustrativa e il collegamento alla medesima sessione motoria. La lavagna modificabile usa sagome/gesti e materiali già supportati dall’app; il disegno illustrativo non è una tavola ufficiale TGMD-3.

La registrazione distingue familiarizzazione e conferme, validità, tentativo osservato, condizioni di esecuzione, misure e quattro osservazioni didattiche. Ogni risposta Sì/No/Non osservato ha la propria nota; restano le note generali. I vuoti non diventano risposte negative. I campi storici e le note precedenti non vengono cancellati. Il riporto dai dati precedenti segue le regole esplicite nella sezione seguente.

## Salvataggio automatico e riporto dello storico — 19 novembre 2026

Ogni modifica crea una bozza locale sincrona, prima dell’aggiornamento React. Le bozze sono separate per società, utente, profilo, ruolo, sezione e sessione. La pagina propone «Riprendi compilazione» alla riapertura; le bozze incomplete restano recuperabili anche se non superano ancora la validazione. La chiusura della scheda, il cambio pagina e la sospensione della pagina avviano un tentativo di sincronizzazione. La copia locale resta recuperabile nello stesso browser e profilo, salvo cancellazione dei dati del browser o indisponibilità dello spazio locale.

Le modifiche valide si salvano online automaticamente dopo circa 900 ms di pausa. Le nuove sessioni senza risultati restano bozze fino alla conferma esplicita del programma, per permettere di scegliere data e annata prima che diventino immutabili. Un indicatore distingue copia sul dispositivo, salvataggio in corso, conferma online, dati da completare e problemi di connessione. Il ripristino della connessione e un controllo ogni 15 secondi ritentano le bozze ancora pendenti. Un errore dello spazio locale appare immediatamente; se restano modifiche senza copia locale né conferma online, l’uscita dalla pagina richiede l’avviso del browser.

Le richieste sono serializzate per sessione. La risposta tardiva aggiorna revisione e metadati senza sostituire quanto digitato nel frattempo. Il confronto a tre versioni riunisce modifiche indipendenti; cambiamenti concorrenti sugli stessi valori bloccano la sincronizzazione e conservano la bozza, con avviso ed export disponibile. Non viene forzata una revisione online né cancellato un risultato remoto per risolvere un conflitto.

Le misure scalari precedenti vengono mostrate nel tentativo di conferma quando l’unità corrisponde. Nel salto verticale solo la notazione esplicita su righe «Sx 185, 218» / «Dx 182, 218», con separatore non ambiguo e quote plausibili, riempie i campi di partenza/arrivo; la scheda segnala il riporto e conserva integralmente le note. Una misura storica senza lato non viene duplicata sui due lati; «appoggi» nelle note non viene convertito in «saltelli». Il valore storico resta conservato anche se si iniziano a compilare nuove condizioni o rilevazioni ancora incomplete. Non viene dichiarata completa una nuova rilevazione bilaterale se manca un lato.

Verifiche aggiunte: recupero di otto giocatori simulati prima di qualsiasi richiesta, copia immediata, persistenza di zero e dati incompleti, modifiche durante una richiesta, serializzazione, offline/ripresa, revisioni concorrenti, conflitti, separazione dei profili, esaurimento dello spazio e assenza di salvataggi infiniti dovuti all’ordine delle proprietà JSON. Nessuna cancellazione o migrazione massiva dello storico reale.

Sessione reale verificata nell’interfaccia: Esordienti 1° anno / 2015, 18/11/2026. Prima di cambiare pagina è stato esportato il contenuto aperto e conservato fuori dal repository in `outputs/test-motori-2015-2026-11-18-backup.xlsx`. Sono presenti quattro schede parziali. Questo export non contiene i dati necessari a ricostruire le otto schede segnalate come perse. La versione precedente non aveva copie automatiche delle modifiche mai inviate; non si dichiara un recupero non dimostrato.

Il salto verticale conserva quote da fermo/in salto per ciascun braccio; l’elevazione è la differenza, con controllo sulle quote invertite. L’equilibrio conserva entrambi i lati, tenuta, saltelli correttivi e contatti del piede libero distinti, superficie, attrezzo, piede e occhi. La marcia separa durata, rotazione (entità/verso/0–360°) e spostamento (entità/direzione/cm). Nessuna/Nessuno imposta zero; valori discordanti vengono respinti. La conduzione della palla **attraverso** i coni distingue coni saltati, abbattuti e perdite di controllo. Peso e statura restano due dati senza voto.

## TGMD-3 e ALPHA

Il modulo TGMD-3 riguarda il solo item compatibile attualmente presente: salto in lungo da fermo. I quattro criteri sono spiegazioni sintetiche dei comportamenti osservabili, con due prove formali e nota per criterio. 1 significa criterio eseguito correttamente; 0 non eseguito correttamente; vuoto da osservare. Il grezzo 0–8 compare solo con otto risposte esplicite e conferma di somministrazione secondo il manuale italiano. Familiarizzazione esclusa. Non vengono calcolati voti 1–5, percentili, equivalenti d’età o Indice grosso-motorio con prove parziali. Le osservazioni didattiche non confluiscono nel TGMD-3. Corsa e saltelli monopodalici richiederebbero item autonomi: non si inferiscono dal circuito o dalle correzioni durante l’equilibrio.

Il risultato metrico ALPHA, se scelto, è il migliore di due tentativi validi misurati; una sola prova o più di due conferme valide non produce automaticamente un risultato ufficiale. Non si presume equivalenza di somministrazione tra raccolta metrica e TGMD-3. I voti storici 1–10 restano consultabili e sono esplicitamente identificati; non vengono mescolati ai nuovi risultati.

Riferimenti: [edizione italiana Erickson](https://static.erickson.it/prod/files/ItemVariant/itemvariant_sfoglialibro/204386_9788859032519_edi2636_test-tgmd-3.pdf), [indicazioni degli autori TGMD-3](https://www.tgmd3.org/general-information), [studio originale sull’affidabilità, tabella 2, criteri salto](https://www.utupub.fi/bitstream/handle/10024/160376/Reliability%20ms%20RE-submitted%20October%2023%2C%202016%20FINAL.pdf?sequence=1), [risorse ALPHA del gruppo di ricerca](https://profith.ugr.es/en/resources/how-to-assess-fitness-in-children-and-adolescents-the-alpha-fitness-test-battery/).

## Permessi e conservazione

Il preparatore continua a gestire sessioni e programma. Il mister può registrare rilevazioni in un programma esistente, soltanto per squadre assegnate come allenatore e giocatori presenti all’appello. La Segreteria, i collaboratori e gli utenti non assegnati non acquisiscono permessi di scrittura. Non sono stati ampliati i permessi generali sui dati atletici singoli o sulle partite. La revisione della sessione protegge dai salvataggi concorrenti; non è possibile omettere e cancellare le rilevazioni di altri giocatori.

I dati dettagliati restano nel JSON della sessione, senza migrazione distruttiva. Scheda giocatore, area genitori ed export Excel/PDF leggono lo stesso record. Il PDF resta scaricabile e apribile per la stampa. Le prove di compilazione e i test isolati non costituiscono verifica del deploy o del funzionamento fisico su smartphone.

## Verifiche

- Test dei calcoli: differenze del salto, esclusione familiarizzazione, ALPHA, zero/null, TGMD completo/incompleto, conteggi, validazione, conservazione dei dati storici e delle lavagne nel riordino.
- Handler HTTP con PostgreSQL isolato: salvataggio e riapertura, riordino stazione, revisione, presenti/assenti, coach assegnato, ruoli esclusi, conservazione dei risultati e consultazione genitore.
- Controlli TypeScript frontend, API e librerie; build frontend. Avvisi Vite preesistenti su sourcemap e dimensioni del bundle.
- Verifica visiva completa tramite browser non eseguita in questo intervento. Deploy e controllo online successivi al push rimangono da verificare.

## Aggiornamento 19/11/2026 — export PDF impaginato

L'export PDF dei test usa un rapporto A4 dedicato, senza modificare gli export testuali delle altre aree. Programma con durata, materiali e istruzioni; tabella presenze; schede individuali che iniziano su un nuovo foglio. Condizioni, misure, tentativi, osservazioni e note sono in tabelle, con separatori per esercizio e tentativo. Giocatore, annata, data e ciclo sono ripetuti sulle continuazioni; pagine numerate. Le note lunghe vengono suddivise senza troncamenti, le intestazioni restano con il contenuto successivo, gli accenti italiani sono codificati in WinAnsi. Misure derivate dai tentativi, storico e dati mancanti restano distinti, compreso lo zero. Il download PDF e il collegamento Apri PDF e stampa restano disponibili; Excel non modificato.

Collaudo del generatore effettivo con dati simulati: nove pagine A4 con due giocatori, tentativi distinti, marcia a zero, note lunghe, accenti, intestazioni e limiti dell'area stampabile. PDF riaperto, testo estratto e tutte le pagine renderizzate per controllo visivo. Nessuna modifica ai dati reali e nessun controllo del deploy.

## Aggiornamento 19/11/2026 — salvataggi, tentativi e misure del giocatore

Il salvataggio manuale mostra una conferma visibile; lo stato distingue dati salvati online, bozza sul dispositivo ed errori da correggere. Un errore in una rilevazione non impedisce il salvataggio delle altre rilevazioni valide: il test non valido conserva online l'ultima versione valida, mentre le modifiche incomplete restano nella bozza locale. L'avviso identifica giocatore, esercizio, tentativo e campo, con pulsante per raggiungerlo. Le quote del salto verticale sono entrambe misurate da terra: quota raggiunta non inferiore alla quota della mano da fermo.

Equilibrio: misure e osservazioni della gamba destra e sinistra sono affiancate e sempre visibili, senza selettore del lato nelle osservazioni. Marcia: ogni tentativo comprende coordinazione e percezione spazio-tempo (Ottima/Buona/Insufficiente) con note, distinte da rotazione e spostamento. Sono osservazioni interne, non nuovi punteggi TGMD-3. Ogni tentativo può essere eliminato con conferma esplicita; gli altri tentativi e le note generali rimangono. Se si elimina una prova formale TGMD, la conferma del protocollo deve essere rinnovata.

Altezza e peso ammettono decimali. La correzione dei dati d'ingresso è disponibile con permesso di gestione misure, registrando autore, data, valore precedente/successivo e nota nello storico. I dati attuali seguono l'ultima misura valida in ordine cronologico tra sessioni motorie e rilevazioni atletiche; un valore successivo inferiore è comunque attuale. Le misure d'ingresso non vengono sostituite dai test; i campi iniziali vuoti sono completati con la prima misura disponibile. Modificare un test più vecchio non sostituisce un dato più recente. La riconciliazione include i test già registrati e mantiene lo stesso storico nei passaggi di squadra/stagione. Migrazione non distruttiva delle colonne altezza/peso a double precision, SQL disponibile in lib/db/sql/player_measurement_decimals.sql.

Impaginazione: programma con titolo leggibile e comandi a capo in contenitori stretti, intestazione senza nomi verticali; tabella minutaggi scorrevole con intestazioni integre e campi più larghi secondo lo spazio disponibile.

Verifiche: test dei salvataggi parziali, copie locali, concorrenza e tentativi; handler HTTP con PostgreSQL isolato per misure cronologiche, decimali, correzioni, storico e permessi; regressioni dati atletici e transizioni stagionali; TypeScript e build frontend/API. Verifica browser dei componenti reali con dati simulati: conferma Salva sessione, dialogo eliminazione, campi marcia, confronto bilaterale e impaginazione telefono/tablet. Nessuna misura o sessione reale è stata modificata per il collaudo. Nessuna verifica del deploy, come richiesto dall'utente.
