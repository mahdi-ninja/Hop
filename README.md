# Hop

A small, self-hosted URL shortener on Cloudflare Workers + D1, with a team dashboard
protected by Cloudflare Access.

See `docs/` for the spec, architecture, API contract, and deployment steps.

## Local development

Requires Node.js LTS.

```sh
npm install                      # root + dashboard (npm workspace)
cp .dev.vars.example .dev.vars   # sets DEV_AUTH_EMAIL for the localhost-only auth bypass
npm run db:migrate:local         # create the local D1 schema
npm run dev                      # builds the dashboard, then http://localhost:8787/admin
```

`wrangler.jsonc` sets `dev.host` to `localhost` so the Worker sees `localhost` as its host
under `wrangler dev` (otherwise wrangler rewrites it to the production route).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Build the dashboard into `public/admin`, then run the Worker via `wrangler dev` |
| `npm run dev:dashboard` | Vite dev server with hot reload (proxies `/api` to the Worker on :8787; run `npm run dev` alongside) |
| `npm run build:dashboard` | Build the dashboard only |
| `npm run deploy` | Build the dashboard, then `wrangler deploy` |
| `npm run typecheck` | `tsc` for the Worker and the dashboard |
| `npm test` | Portability boundary check, then Vitest in the Workers runtime |
| `npm run db:migrate:local` | Apply migrations to the local D1 database |
| `npm run db:seed:local` | Replace local data with ~10 demo links and a few thousand visits |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |
| `npm run check:boundaries` | Fails if Cloudflare-specific APIs leak outside `src/worker.ts` / `src/adapters/` |
