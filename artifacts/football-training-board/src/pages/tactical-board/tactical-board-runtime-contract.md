# Tactical Board Runtime Contract (Baseline)

Questo documento fissa il comportamento attuale della lavagna tattica per consentire refactor interni senza regressioni UX.

## 1) Scope e invarianti

- Route pubblica invariata: `/tactical-board`.
- Entry point runtime: `index.tsx` re-esporta `index_backup.tsx`.
- UI principale renderizzata tramite `TacticalBoardLayoutV2`.
- Nessun cambio richiesto a login, ruoli, URL pubbliche.

## 2) Contratto di entrypoint

- `index.tsx` importa `TacticalBoard` da `./index_backup` e restituisce quel componente.
- Qualsiasi refactor deve mantenere la route funzionante senza cambiare import esterni di `App.tsx`.

## 3) Contratto dati/stato (runtime attuale)

## 3.1 Stato board e canvas

- Stato elementi: `elements` (array di `BoardElement`) in `index_backup.tsx`.
- Stato canvas: `canvasSize`, `canvasRef`, gesture mouse/touch, drag/drop tool.
- Config campo: `fieldFormat`, `fieldType` (view), `fieldRenderMode`, `devicePreview`.
- Undo/redo: `history` e `redoStack`, esposti a layout con `canUndo`/`canRedo`.

## 3.2 Tooling e mapping layout

- Il layout usa tool ID (`select`, `move`, `erase`, `bezier`, ecc.).
- In `index_backup.tsx` c'e un mapping esplicito layout -> tool board:
  - `erase` -> `eraser`
  - `bezier` -> `curve`
  - `select`/`move` -> nessun drop tool

## 3.3 Salvataggi e persistenza

- `saveTactic()` salva tattiche in `localStorage` (`ftb-tactics`) con `{ name, elements }`.
- `loadTactic()` ricarica elementi da `savedTactics` e chiude la modale load.
- La board API server (`/api/boards`) e attualmente in-memory (non persistente dopo restart API).

## 3.4 Integrazione esercizi

- Query runtime attuali verso:
  - `GET /api/exercises`
  - `GET /api/exercises/my-teams`
- Draft update:
  - `PATCH /api/exercises/:id`
- Creazione nuovo esercizio:
  - `POST /api/exercises`
- Per creazione draft/esercizio vengono serializzati:
  - `drawingData` (PNG via `canvas.toDataURL`)
  - `drawingElementsJson` (JSON elementi disegno)

## 4) Contratto layout tra `index_backup` e `layout-v2`

Il componente `TacticalBoardLayoutV2` riceve almeno questi payload/callback come contratto runtime:

- titolo board: `boardTitle`, `onBoardTitleChange`
- tool: `activeTool`, `onToolChange`, `onToolDragStart`, `onToolTouchStart`
- azioni: `onSave`, `onOpen`, `onImport`, `onExport`, `onUndo`, `onRedo`
- stato storico: `canUndo`, `canRedo`
- campo: `fieldFormat`, `fieldView`, `fieldRenderMode`, `devicePreview` + relativi setter
- formazioni: `formations`, `onApplyFormation`
- pannello destra: `selectedElementLabel`, `selectedElementType`, `selectedElementDetails`
- librerie: `libraryItems`, `sessionItems`
- contenuto board: `boardContent` (canvas + overlay touch)

Ogni estrazione/modularizzazione deve mantenere invariato questo contratto fino a migrazione esplicita.

## 5) Elementi gia modularizzati (ma non completamente unificati)

- Gia agganciati nel runtime corrente:
  - `layout-v2.tsx`
  - `field-renderer.ts`
  - `canvas-renderer.ts`
- Presenti ma non centrali nel path runtime principale:
  - `board-types.ts`
  - `board-defaults.ts`
  - `category-config.ts`
  - `formations.ts` (esiste anche duplicazione logica locale in `index_backup.tsx`)
  - `use-team-players.ts`
  - `player-mapping.ts`
  - `quickpage.tsx` (non e l'entrypoint attuale)

## 6) Checklist manuale baseline (prima/dopo ogni micro-refactor)

Eseguire su `http://localhost:5184/tactical-board`.

1. **Caricamento pagina**
   - La pagina apre senza errore runtime e mostra la lavagna con toolbar/layout.

2. **Interazione canvas**
   - Aggiunta almeno un giocatore e un avversario.
   - Drag/spostamento elemento funzionante.

3. **Disegno e storico**
   - Tracciare una linea/freccia.
   - `Undo` e `Redo` funzionano correttamente.

4. **Formazione e campo**
   - Applicare una formazione rapida.
   - Cambiare formato campo (es. 11v11 -> 7v7) senza crash.

5. **Salvataggio locale board**
   - Salvare la tattica (`save`), riaprire (`open`) e verificare presenza elementi.

6. **Export**
   - Export PNG genera file scaricabile.

7. **Flusso esercizi**
   - Apertura/import da esercizi non rompe la lavagna.
   - In caso di draft, il caricamento in board mantiene editabilita quando disponibile `drawingElementsJson`.

## 7) Non obiettivi (in questo step)

- Nessuna modifica funzionale UI/UX.
- Nessuna sostituzione entrypoint.
- Nessuna migrazione persistenza board su DB.
