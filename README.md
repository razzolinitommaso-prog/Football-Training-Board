# Football Training Board

## Setup locale Gavinana (un solo comando)

### Prerequisiti

- **Node.js** (LTS consigliata)
- **pnpm** installato globalmente
- **PostgreSQL** in esecuzione in locale
- File **`artifacts/api-server/.env`** con `DATABASE_URL` (es. `postgres://postgres:postgres@localhost:5432/football_app`) e `SESSION_SECRET`

### Comandi minimi

```bash
pnpm install
pnpm setup-local
```

`pnpm setup-local` esegue in sequenza:

1. push schema database (`@workspace/db`)
2. import da `artifacts/db-export` (`import-db`)
3. test login (`test-login`)

In caso di errore su uno step, il processo si interrompe subito.

### Avvio manuale (dopo il setup)

```bash
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/football-training-board dev
```

### Credenziali utente di test (dopo `import-db`)

- **Email:** test@gavinana.it  
- **Password:** 123456

## Deploy di test online

Configurazione e checklist deploy in [DEPLOY.md](/C:/Users/conce/Desktop/GITHUB/Football-Training-Board/DEPLOY.md:1).
