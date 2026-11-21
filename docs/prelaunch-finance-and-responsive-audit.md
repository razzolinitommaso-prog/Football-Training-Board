# Controllo pre-lancio: contabilità e responsive

Analisi del 21 novembre 2026, revisione applicativa `d431b84`. Questo documento descrive verifiche concluse e lavoro proposto; non certifica i saldi reali e non dichiara completato il collaudo responsive.

## Calcoli verificati

- Il registro somma ogni movimento una sola volta in centesimi, distinguendo incassato, non scaduto e scaduto. Il grafico attribuisce gli incassi alla data di pagamento e i debiti alla scadenza. Dati senza data/orario hanno avvisi specifici.
- Il nuovo saldo quote aggiorna record esistenti; i servizi separati non entrano nel saldo quote. Regressione `--payment-desk` superata durante il precedente intervento di questa conversazione.
- Previsione: entrate incassate più debiti datati dei giocatori idonei alla previsione. Inattivi/non tesserati non alimentano la previsione dei futuri incassi; gli incassi storici e i debiti registrati restano nel registro. Il potenziale kit è una stima distinta.
- Uscite membri e senior: pagamenti effettivi più residuo da pagare, ripartizione per annata cumulativa in centesimi. Gli ID delle rate senior vengono separati da quelli membri nel grafico. Dati TEST esclusi dai riepiloghi reali.
- Eseguiti e superati `--member-services`, `--societies --member-services --withdrawals` e `test-kit-payment-summary.cjs`. Copertura: rate/termini FM, ripartizioni, parziali, richieste ripetute, società separate, senior, esclusione TEST, kit non duplicati nel piano. Il primo avvio della suite società senza i moduli richiesti è fallito nel solo harness con rotta stagioni assente; l'invocazione completa è passata.

## Punti aperti prima del lancio

1. `PaymentsPage` segnala errori delle uscite membri ma non quelli della query `playerExpenses`: una risposta senior fallita viene sostituita da liste vuote. Il grafico può risultare parziale senza avviso specifico. Occorre un segnale di completezza comune alle sorgenti e un pulsante di riprova per ciascuna.
2. Le serie e il selettore dicono «uscite membri», ma comprendono anche la Prima Squadra. I filtri giocatore/categoria/stato/metodo nascondono le uscite; la previsione annuale usa annata/categoria/ricerca e un periodo proprio, mentre le card di incasso usano anche mese/stato/metodo. Sono ambiti diversi nel codice: vanno resi espliciti per impedire confronti fuorvianti.
3. Il sistema mostra le tipologie registrate: non è dimostrato che comprenda ogni ricavo/costo della società. Per confermare i saldi reali serve una riconciliazione per società e periodo con ricevute, cassa e banca; elenco di movimenti senza data/metodo, duplicati sospetti, incassi oltre il dovuto e scarti tra registro, schede ed export. Nessun confronto con documenti contabili reali eseguito in questa analisi.

## Proposta di collaudo unico

Prima fase: riconciliazione numerica e segnalazioni di dati incompleti. Per ogni insieme filtrato: totale registrato = incassato + residuo; residuo = non scaduto + scaduto. Per le uscite: dovuto = pagato + residuo; somma delle quote per annata = totale contratto. Confrontare API, schede, grafici ed export sullo stesso insieme e periodo, oltre ai documenti reali.

Seconda fase: matrice di ruoli/pagine/stati con dati simulati riproducibili. Larghezze 320, 360, 390, 430, 768, 820, 1024, 1280 e 1440 px, orientamenti e dimensioni intermedie; sidebar aperta/chiusa, testi lunghi, liste vuote/piene, errori, modali e zoom testo. Controllare navigazione, leggibilità, spazio disponibile, nessuna sovrapposizione e scorrimento orizzontale limitato ai contenitori di tabelle/grafici dichiarati. Verificare anche salvataggio/riapertura, import, export, allegati, permessi e sincronizzazione.

Strumenti proposti: Playwright per emulazione e confronti visivi ripetibili; axe-core/axe DevTools per i controlli automatici di accessibilità; BrowserStack per completare il controllo su browser e dispositivi reali, in particolare iPhone/Safari. Servizi esterni non attivati e nessun dato personale trasmesso durante questa analisi. Nell'ambiente Codex le interazioni browser devono passare dal controllo browser autorizzato; una futura suite CI è un'implementazione separata, non eseguita qui.

Criterio di chiusura: registro pagine/ruoli/dispositivi verificati, schermate approvate, difetti critici risolti, scarti contabili spiegati, prove automatiche ripetibili dopo gli aggiornamenti e limiti residui dichiarati. Nessuno strumento garantisce da solo l'assenza futura di difetti.

Riferimenti ufficiali: https://playwright.dev/docs/emulation ; https://playwright.dev/docs/test-snapshots ; https://www.browserstack.com/docs/testing-toolkit/responsive-testing ; https://www.browserstack.com/docs/percy ; https://www.deque.com/axe/devtools/extension/ .
