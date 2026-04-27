# Deploy di test online

Questo repository e pronto per un deploy di test con:

- frontend statico su Vercel
- backend Express su Render
- database Postgres su Render

## Architettura

- `artifacts/football-training-board`: frontend Vite/React
- `artifacts/api-server`: backend Express
- `lib/db`: schema Drizzle/Postgres

Il frontend usa `VITE_API_URL` per puntare al backend Render. Inoltre le chiamate relative a `/api` vengono riallineate centralmente all'URL del backend, cosi il progetto resta compatibile sia in locale sia in deploy separato.

## Comandi corretti

Installazione:

```bash
pnpm install --frozen-lockfile
```

Build frontend:

```bash
pnpm --filter @workspace/football-training-board build
```

Build backend:

```bash
pnpm --filter @workspace/api-server build
```

Start backend buildato:

```bash
pnpm --filter @workspace/api-server start
```

Push schema database:

```bash
pnpm --filter @workspace/db push
```

Health check backend:

```bash
GET /api/healthz
```

## Variabili ambiente richieste

Backend Render:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_ORIGIN`
- `CORS_ALLOWED_ORIGINS`
- `PORT`
- `NODE_ENV`
- `SESSION_COOKIE_SAMESITE`
- `SESSION_COOKIE_SECURE`

Frontend Vercel:

- `VITE_API_URL`
- `BASE_PATH` facoltativa, di default `/`

File di esempio:

- [artifacts/api-server/.env.example](/C:/Users/conce/Desktop/GITHUB/Football-Training-Board/artifacts/api-server/.env.example:1)
- [artifacts/football-training-board/.env.example](/C:/Users/conce/Desktop/GITHUB/Football-Training-Board/artifacts/football-training-board/.env.example:1)

## Deploy backend su Render

Nel repo e presente [render.yaml](/C:/Users/conce/Desktop/GITHUB/Football-Training-Board/render.yaml:1) con:

- web service Node per `api-server`
- Postgres Render
- `preDeployCommand` per eseguire `pnpm --filter @workspace/db push`
- health check su `/api/healthz`

Dopo la creazione del servizio, imposta:

- `APP_ORIGIN=https://<frontend-vercel-url>`
- `CORS_ALLOWED_ORIGINS=https://<frontend-vercel-url>`

Se usi anche preview URLs di Vercel, puoi inserire piu origini separate da virgola in `CORS_ALLOWED_ORIGINS`.

## Deploy frontend su Vercel

Nel repo e presente [vercel.json](/C:/Users/conce/Desktop/GITHUB/Football-Training-Board/vercel.json:1).

Config prevista:

- install: `pnpm install --frozen-lockfile`
- build: `pnpm --filter @workspace/football-training-board build`
- output: `artifacts/football-training-board/dist/public`
- rewrite SPA verso `index.html`

In Vercel:

1. importa il repository
2. lascia come progetto il repo root
3. imposta `VITE_API_URL=https://<backend-render-url>`
4. esegui il deploy

## Checklist di test da smartphone

1. Apri l'URL pubblico Vercel.
2. Verifica che la landing carichi senza errori console bloccanti.
3. Prova login o verifica club.
4. Controlla che le richieste vadano verso il backend Render.
5. Verifica che il cookie di sessione venga creato dopo il login.
6. Apri dashboard e una pagina dati per confermare che frontend e backend siano separati ma integrati.

## Note operative

- Il backend adesso accetta origini pubbliche configurate via env, non solo `localhost`.
- In produzione i cookie di sessione sono configurati per deploy cross-origin con `SameSite=None` e `Secure=true`.
- Non ho potuto validare build e run completi dentro questo ambiente per il limite `spawn EPERM` del sandbox su Vite/esbuild. La configurazione e stata preparata e allineata al codice del repo.
