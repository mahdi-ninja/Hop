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
npm run dev                      # builds the dashboard, then http://go.localhost:4696/admin
```

For dashboard work with hot reload, keep `npm run dev` running and start
`npm run dev:dashboard` (Vite on http://go.localhost:4697/admin/, proxying `/api` to the Worker).

Locally, short links live on `go.localhost:4696`, so the links the dashboard shows and copies
actually work: `http://go.localhost:4696/<slug>` redirects through your local Worker. Browsers
and macOS send any `*.localhost` name to your own machine, so there's nothing to configure.
The ports (4696 for the Worker, 4697 for Vite) are unassigned by IANA, so they're unlikely to
clash with other tools. To change the Worker port, edit `dev.port`, `dev.host` and
`SHORT_DOMAIN` in `wrangler.jsonc` together (a test checks they match).

Locally, Access isn't in the loop: when `DEV_AUTH_EMAIL` is set **and** the request is
addressed to `localhost`, a `*.localhost` name or `127.0.0.1`, the Worker uses that email instead
of verifying a JWT. Cloudflare only routes your real domain to the deployed Worker, so a
production request can never look local. Never put `DEV_AUTH_EMAIL` in `wrangler.jsonc`.

## Deploy

```sh
npm run setup     # first time: asks about domain, database and Access, then deploys
npm run deploy    # afterwards
```

Your deployment's values live in the git-ignored `hop.config.json`; `wrangler.jsonc` stays a
template with placeholders. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for what each step
does, the Access options, and a manual fallback.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Build the dashboard into `public/admin`, then run the Worker on http://go.localhost:4696 |
| `npm run dev:dashboard` | Vite dev server with hot reload on :4697 (proxies `/api` to the Worker on :4696) |
| `npm run build:dashboard` | Build the dashboard only |
| `npm run typecheck` | `tsc` for the Worker and the dashboard |
| `npm test` | Portability boundary check, then Vitest in the Workers runtime |
| `npm run check:boundaries` | Fails if Cloudflare-specific APIs leak outside `src/worker.ts` / `src/adapters/`, or `c.env` is read outside `src/app.ts` |
| `npm run db:migrate:local` | Apply migrations to the local D1 database |
| `npm run db:seed:local` | Replace local data with ~10 demo links and a few thousand visits |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database (uses `hop.config.json`) |
| `npm run setup` | Interactive first deploy: account, domain, database, Access, then deploy |
| `npm run deploy` | Preflight checks, build, remote migrations, deploy, live checks |
| `npm run doctor` | Check deploy readiness without changing anything (`-- --live` also checks the site) |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |

## Notes

- `compatibility_date` is pinned to the newest date supported by the workerd bundled with
  `@cloudflare/vitest-pool-workers`, so tests and production run the same runtime behaviour.
- Dashboard fonts (Bricolage Grotesque, DM Sans, DM Mono) are self-hosted from `dashboard/public/fonts`
  under the SIL Open Font License (licence files alongside), so the admin UI makes no third-party requests.
- `ua-parser-js` is pinned to `^1` (MIT). v2 is AGPL — do not upgrade.
