# Sessioni motorie, stazioni e valutazione — 19 novembre 2026

## Funzionamento

Il programma si riordina per trascinamento, con supporto touch e frecce accessibili. Il salvataggio aggiorna l’ordine delle esercitazioni interne della stazione già collegata e la durata complessiva. Le descrizioni personalizzate, le note, le varianti e le lavagne modificate restano conservate. Metadati illeggibili o stazione rimossa producono un conflitto visibile, senza riscrittura distruttiva.

Ogni prova contiene descrizione operativa, materiali e un disegno illustrativo originale. Le esercitazioni della stazione includono una lavagna modificabile, l’anteprima illustrativa e il collegamento alla medesima sessione motoria. La lavagna modificabile usa sagome/gesti e materiali già supportati dall’app; il disegno illustrativo non è una tavola ufficiale TGMD-3.

La registrazione distingue familiarizzazione e conferme, validità, tentativo osservato, condizioni di esecuzione, misure e quattro osservazioni didattiche. Ogni risposta Sì/No/Non osservato ha la propria nota; restano le note generali. I vuoti non diventano risposte negative. I campi storici e le note precedenti non vengono cancellati o interpretati automaticamente.

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
