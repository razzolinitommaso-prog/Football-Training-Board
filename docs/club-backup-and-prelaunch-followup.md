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
