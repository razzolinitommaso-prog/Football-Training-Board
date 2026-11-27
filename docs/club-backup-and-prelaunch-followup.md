# Backup e prosecuzione del collaudo — 21/11/2026

## Backup dati società

Da **Stagioni → Backup dati società**, Presidente/Amministratore può scaricare un archivio `.ndjson.gz` di tutte le stagioni della società attiva. L'export stagione JSON precedente rimane distinto e invariato; la sua descrizione ora elenca soltanto i contenuti effettivi.

L'API `/api/club-backup` legge le tabelle della società e i record dipendenti senza `club_id` tramite le chiavi esterne, in un'unica transazione PostgreSQL `REPEATABLE READ READ ONLY`. Include archiviati, test motori, piani partita/lavagne, registri economici, KIT/magazzino e contenuti allegati effettivamente salvati nel database. Gli utenti collegati sono esportati senza password/token/codici di accesso. Credenziali, sessioni e registri globali della piattaforma sono esclusi e indicati nell'intestazione. Ogni tabella ha conteggio e SHA-256; manca il manifesto finale se il trasferimento si interrompe.

I file esterni non vengono scaricati dal server: i riferimenti sono conservati ed elencati, anche se annidati. I relativi file vanno conservati separatamente. Questo archivio dei dati della società non è un dump di disaster recovery dell'infrastruttura né un ripristino automatico sul database attivo. Non contiene bozze rimaste esclusivamente su altri dispositivi. Non è stato eseguito alcun ripristino sui dati reali.

Verifica locale:

```powershell
node scripts/verify-club-backup.cjs <backup.ndjson.gz>
node scripts/audit-club-backup.cjs <backup.ndjson.gz> 2026-11-21
node scripts/test-club-backup.cjs
```

Test con PostgreSQL isolato e handler HTTP: separazione società, giocatori archiviati, contenuti base64 integri, relazioni KIT, esclusione credenziali, paginazione, compressione/rilettura, rifiuto file troncati o alterati, permessi e risposta gzip effettivamente ricevuta. Il test è incluso nella CI. Il comando di audit legge tutti i movimenti del backup, indipendentemente dai filtri UI; segnala registri mancanti, riferimenti orfani e anomalie senza correggerli automaticamente. Verificato su dati sintetici, non ancora sul backup reale della società.

## Browser e moduli secondari

Il primo job su `4c27019` ha concluso con 813 successi e tre arresti del processo Firefox durante axe su Pagamenti. I log non segnalavano un errore di calcolo. È una regressione compatibile con [Playwright #44135](https://github.com/microsoft/playwright/issues/44135): il motore Firefox della versione 1.65.1 può arrestarsi quando axe e i selettori leggono i riferimenti ARIA. La dipendenza di test è fissata a **1.63.0**, mantenendo attivi i controlli; nessuna modifica ai permessi o alle regole applicative per eludere il problema.

Il job [44915811475](https://github.com/razzolinitommaso-prog/Football-Training-Board/actions/runs/44915811475), commit `e123015`, è **success**: 816 prove superate, inclusi i download Excel nei tre browser. L'esito dei successivi ampliamenti deve essere registrato separatamente.

Matrice ampliata a Stagioni/backup, lavagna, dotazioni, impostazioni società, profilo e cruscotto atletico. Aggiunti moduli aperti di giocatori, documenti, articoli magazzino, stagioni, stazioni e anteprima importazione Excel. Il test di importazione usa un file sintetico; non invia giocatori reali. Etichette accessibili di colori/modulo/squadra/dotazioni, contrasto del sottotitolo lavagna e griglia della dotazione corretti. I dati sintetici auth/profilo sono stati allineati alle risposte reali, senza variare le API applicative.

L'intestazione della partita è nel normale flusso sotto 1024 px; il comportamento sticky resta su desktop. Aggiunta regressione su 320/390/768/1024 px con partita di prova e screenshot degli schieramenti. Nessuna variazione a convocati, posizioni o minutaggi.

La suite estesa ha concluso con **1.098 successi su 1.098**: 366 per Chromium, 366 per Firefox, 366 per WebKit. [Job finale 44922087605](https://github.com/razzolinitommaso-prog/Football-Training-Board/actions/runs/44922087605), commit `15ff824`; evidenza in `prelaunch-ci-results.json`. Inclusi i file Excel sintetici nell'anteprima importazione, i download, i moduli aperti e la scomparsa del titolo partita dall'area di lavoro dopo lo scorrimento mobile. I precedenti fallimenti sul selettore mobile sono risolti dall'etichetta esplicita «Sezione della partita». Corretto anche il main annidato della lavagna. I tre motori sono eseguiti in job paralleli con report distinti.

La prova manuale del file chooser CUA si è bloccata e non va registrata come importazione superata manualmente; la prova con file è superata nella CI. La matrice non certifica tutte le possibili combinazioni dell'app né sostituisce i dispositivi fisici.

Regressioni eseguite separatamente sugli handler reali con PostgreSQL isolato: `--document-files` (staff/genitore, riapertura, ambito e allegati partita), `--payment-desk` (KIT/pagamenti, richieste/arrivi/consegne, idempotenza magazzino), `--member-services` (contratti, centesimi/FM, ricevute, documenti e presenze) e `--societies` (società, archivi/rientri, compensi senior e accessi). Tutte superate. Generatore PDF motori verificato con `scripts/test-motor-pdf.cjs`: nove pagine, tentativi, misure zero, note lunghe e accenti. Render Poppler ispezionati sulle pagine 1, 2 e 5; nessun taglio o sovrapposizione osservato in questo campione. Non è una prova di stampa su ogni modello di stampante.

## Accessi e dispositivi

All'avvio del controllo nessun dispositivo era connesso via `adb devices -l`. Le prove fisiche iPhone/Android restano da eseguire con dispositivi collegati; nessun abbonamento BrowserStack è stato attivato.

Per la riconciliazione di tutti i dati reali servono le risposte contabili autorizzate. Le sessioni visibili erano Allenatore (IAB) e DT (Chrome); è stato richiesto di aprire Pagamenti con Segreteria/Presidente/DG. Non sono stati acquisiti token dal browser, inventati accessi o modificati i registri reali. Le prove su dati sintetici e le quadrature disponibili non certificano i record che non sono stati letti.

## Verifica manuale Presidente — 22/11/2026

Eseguita in sola lettura sulla sessione Presidente/Amministratore resa disponibile dall'utente. Ricalcolati al centesimo i movimenti effettivamente renderizzati nel registro e confrontati con incassato, residuo, scaduto, metodi di incasso e anni del grafico. Verificati anche i filtri KIT, scaduti, non scaduti, bonifico, mese, annata e ricerca giocatore. Riepiloghi coerenti nel campione di filtri osservato; nessun errore aritmetico rilevato nei registri caricati.

Verificate le mensilità dei compensi membri e la ripartizione del residuo nel grafico secondo la scadenza, distinta dalla competenza. Prima Squadra senza compensi nei dati caricati. Le esclusioni dalla previsione riscontrate corrispondono a giocatori con mancato rinnovo; i relativi crediti rimangono nel registro. Uno stato di indisponibilità temporanea non è stato trasformato in archiviazione.

Evidenze con nominativi, importi e righe conservate soltanto negli output privati locali, escluse da questo repository pubblico. Nessun inserimento, incasso, uscita, modifica o cancellazione di dati reali. Nessuna modifica di prodotto necessaria in questo passaggio.

Restano distinti: confronto degli ambiti Segreteria/DG, audit dell'intero backup reale per record orfani/non esposti in UI, verifica articolo per articolo del potenziale KIT e download del controllo Excel nella sessione reale. Non verificata la completezza rispetto a documenti esterni né l'assenza di duplicati semanticamente equivalenti. I dispositivi fisici restano rinviati su indicazione dell'utente. Nessuna attesa o verifica deploy.

## Confronto Segreteria — 22/11/2026

Verificata la nuova sessione Segreteria e ricalcolato il registro renderizzato. Tutte le righe lette come Presidente sono ancora presenti; la variazione dei totali corrisponde esattamente a nuove registrazioni intervenute fra le due letture. Quadratura entrate/residui coerente e compensi membri invariati. I comandi di inserimento, scadenza e incasso sono visibili nel dettaglio giocatore; aperto e richiuso il modulo senza inviare alcun dato. Questa osservazione non equivale a provare modifiche o dinieghi server su registri reali.

Individuato un caso da chiarire: quota annuale e iscrizione registrate come voci indipendenti. Se l'importo annuale comprende la prima rata, la somma delle righe può essere aritmeticamente corretta ma il dovuto sovrastimato. Richiesta conferma del significato dell'importo all'utente; nessuna rettifica automatica. Il pannello di quadratura non certifica questa correttezza contrattuale.

Comando export controllo Excel azionato, ma consegna del file non confermata: nessun nuovo file individuato nella cartella Downloads locale. Restano DG, audit completo del backup reale e le altre limitazioni già elencate. Evidenze nominali conservate solo negli output privati; nessun dato contabile reale pubblicato qui.

## Totale annuale e iscrizione inclusa

Chiarita la regola con l'utente: l'iscrizione è una prima rata dell'annuale; l'assicurazione resta aggiuntiva. Nel registro individuale, Totale quota annuale calcola il residuo sottraendo le iscrizioni già registrate e gli incassi annuali. Correggi totale annuale aggiorna la singola quota aperta senza sostituire o modificare le ricevute. Per pagare il residuo si usano i comandi Incassa rata/Saldo quote già esistenti.

La registrazione della prima rata dopo un totale annuale esplicitamente confermato riduce il relativo residuo nella stessa transazione. Il server rifiuta la somma cieca di iscrizione e annuale, le conferme su dati cambiati e gli importi sotto le quote già registrate. Lock sul giocatore per serializzare le due operazioni. Con piani globali, più quote aperte o dati storici ambigui rimanda al piano quote: nessuna migrazione massiva o inferenza automatica del totale contrattuale.

Regressioni HTTP con database isolato: entrambi gli ordini di inserimento, assicurazione separata, rettifica di quota manuale aperta, ricevute conservate, ripetizioni rifiutate e ruolo Presidente in sola lettura. Verifica UI locale su dati sintetici: anteprima del residuo e blocco sotto l'incassato. Controlli di tipo librerie/server/frontend. Le registrazioni reali non sono state rettificate durante questo intervento; il nuovo comando richiede conferma esplicita del totale. Nessuna attesa deploy.

## Procedura di verifica Direttore Generale

Per confrontare i profili, acquisire separatamente il registro corrente e ricalcolare gli importi in centesimi. Confrontare le differenze fra letture prima di attribuirle al ruolo: il dataset può essere cambiato nel frattempo. Verificare filtri, scadenze delle uscite e visibilità dei comandi senza effettuare scritture su record reali.

La ricerca di descrizioni annuale/iscrizione e righe identiche è solo un controllo preliminare. Per i piani generici occorrono totale contrattuale e legami fra rate/ricevute; il registro visuale non sostituisce l'audit dell'intero backup. Conservare le evidenze contabili esclusivamente in archivi privati. In questo documento pubblico sono descritte soltanto procedure generali, senza esiti o dati di una società.

## Correzione compatibilità del generatore backup — 26/11/2026

Riprodotto un difetto del catalogo PostgreSQL: gli array di `pg_attribute.attname` hanno tipo `name[]` (OID 1003), che il parser `pg` usato dall'applicazione restituisce come stringa. Il generatore chiamava `.map` su tale valore. PGlite restituiva invece un array, mascherando il problema nel primo test. Le due query del catalogo convertono ora i nomi in `text`, ottenendo `text[]` correttamente decodificati; nessuna modifica ai dati o ai parser globali.

La regressione attraversa il parser reale di node-postgres usando i tipi restituiti dal database isolato: prima della correzione riproduce `l.columns.map is not a function`, dopo verifica il backup, le somme di controllo, le relazioni dipendenti e il download HTTP gzip. Il catalogo viene preparato prima di avviare lo stream: un errore in questa fase restituisce JSON con `BACKUP_PREPARATION_FAILED`, senza SQL, credenziali o dati di record. Anche il fallimento di connessione è intercettato.

La pagina Stagioni conserva l'avviso di errore con stato HTTP/codice, distingue sessione scaduta e ruolo non abilitato, rifiuta un file vuoto e non confonde download avviato con salvataggio verificato sul dispositivo. Aggiunte prove UI per errore server/file vuoto alle larghezze 320, 390 e 1024. La verifica integrale dei dati reali resta distinta: richiede un nuovo backup effettivamente scaricato, non viene dichiarata completata da questi test sintetici.

## Ripresa del collaudo — 26/11/2026

Verificato tramite API pubblica GitHub il run `45820089975` sul commit `e313948`: conclusione `success` per Chromium, Firefox e WebKit. Evidenza distinta in `prelaunch-ci-results-current.json`. Questo esito riguarda quel commit; non certifica le modifiche pubblicate successivamente. Non è stata controllata l’esecuzione del deploy.

Backup ed Excel contabile conservano ora un collegamento esplicito al file già generato, oltre al primo tentativo automatico di download. L’URL rimane disponibile fino a nuova generazione, navigazione o cambio di società/profilo. Il file precedente viene ritirato quando parte una nuova generazione, evitando che un errore lasci esposto un export vecchio. Le risposte vuote o prive della firma gzip non sono offerte come backup; il controllo della firma non sostituisce la verifica integrale con conteggi e SHA-256.

Il potenziale KIT espone quantità mancanti, prezzo minimo di riferimento, subtotale e voci senza prezzo per ciascun articolo. Formula, esclusioni e separazione dagli incassi restano quelle esistenti. Un prezzo nullo è escluso; un prezzo esplicitamente zero è distinto e valido. I pagamenti senza articolo riconoscibile continuano a richiedere verifica. I subtotali del dettaglio sono confrontati con il totale in test sintetici.

Eseguiti test di quadratura, round trip del Blob Excel a sette fogli, dettaglio KIT e regressione backup con database isolato. Nell’anteprima CUA verificati collegamenti e layout a 320/390/768 px, nonché l’avviso su risposta di formato errato. Aggiunte regressioni CI per i collegamenti di download, contenuto Excel e file backup errato. I controlli CI di queste nuove modifiche richiedono un proprio esito.

Il recupero del download nel browser collegato non ha consegnato file locali, anche con una fixture sintetica. Non equivale a un fallimento dimostrato del download in ogni browser, né a un file realmente salvato. Il backup reale e il workbook reale devono essere salvati sul dispositivo e poi verificati. Restano aperti audit integrale del backup, verifica nominativa/articolo dei dati reali e dispositivi fisici. Le segnalazioni di possibili duplicati non provocano cancellazioni automatiche.

## Verifica completa direttamente in Stagioni

Presidente e Amministratore possono usare **Verifica dati completi** senza scaricare un file. La nuova API `/api/club-backup/audit` consuma tutto lo snapshot nella stessa transazione `REPEATABLE READ READ ONLY`, ne ricalcola conteggi e SHA-256 e confronta i riferimenti tra tabelle incluse. Conserva per i calcoli economici soltanto i registri necessari; non salva copie dei documenti e non modifica registrazioni.

Le quadrature sono condivise tra pagina Pagamenti, Excel e controllo completo attraverso una libreria pura comune. Registri mancanti restano esplicitamente incompleti, anche se gli array restituiti sono vuoti. I movimenti TEST sono esclusi dai totali economici; quelli degli archiviati restano nel registro. I possibili duplicati e i riferimenti mancanti sono segnalati, senza rettifiche automatiche.

Il controllo dello snapshot sul server non dimostra che il file scaricato sia integro sul dispositivo. Per quel file restano necessari il verificatore locale e la conservazione separata dei contenuti esterni. Il controllo non riconcilia banca/cassa e non ricostruisce il significato contrattuale di descrizioni ambigue.

Regressioni: diniego dei ruoli non abilitati, isolamento società ignorando un parametro esterno, firme/hash errati, riferimenti fuori dal perimetro esportato, registri assenti e risposta di errore senza diagnostica riservata. UI con dati sintetici verificata a 320/390/768 px, con avviso di fonte mancante e errore server. La disponibilità del comando in una nuova versione non costituisce da sola un esito del controllo sui dati reali: tale esito va registrato separatamente.

## Validazione e rettifica delle date stagionali

Le date della stagione si modificano con **Stagioni → Modifica date**. La scheda segnala gli intervalli già incoerenti; creazione, rettifica e attivazione rifiutano date non valide o fine precedente all'inizio. La validazione precede il cambio della stagione attiva. È ancora possibile archiviare/disattivare uno storico incoerente. Nessuna rettifica automatica dei dati esistenti.

Regressioni HTTP/PGlite superate: creazione e attivazione rifiutate senza disattivare la stagione corrente, modifica parziale, date impossibili/nulle, isolamento società e diniego del ruolo allenatore. Typecheck librerie, API e frontend superati. Verifica manuale su fixture a 320/390/768 px: avviso visibile, salvataggio disabilitato con intervallo errato e abilitato correggendolo, nessuna eccedenza orizzontale. Aggiunti quattro casi CI alle larghezze 320/390/768/1024; il loro esito richiede un nuovo run.

Chiusa la lettura del run 45880732713 sul commit 08ee6ef: successo per Chromium, Firefox e WebKit. Non equivale all'esito delle modifiche successive. Nessuna verifica deploy. Le rettifiche a importi, prezzi o date reali richiedono il dato corretto; non sono dedotte da un possibile duplicato o da una data incoerente. Non disponibili dispositivi Android collegati al momento della verifica; prove fisiche Android/iPhone ancora aperte.

## Collaudo dei pannelli aperti — 27/11/2026

Run pubblico 45900932599 sul commit 3f5344e concluso con successo nei tre job Chromium, Firefox e WebKit. Include la precedente correzione delle date; non certifica automaticamente modifiche successive. Nessun controllo del deploy.

La verifica manuale aggiuntiva sulle fixture ha coperto valutazioni motorie con giocatore presente di una giornata successiva, osservazioni bilaterali, pannelli attrezzatura e animazione della lavagna, modulo documenti a 320 e 768 px. Nessun debordamento orizzontale nei casi osservati. Le osservazioni bilaterali risultavano però troppo compresse: ora usano una colonna quando il contenitore è stretto e due quando lo spazio consente almeno 24 rem. Entrambi i lati restano espliciti, senza menu. Anche le misure dei due lati adattano il numero di colonne allo spazio disponibile.

Gli input documento da dispositivo e fotocamera hanno nomi accessibili distinti e rispettano lo stato disabilitato durante il salvataggio. Aggiunte regressioni CI per selezione allegato e sua conservazione dopo risposta di errore, firma/contenuto non vuoto del PDF realmente scaricato nel browser di test, osservazioni leggibili e pannelli lavagna aperti. La raccolta Playwright riconosce 1.188 casi totali sui tre browser; --list non esegue i test. La build frontend locale è riuscita; restano warning preesistenti di sourcemap e dimensione bundle.

Nessun archivio backup o workbook contabile reale è stato trovato nella cartella Downloads al controllo di questa ripresa. Il successo dei download su dati sintetici non attesta l'integrità di un file reale salvato sul dispositivo. Non ripetuti i comandi di recupero download del browser integrato già bloccatisi nelle prove precedenti. Restano separati consegna/verifica dei file reali, prove fisiche Android/iPhone e verifica dei contenuti esterni. I tre chiarimenti sui dati economici e stagionali sono rinviati per scelta dell'utente.

## Disponibilità: direzione e Segreteria

Il riquadro del cruscotto **Giocatori indisponibili** è visibile a DT, DS, DG, Presidente, Amministratore e Segreteria. La stessa policy condivisa protegge il nuovo flusso `/api/players/unavailable-alerts`: gli altri ruoli ricevono 403 prima di qualsiasi lettura dei giocatori. Il flusso applica i perimetri società/settore già esistenti, esclude archiviati e TEST e restituisce soltanto identità, annata di nascita, squadra, motivo e rientro previsto. Le liste operative ordinarie dei giocatori restano invariate: questa modifica riguarda il riquadro riepilogativo, non una revisione generale delle autorizzazioni delle schede.

Il frontend non richiede il flusso per i ruoli esclusi, separa la cache per società/utente/ruolo e mostra un errore con riprova se la lettura fallisce. I filtri di lavoro del cruscotto continuano a limitare le persone visualizzate. La causa payment è resa con la voce tradotta Pagamenti.

Aggiunta inoltre la categoria canonica Pinocchietto invernale ai suggerimenti automatici KIT, senza richiedere la parola allenamento. I collegamenti espliciti, inclusa una lista vuota, mantengono precedenza sui suggerimenti. Prezzi e giacenze restano nel database di ciascuna società, senza valori specifici incorporati nel codice.

Verifiche: HTTP/PGlite superato per sei ruoli ammessi e cinque esclusi, isolamento società e risposta minima; suite finance/Excel/KIT superata; typecheck librerie/API/frontend superati. Nell'anteprima sintetica l'avviso è assente per preparatore e presente per DT; controllata apertura su mobile. Aggiunti dieci casi UI di ruolo, da eseguire nel nuovo run CI; raccolta riconosciuta di 1.218 casi complessivi. La CI esegue ora anche le regressioni HTTP degli stati stagionali e dell'avviso. Run precedente 45957998083 su 185f3f4 concluso con successo sui tre browser, distinto dal nuovo commit. Nessuna verifica deploy.


## Upgrade approvato: Segreteria, importazioni e analisi KIT

La disponibilità è una card stabile prima del calendario, con apertura per squadra/annata e ricerca del giocatore. La Segreteria apre in modifica; chiusura e salvataggio riutilizzano il ritorno all’elenco d’origine, conservando la ricerca. Gli altri ruoli mantengono i permessi delle schede già esistenti.

La voce Supporto gare sostituisce Programmazione gare. La Segreteria lavora sui dati organizzativi, sulle importazioni federali Excel/PDF, su tornei condivisi e amichevoli. Le route dei calendari tecnici aprono il supporto per questo profilo; il feed gare omette piano, note tecniche e risultato e le API di convocazioni rifiutano l’accesso. In anteprima si può scegliere una gara da aggiornare, con dati prima/dopo. L’applicazione del gruppo è transazionale e ripetibile con lo stesso identificativo; conserva ID gara, convocazioni e resoconti. I parser, i termini di ricerca e gli alias non sono modificati. I tornei condivisi riusano il programma e gli importatori esistenti con navigazione organizzativa interna.

Magazzino e Registro pagamenti offrono Analisi KIT con giacenti, riservati, liberi, fabbisogno richieste giocatori per taglia, già ordinati e acquisti ancora necessari. Il potenziale dei giocatori resta separato dalla giacenza e dalla cassa. La copertura per voce è indicativa: richiede conferma delle taglie e non somma due volte gli articoli collegati a più voci. Valore al listino e stima all’ultimo costo registrato sono distinti; costi/prezzi mancanti restano espliciti, non vengono inventati né caricati valori dimostrativi.

Le statistiche selezionano periodo e articolo e ponderano le quantità. Mostrano mode richieste e vendute per articolo, tutte le parità, articoli più venduti/acquistati e picchi mensili. Richieste giocatori anche archiviate alla data di creazione; vendite solo incassate con articolo collegato, alla data incasso; acquisti alla data documento. Incassi storici senza articolo restano negli euro ma sono esclusi dai conteggi di taglie/pezzi e segnalati. Le vendite non attestano la consegna. Le giacenze comprendono anche carichi storici; non si ricostruisce una finta equivalenza acquisti meno vendite uguale stock.

Il registro fornitori conserva quantità, costo unitario in centesimi, fornitore, riferimento, data, scadenza e ricevute parziali. Solo Segreteria registra; Presidente, Amministratore e DG consultano come già per le altre uscite. Il carico fisico è opzionale e spento per impostazione iniziale: non usarlo se l’arrivo è già registrato dall’ordine. Transazioni e identificativi stabili impediscono doppi carichi/ricevute durante i tentativi ripetuti; il pagamento oltre residuo è rifiutato. Dovuto e ricevute sono letti nella stessa istantanea. I costi storici richiedono dati reali e non sono ricostruiti da prezzi di vendita.

Il grafico esistente aggiunge uscite fornitori KIT pagate, da pagare e scadute sotto zero; pagamenti alla data effettiva e residui alla scadenza. Il filtro KIT include questa fonte; i costi fornitori non ripartiti per annata sono esclusi filtrando una squadra, con spiegazione. La cassa KIT è distinta dall’utile, dal valore di stock e dal potenziale. Nuove fonti incluse nel controllo quadrature, nell’Excel contabile e nel backup/audit completo della società. Nessuna modifica ai movimenti reali o alle giacenze durante il collaudo.

Verifiche locali: typecheck intero workspace; build API e web; suite contabile/Excel/KIT; HTTP/PGlite disponibilità, permessi, import atomico, rollback e conservazione dei resoconti; nuovo test fornitori con isolamento società, importi/date, carico singolo, ripetizione invio, parziali, eccesso residuo, mode/periodi, grafico e backup. Excel generato/riletto a nove fogli con fornitori e residui corretti. CUA su dati sintetici: ricerca e ritorno alla lista, apertura in modifica, percorso Supporto gare e confronto modifiche, moda taglie/picchi, modulo fornitori desktop/mobile. Raccolti 1.236 casi UI per i tre browser: raccolta verificata, esito del nuovo run CI non ancora acquisito. Nessuna attesa/verifica deploy. Restano i costi storici da compilare, l’eventuale collegamento degli incassi KIT privi di articolo e le prove su telefoni fisici già rinviate.

## Risultato della società in evidenza e LND Scuola Calcio

La card Ultimi risultati mostra prima l’ultimo risultato disponibile della società collegata, con evidenza dedicata, poi tutti i risultati disponibili dell’ultima giornata. Rimosso il limite fisso a sei gare: gli orari delle altre partite non possono più nascondere la gara della società. Lo stesso incontro non compare due volte nel riepilogo. Se il risultato della società manca, lo stato è esplicito e non viene inventato un punteggio. Riconoscimento delle società e collegamenti alle schede riusano le regole di identità esistenti.

In Scuola Calcio, nelle pagine Partite e Supporto gare, è presente Collegamento Gare LND: scelta dell’annata o collegamento di settore, nuova fonte o fonte salvata, apertura del sito LND e sincronizzazione con anteprima. Riutilizzati la finestra, i parser e l’aggiornamento incrementale già presenti. Le fonti salvate mantengono l’associazione originale all’annata o al settore. L’API accetta ora la Scuola Calcio, con verifica società/settore per l’annata indicata. Le sincronizzazioni ripetute aggiornano la stessa gara.

Aggiunta la consultazione /scuola-calcio/campionati e abilitata la Scuola Calcio nella voce unificata Campionati e classifiche. I calendari, le fasi e i tornei delle annate restano nel flusso esistente. La Segreteria mantiene il supporto organizzativo, senza apertura del nuovo spazio tecnico. In Scuola Calcio si mostrano le sole classifiche fornite dalla fonte: nessuna graduatoria calcolata in mancanza di dati ufficiali. Gli altri settori mantengono la logica precedente.

Collaudo: HTTP/PGlite con fonte LND sintetica per prima sincronizzazione, ripetizione senza duplicati, aggiornamento dello stesso ID gara, fonte salvata, isolamento società, annata di settore errato, URL non LND, contenuto vuoto e assenza di classifica; regressione calcolo classifica Settore Giovanile. Selezione risultati verificata con otto gare nella giornata, società che gioca per prima, pareggio 0-0, risultato mancante e ultima gara della società nella giornata precedente. Typecheck workspace e build API/web superati. Verifica CUA locale a 390 e 1024 px: risultato in evidenza, fonte salvata, URL ricompilato e anteprima. Nuovi casi UI raccolti: totale 1.248 sui tre browser; esito della nuova CI non ancora acquisito. Nessun dato reale o collegamento LND della società modificato durante il collaudo; nessuna attesa deploy.

## Resoconti per tempo, marcatori e filtri Campionati

Il resoconto consente di registrare i gol della propria squadra, degli avversari e le autoreti avversarie per ciascun tempo disputato, fino al quarto. I gol vengono sommati nel risultato finale della partita rispettando casa/trasferta. I punti della classifica interna Scuola Calcio sono 3 per vittoria, 1 per pareggio e 0 per sconfitta sul risultato finale aggregato. I dati LND originali restano separati e non vengono sovrascritti dal calcolo interno.

I marcatori si registrano con caselle indipendenti per giocatore e tempo, anche nel Settore Giovanile. Ogni spunta aggiunge un evento gol; togliendola si rimuove quel gol senza spostare le altre caselle. Restano disponibili i dettagli minuto/marcatore: il minuto proposto dal flag è il primo ingresso in campo e va precisato se necessario. I vecchi gol e i resoconti senza punteggi parziali restano leggibili; un valore mancante non diventa zero. Il salvataggio verifica la completezza dei punteggi e la corrispondenza tra marcatori, autoreti e gol del tempo. La classifica marcatori della società conteggia i resoconti collegati al girone una sola volta per partita ed esclude le autoreti avversarie. Il resoconto del dirigente resta indipendente; i marcatori rimangono quelli del mister. La Segreteria non riceve la nuova lista marcatori dall'API.

Le tre pagine settoriali Campionati usano ora il collegamento completo alla selezione Settore/Annata. La prossima gara della società ha una card dedicata e non può sparire per il limite di sei incontri delle altre squadre. Evidenza coerente in risultati, prossima giornata, classifica e calendario per Fortis Juventus e l'alias federale Borgo San Lorenzo; nessuna modifica alle logiche dei parser.

Collaudi locali: test puri su punteggi aggregati, 3/1/0, quarto tempo, valori storici mancanti e alias circoscritto alla società; HTTP/PGlite sui salvataggi, casa/trasferta, 0-0, incoerenze e mancata modifica dei dati dopo errori, classifica interna e marcatori; regressioni resoconti, accessi genitore/dirigente, rotazioni e LND. Sistemati i default mancanti del database sintetico dei test (stato giocatore, is_test e session_kind); allineata l'aspettativa del test di attività alla regola già esistente secondo cui un resoconto con schieramento vuoto è incompleto. Nessuna modifica della regola di produzione. CUA locale: cambio annata e settore, evidenza Borgo, spunte indipendenti e blocco marcatore mai entrato in campo; layout mobile a 390 px senza overflow. Aggiunti quattro casi UI, raccolta totale 1.260 casi sui tre browser; l'esito CI non è stato verificato. Nessuna attesa deploy.
