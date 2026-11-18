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
