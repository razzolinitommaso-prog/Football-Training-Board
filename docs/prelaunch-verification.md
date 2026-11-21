# Collaudo pre-lancio — 21 novembre 2026

## Modifiche applicative

- Pagamenti: errore/caricamento distinto per uscite membri e Prima Squadra. Il grafico combinato e il suo riepilogo restano sospesi se manca una sorgente richiesta, anche se sono disponibili dati precedenti in cache. Le card entrate conservano il proprio significato. Le etichette e le descrizioni dichiarano quali filtri agiscono su previsioni, incassi e grafico.
- Nuovo pannello «Controllo quadrature e dati mancanti», su tutti i record caricati e indipendente dai filtri della pagina. Entrate registrate = incassato + residuo; residuo = non scaduto + scaduto. Per le uscite: dovuto = ricevute pagate + residuo; verifica ricevute/rate, superamenti del dovuto e ripartizioni per annata.
- Segnalazioni: dati mancanti, importi non validi, stati da verificare, ID ripetuti e possibili duplicati, senza modifiche o cancellazioni automatiche. Una quadratura aritmetica corretta non garantisce che non manchi una registrazione reale.
- Export Excel del controllo: quadrature, segnalazioni, entrate, rate e ricevute membri/senior. Esportazione disabilitata con sorgenti incomplete. File generato e riletto attraverso il codice di produzione: sette fogli e celle numeriche corrette; conferma visibile dell'avvio dell'esportazione. La consegna del file attraverso il download del browser collegato non è stata confermata; la relativa prova automatica è inclusa nella CI, non dichiarata eseguita.
- Layout: filtri Pagamenti dimensionati sul contenitore, campi altezza più leggibili e adattivi, intestazioni dei programmi atletici che vanno a capo. Campi mese/settimana con lingua coerente.
- Accessibilità: contrasto dei colori predefiniti chiari, testi dei pagamenti genitore e data iscrizione membri; nomi accessibili per selettori e comandi; filtri Magazzino come pulsanti selezionabili con `aria-pressed`, conservando le medesime selezioni di sezione. Nessun cambio a ruoli, regole sportive o dati reali.

## Prove eseguite

- `pnpm run test:finance`: cento registri misti, centesimi, scaduto/non scaduto, avvisi duplicati, pagamenti parziali e anomalie di ripartizione. Generazione/rilettura effettiva del workbook Excel, incluse ricevute e importi numerici.
- Typecheck e build frontend. Avvisi Vite preesistenti su sourcemap e dimensioni bundle.
- Applicazione React completa con API sintetiche isolate, tramite browser CUA: **27 combinazioni pagina/ruolo, 24 percorsi, 10 ruoli e nove larghezze**, da 320 a 1440 px, **243 misurazioni geometriche superate**. Il controllo verifica larghezza documento/contenitori principali, campi troppo stretti, caricamento effettivo e permanenza sul percorso richiesto. Tabelle e lavagne possono avere scorrimenti interni intenzionali.
- Controllo axe WCAG A/AA sulle stesse 27 combinazioni: **zero violazioni automatiche rilevate negli stati osservati**. Il registro pagamenti è stato controllato anche in tema scuro. Le animazioni finite e i font vengono stabilizzati prima della misura per evitare falsi allarmi di contrasto durante le dissolvenze.
- Prove aggiuntive: programma motori popolato con nove esercizi, modulo programma atletico aperto e grafico pagamenti aperto a nove larghezze; menu mobile contenuto a 320 px (cassetto 288 px); sorgente senior simulata in errore con grafico sospeso. Screenshot locali dei riepiloghi desktop/mobile e del caso di errore.
- Risultati riproducibili in `prelaunch-responsive-results.json` e `prelaunch-accessibility-results.json`. Sono risultati su **dati simulati**, non fotografie dei saldi della società.

## Esecuzione ripetibile

1. `pnpm run build:web`.
2. `pnpm run test:finance`.
3. Installazione browser di test: `pnpm exec playwright install --with-deps chromium firefox webkit`.
4. `pnpm run test:prelaunch`.

La suite enumera **816 casi** sui tre motori (geometria, accessibilità, errore sorgente e download Excel). In questa sessione sono stati usati i corrispondenti controlli attraverso CUA; i 816 casi standalone non sono stati eseguiti localmente. Il workflow `.github/workflows/prelaunch.yml` li esegue su push/PR interessati e conserva report, schermate e tracce degli errori. Nessun esito CI futuro è dato per acquisito.

I confronti pixel con baseline sono opzionali (`FTB_VISUAL_BASELINES=1`); le baseline vanno generate e revisionate con lo stesso motore della CI. La normale esecuzione salva gli screenshot e controlla geometria/funzioni: non va descritta come confronto pixel già attivo. Il server di prova è legato a `127.0.0.1`, non usa credenziali e rifiuta le mutazioni/API reali. Gli stub sono esterni all'entrypoint di produzione.

## Verifiche ancora esterne o non coperte

- Riconciliazione con cassa, banca e ricevute reali: richiesti società, periodo e documenti. Il controllo interno non è una certificazione del saldo né un bilancio completo di ogni costo/ricavo societario.
- BrowserStack e prove fisiche iPhone/Android non eseguiti; nessun account creato, abbonamento acquistato o dato personale caricato. WebKit in CI non equivale da solo a un iPhone fisico.
- La matrice copre i percorsi/stati elencati nei risultati, non ogni schermata secondaria, ogni dialogo o tutte le combinazioni di dati. Restano da validare sul campione reale i percorsi di allegati/import, stampe dei diversi documenti, tastiera fisica mobile e lavagne con dati complessi. Le regressioni API già presenti restano indipendenti dalle prove di layout.

Il capitolo 9 rimane il registro dei controlli per il lancio: non deve essere marcato come certificazione totale dell'app sulla sola base di questa matrice.
