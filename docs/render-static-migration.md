# FTB — Static frontend migration

Status (2026-11-01): separate static frontend deployed successfully at https://football-training-board-static.onrender.com from main commit 8c2d18a. Service srv-dbje2d2jnfac73fnmt30; initial deployment dep-dbje2dajnfac73fnmtjg. Created manually with the settings below; this Blueprint is a reproducible configuration, not the linked live service. SPA rewrite saved. API CORS now includes both the existing frontend and the new static origin; API deployment dep-dbje34nb9u1s73dp2pp0 is Live. Production build, static deep links, CORS preflight (204) and API health (200) passed. Browser reload reaches the FTB club login. Authenticated flows and mobile cutover remain pending; the old frontend and mobile address are unchanged.

## Create the static site

Use the existing GitHub repository and branch main. Create a separate Blueprint with path render-static.yaml, or New → Static Site with equivalent settings:

- Root directory: repository root.
- Build: pnpm install --frozen-lockfile && pnpm run build:web
- Publish directory: artifacts/football-training-board/dist/public
- VITE_API_URL: https://football-training-board-api.onrender.com
- Rewrite /* → /index.html (Rewrite, not Redirect).
- No start command, no pre-deploy command, no database connection or secrets in the static build.

The Blueprint declares only the new static frontend. Do not apply the original render.yaml for this migration: it also describes API and database. Do not delete the existing frontend to reserve or reuse its subdomain.

## Connect the existing API

Read the actual HTTPS origin assigned by Render; the service name alone does not guarantee the final URL. In the existing API's CORS_ALLOWED_ORIGINS append that exact origin, preserving every existing entry. Keep APP_ORIGIN unchanged until the new site and links are validated. Preserve SESSION_SECRET, DATABASE_URL and cookie settings. The app already routes API requests to VITE_API_URL, includes credentials and supports bearer sessions. Never use a wildcard CORS origin with credentials.

Creating the static site alone does not permit its authenticated requests until its origin is allowed. A server restart caused by an environment change may trigger a cold start. No paid upgrade is part of this procedure.

## Acceptance before cutover

1. Check the production build, CSS/JS MIME types and deep routes after a direct refresh (dashboard, training with sessionId, tactical board with parameters).
2. Test sign-in, sign-out and a reload with an authenticated test account; verify role/section boundaries.
3. Read an existing roster/session without changing real data. Test saving and PDF export only with designated test records or a separate test environment.
4. Test the tactical board iframe, return to the station form, image preview and materials merge.
5. Test mobile browser and the actual mobile application. Confirm CORS and cookies in their respective origins.
6. Check API health and database persistence. Static hosting does not remove API sleeping, quota, bandwidth or database limits.

## Mobile address and final cutover

capacitor.config.ts currently stores https://football-training-board.onrender.com in server.url. Existing installed clients do not automatically discover a new static-site address. After the new URL is live and verified, decide how to update that stored address and distribute the change. A redirect from a sleeping old web service can still show Render's wake-up screen, so it is not sufficient to guarantee its removal.

Keep the old service available during validation; its continued running consumes instance hours. After links and installed clients have migrated, stop the old frontend with an explicit cutover decision. Retain its configuration for rollback; do not delete services or databases. Update APP_ORIGIN and externally generated links only at that stage.

## Render wake-up page

The static frontend is served by CDN and does not have the free web-service cold-start page. The API may still wake slowly; an in-app FTB loading state can describe that wait, without navigating the browser to the API. This does not remove the API wait or replace a paid compute plan.

References:
- https://render.com/docs/static-sites
- https://render.com/docs/blueprint-spec
- https://render.com/docs/redirects-rewrites
- https://render.com/docs/free
