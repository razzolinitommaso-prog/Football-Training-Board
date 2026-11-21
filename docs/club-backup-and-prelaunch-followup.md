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

La suite estesa enumera **1.098 casi**, da confermare con il suo job. La prova manuale del file chooser CUA si è bloccata e non va registrata come importazione superata; la prova con file è invece esplicita nella CI. Il controllo geometrico locale ha osservato i moduli aggiuntivi, ma non certifica tutte le combinazioni dell'app.

## Accessi e dispositivi

All'avvio del controllo nessun dispositivo era connesso via `adb devices -l`. Le prove fisiche iPhone/Android restano da eseguire con dispositivi collegati; nessun abbonamento BrowserStack è stato attivato.

Per la riconciliazione di tutti i dati reali servono le risposte contabili autorizzate. Le sessioni visibili erano Allenatore (IAB) e DT (Chrome); è stato richiesto di aprire Pagamenti con Segreteria/Presidente/DG. Non sono stati acquisiti token dal browser, inventati accessi o modificati i registri reali. Le prove su dati sintetici e le quadrature disponibili non certificano i record che non sono stati letti.
