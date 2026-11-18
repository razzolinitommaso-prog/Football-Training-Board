# Programmi torneo con più colonne datate

Lettore aggiuntivo: src/lib/tournament-dated-columns.ts. Attivato soltanto per girone unico, due–quattro colonne con intestazioni giorno/data e anno determinabile. Non interviene nei casi con finali esplicite o struttura incerta: resta il parser esistente.

- Associa ogni orario alla propria colonna; conserva le righe successive con lo stesso orario.
- Risolve dicembre/gennaio con controllo del giorno della settimana.
- Riusa il riconoscimento società/alias già presente, senza cambiare termini di ricerca, OCR o pulsanti.
- Passa ogni occorrenza al lettore esistente separatamente: stesso avversario in giornate diverse rimane distinto.
- I nuovi programmi solo-girone conservano finalsPolicy=program-only nelle API storiche e condivise. I programmi precedenti non cambiano.
- Nessuna reimportazione automatica dei tornei reali: la correzione di un import precedente passa dall'anteprima e dalle protezioni dati già presenti.

## Verifiche riproducibili

Node, dipendenze del repository ed Edge/Playwright del runtime Codex Windows:

    node scripts/test-tournament-dated-columns.cjs "<percorso TORNEO NATALE 2019.pdf>"
    node scripts/test-shared-tournaments.cjs "<percorso al pacchetto @electric-sql/pglite>"

Il primo usa il PDF originale senza scritture nell'app, confronta tutte le 25 coppie/data/orario e le 9 gare Fortis; confronta anche otto risultati del parser precedente (commit 346aba1), inclusi alias Borgo San Lorenzo, denominazione estesa, gironi e finali. Il commit di confronto deve essere disponibile nella cronologia Git.

Il secondo usa PostgreSQL isolato e verifica round-trip della politica senza finali, date/fasi e protezione delle gare collegate. Non carica credenziali dell'app o dati di produzione. Il mancato riconoscimento di un layout nuovo conserva il comportamento precedente: non è una garanzia di lettura di qualunque locandina.

## Estensione ai blocchi verticali e importazione per annata

Il lettore aggiuntivo readDatedTournamentBlocks copre giornate separate verticalmente, senza cambiare readDatedTournamentColumns o le funzioni di alias/ricerca. Entrambi producono occorrenze con data completa per il parser PDF condiviso (base e clone).

Nella scheda del torneo condiviso, Carica programma dell’annata legge PDF o immagini e apre l’editor in anteprima. Il salvataggio usa tournamentId e teamId dell’annata scelta. Gli incontri esistenti restano e il reimport conserva ID, collegamenti e assegnazioni manuali; gli incontri delle altre società rimangono solo programma. Le fasi vengono proposte solo se univoche; date fuori dal torneo e fasi mancanti sono segnalate prima del salvataggio. Nessun aggiornamento automatico alle date comuni.

Verifiche aggiuntive:

    node scripts/test-tournament-dated-columns.cjs "<2019.pdf>" "<2017.pdf>"
    node scripts/test-shared-tournament-import-ui.cjs "<2017.pdf>" "<2019.pdf>"

La seconda prova usa componenti e lettori reali in Edge con API simulata, verificando anteprima senza scritture, due annate separate, riimportazione, annullamento e avviso di date fuori intervallo. Non opera nell’app di produzione.


## Programmi con gironi, avversari numerati e orari centrati

Il fallback spaziale tournament-schedule-layout.ts legge intestazioni datate esplicite e colonne di girone. Gestisce squadre ancora indicate con un numero e finali stampate come riferimenti di classifica, senza inventare società né attribuire finali alla Fortis. Le righe di riposo non generano gare. Gli orari al centro dei blocchi vengono associati alle righe più vicine; ambiguità o giorni della settimana incompatibili fanno rinunciare a questo percorso. La lettura precedente mantiene la precedenza quando è completa. Ricerca società e alias invariati.

Verifica: node scripts/test-tournament-folder.cjs <cartella>, insieme al test 2017/2019 e confronti legacy. Sei documenti: 92 righe di programma, 30 gare Fortis note, 6 finali da definire. Il duplicato (1) va escluso.
