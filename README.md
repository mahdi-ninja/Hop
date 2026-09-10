# Hop

A small, self-hosted URL shortener on Cloudflare Workers + D1, with a team dashboard
protected by Cloudflare Access.

- `https://<SHORT_DOMAIN>/<slug>` redirects (302) to the link's target and records a visit
  (country, referrer host, device, browser, OS, bot flag — never IP addresses).
- `/admin` is a React dashboard for creating, searching, editing and deleting links,
  with per-link analytics, QR codes and an overview page.
- `/admin` and `/api` sit behind Cloudflare Access; the Worker also verifies the Access JWT itself.

Design docs live in `docs/`: [spec](docs/SPEC.md), [architecture](docs/ARCHITECTURE.md),
[API](docs/API.md), [deployment](docs/DEPLOYMENT.md).

## Local development

Requires Node.js LTS.

```sh
npm install                      # root + dashboard (npm workspace)
cp .dev.vars.example .dev.vars   # sets DEV_AUTH_EMAIL for the localhost-only auth bypass
npm run db:migrate:local         # create the local D1 schema
npm run db:seed:local            # optional: demo links and visits
npm run dev                      # builds the dashboard, then http://localhost:8787/admin
```

For dashboard work with hot reload, keep `npm run dev` running and start
`npm run dev:dashboard` (Vite on http://localhost:5173/admin/, proxying `/api` to :8787).

Locally, Access isn't in the loop: when `DEV_AUTH_EMAIL` is set **and** the request is
addressed to `localhost`/`127.0.0.1`, the Worker uses that email instead of verifying a JWT.
`wrangler.jsonc` sets `dev.host` to `localhost` so the Worker sees `localhost` as its host
under `wrangler dev` (otherwise wrangler rewrites it to the production route). Never put
`DEV_AUTH_EMAIL` in `wrangler.jsonc`.

## Deploy

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): create the D1 database, set your domain
and Access values in `wrangler.jsonc`, set up the Cloudflare Access application, then:

```sh
npm run db:migrate:remote
npm run deploy
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Build the dashboard into `public/admin`, then run the Worker via `wrangler dev` |
| `npm run dev:dashboard` | Vite dev server with hot reload (proxies `/api` to the Worker on :8787) |
| `npm run build:dashboard` | Build the dashboard only |
| `npm run typecheck` | `tsc` for the Worker and the dashboard |
| `npm test` | Portability boundary check, then Vitest in the Workers runtime |
| `npm run check:boundaries` | Fails if Cloudflare-specific APIs leak outside `src/worker.ts` / `src/adapters/`, or `c.env` is read outside `src/app.ts` |
| `npm run db:migrate:local` | Apply migrations to the local D1 database |
| `npm run db:seed:local` | Replace local data with ~10 demo links and a few thousand visits |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database |
| `npm run deploy` | Build the dashboard, then `wrangler deploy` |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |

## Notes

- `compatibility_date` is pinned to the newest date supported by the workerd bundled with
  `@cloudflare/vitest-pool-workers`, so tests and production run the same runtime behaviour.
- `ua-parser-js` is pinned to `^1` (MIT). v2 is AGPL — do not upgrade.
