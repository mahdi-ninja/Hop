# Hop — Architecture

Hop is one Hono app with two hosts: Cloudflare Workers (D1, Cloudflare Access) and Node on
Docker (SQLite, an auth proxy or Access). Everything outside `src/adapters/` and the two entry
points is shared; see "Portability boundaries" and "Docker runtime".

## Stack
| Concern | Choice |
|---|---|
| Runtime | Cloudflare Workers (TypeScript, ES modules); or Node on Docker (see below) |
| Router | Hono |
| Database | Cloudflare D1 (SQLite), migrations via `wrangler d1 migrations`; SQLite file on Docker |
| Auth | Cloudflare Access, JWT verified in the Worker with `jose`; on Docker also oauth2-proxy or Authelia via trusted headers |
| UA parsing | `ua-parser-js` **pinned to `^1`** (v1 is MIT; v2 is AGPL — do not upgrade) |
| Dashboard | React + Vite + TypeScript, served by Workers Static Assets (or `serve-static` on Node) |
| Dashboard styling | Tailwind CSS |
| Charts | Recharts |
| QR codes | `qrcode` (npm), browser-side |
| Tests | Vitest: `@cloudflare/vitest-pool-workers` for the Worker, plain Node for the Node adapters |
| Config | `wrangler.jsonc` on Workers; `.env` (environment variables) on Docker |
| Docker runtime | Node 24, `@hono/node-server`, built-in `node:sqlite`, bundled with `esbuild` (see "Docker runtime") |
| Docker preset | Docker Compose; Caddy (TLS + routing); oauth2-proxy or Authelia (sign-in) |

## Repo layout
```
hop/
  AGENTS.md               # rules for AI coding agents working on the repo
  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  CHANGELOG.md  LICENSE
  README.md
  docs/                   # SPEC, ARCHITECTURE, API, DEPLOYMENT (chooser), CLOUDFLARE-CHECKLIST,
                          # deploy/cloudflare.md and deploy/docker.md; images/ for the README
  wrangler.jsonc          # committed template; works for local dev as is
  hop.config.json         # per-deployment values written by `npm run setup` (git-ignored)
  package.json            # Worker package + orchestration scripts (npm workspace root)
  tsconfig.json           # Worker + shared code (Workers types)
  tsconfig.node.json      # Node entry + Node adapters (Node types)
  vitest.config.ts  .dev.vars.example  .nvmrc
  .github/                # CI and image-publishing workflows, issue and PR templates
  migrations/
    0001_init.sql
    0002_routing_rules.sql
  scripts/
    setup.mjs  deploy.mjs  doctor.mjs   # interactive setup, deploy pipeline, readiness checks
    setup-docker.mjs                    # interactive Docker setup; writes .env
    build-node.mjs                      # esbuild bundle of src/node.ts → dist/node.mjs
    seed-local.mjs                      # demo data for local dev
    ensure-dev-vars.mjs                 # creates .dev.vars for `npm run dev` when missing
    check-boundaries.mjs                # enforces the portability rules below
    lib/                                # prompts, Cloudflare API, checks, config merging,
                                        # docker-config (.env), docker-checks (doctor --docker),
                                        # docker-export (setup:docker --export)
  src/
    worker.ts             # Cloudflare entry: builds Services from env, mounts app
    node.ts               # Docker/Node entry: builds Services from process.env, serves the app
    app.ts                # createApp(): Hono app + route wiring; runtime-agnostic
    core/
      ports.ts            # interfaces: LinkStore, VisitStore, GeoLookup, IdentityProvider
      types.ts            # Link, NewVisit, Visit, Stats, Identity, Range, routing rules, etc.
      services.ts         # Services type + Hono context typing
    routes/redirect.ts    # GET/HEAD /:slug, GET /
    routes/api.ts         # /api/* (all behind requireIdentity)
    routes/admin.ts       # /admin/* static assets + SPA fallback
    routes/icons.ts       # public /favicon.ico, /favicon.svg, /apple-touch-icon.png
    middleware/auth.ts    # requireIdentity: calls IdentityProvider, CSRF checks
    lib/slug.ts           # generation + validation + reserved list
    lib/url.ts            # target validation, query-string merge, local-host helpers
    lib/visit.ts          # read the visitor (geo, UA, referrer, language, bot) and build NewVisit
    lib/routing.ts        # routing rule validation and first-match evaluation
    lib/title.ts          # background <title> fetch and extraction
    lib/range.ts          # stats date ranges
    lib/cursor.ts         # opaque pagination cursors
    lib/errors.ts         # error helper matching API.md
    pages/notFound.ts     # 404 HTML
    adapters/
      sql/                # SqlLinkStore, SqlVisitStore and the SqlRunner interface (all SQL lives here)
      d1/                 # SqlRunner on D1, plus D1LinkStore / D1VisitStore
      cloudflare/geo.ts   # GeoLookup from request.cf
      cloudflare/access.ts # IdentityProvider verifying Access JWTs
      dev/devIdentity.ts  # local-only dev bypass IdentityProvider
      sqlite/             # SqlRunner on node:sqlite, openDatabase, migration runner
      node/               # env config, static assets, background tasks for the Node entry
      proxy/identity.ts   # IdentityProvider trusting the auth proxy's headers
      proxy/geo.ts        # GeoLookup from Cloudflare visitor-location headers, or none
  test/
    fakes/                # in-memory LinkStore/VisitStore used by route tests
    node/                 # plain-Node tests: SQLite, migrations, proxy adapters, Docker setup
  dashboard/              # React SPA (npm workspace)
    vite.config.ts        # base: '/admin/', outDir: '../public/admin', dev server on :4697
    public/               # favicons and self-hosted fonts (OFL licences alongside)
    src/                  # api client, components, pages, lib
  public/                 # build output for Static Assets (git-ignored)
  Dockerfile              # multi-stage: build dashboard + bundle src/node.ts, run on node:24-slim
  compose.yaml            # hop + caddy and an auth proxy, or cloudflared (by profile)
  .env.example            # Docker preset settings; `npm run setup:docker` writes .env (git-ignored)
  .dockerignore           # keeps secrets, build output and docker/ out of the image build
  docker/
    caddy/                # Caddyfile, auth-<provider>.caddy and geo-<source>.caddy snippets
    authelia/             # configuration.yml, users.yml.example (users.yml is git-ignored)
    oauth2-proxy/         # emails.txt.example (emails.txt is git-ignored)
  dist/                   # bundled Node server (git-ignored)
  hop-stack/              # stack exported by `setup:docker -- --export` (git-ignored)
```

## Portability boundaries
Hop runs on two runtimes: Cloudflare Workers and Node (the Docker preset, see "Docker runtime").
The database, geo lookup, and auth are kept behind interfaces, so each runtime is a set of
adapters plus an entry point — routes and business logic are shared and never know which
runtime they're on.

### Rules
- Only `src/worker.ts` and files under `src/adapters/cloudflare/` and `src/adapters/d1/`
  may reference `env.DB`, `D1Database`, `request.cf`, `Cf-Access-*` headers, or
  `CF_Authorization`. The one exception is `src/node.ts`, which may import
  `AccessIdentityProvider` for Access-behind-a-tunnel deployments.
- Only `src/node.ts` and files under `src/adapters/node/`, `src/adapters/sqlite/` and
  `src/adapters/proxy/` may import `node:*` modules, read `process.env`, use `DatabaseSync`, or
  reference the trusted proxy headers (`X-Hop-*`, `CF-IP*` / `CF-Region` geo headers).
- `scripts/check-boundaries.mjs` (run by `npm test`) enforces both rules.
- Routes and `lib/` get everything via a `Services` object on the Hono context
  (`c.get('services')`), never from `c.env` directly (except `SHORT_DOMAIN`-style config,
  which is passed in as a plain `Config` object inside `Services`).
- All SQL lives in `src/adapters/sql/`: `SqlLinkStore` and `SqlVisitStore` run on a small
  `SqlRunner` interface (`first`, `all`, `run`, atomic `batch`), implemented once for D1
  (`adapters/d1/runner.ts`) and once for node:sqlite (`adapters/sqlite/runner.ts`). Keep the SQL
  standard SQLite (no D1-only features). Both runtimes apply the same `migrations/*.sql` files.
- `ctx.waitUntil` is only called from the entry point / adapters via a `defer(promise)`
  function in `Services`, so background work isn't tied to the Workers API either.
- Hop ships the Cloudflare and Node adapters (plus the in-memory fakes used in tests). A new
  runtime means new adapters and a new entry point, not changes to routes or `lib/`.

### Interfaces (`src/core/ports.ts`)
```ts
export interface LinkStore {
  getBySlug(slug: string): Promise<Link | null>;
  list(q: { search?: string; cursor?: string; limit: number }): Promise<{ items: Link[]; nextCursor: string | null }>;
  create(input: { slug: string; url: string; title: string | null; by: string }): Promise<Link>; // throws SlugTakenError
  update(slug: string, patch: { url?: string; title?: string | null; rules?: RoutingRule[] }, by: string): Promise<Link | null>;
  delete(slug: string): Promise<boolean>;   // also deletes the link's visits
  setTitleIfEmpty(slug: string, title: string): Promise<void>;
}

export interface VisitStore {
  record(visit: NewVisit): Promise<void>;   // inserts visit; bumps visit_count if !isBot
  linkStats(slug: string, range: Range, includeBots: boolean): Promise<LinkStats>;
  recentVisits(slug: string, limit: number, includeBots: boolean): Promise<Visit[]>;
  overview(range: Range, includeBots: boolean): Promise<Overview>;
}

export interface GeoLookup {
  lookup(req: Request): Promise<{ continent: string | null; country: string | null; region: string | null; city: string | null }>;
}

export interface IdentityProvider {
  identify(req: Request): Promise<Identity | null>;  // Identity = { email: string }; null = unauthenticated
}

export interface AssetServer {
  fetch(req: Request): Promise<Response>;
}

export interface Services {
  links: LinkStore;
  visits: VisitStore;
  geo: GeoLookup;
  identity: IdentityProvider;
  defer(p: Promise<unknown>): void;         // background work (waitUntil on Workers)
  assets: AssetServer;                      // serves dashboard files (env.ASSETS on Workers)
  config: { shortDomain: string; rootRedirectUrl: string | null; authConfigured: boolean };
}
```
Shapes of `Link`, `LinkStats`, `Overview`, `Visit` mirror API.md (camelCase); adapters
map to and from snake_case columns.

`src/worker.ts` builds `Services` per request from `env` and `ctx`, then calls the app
created by `createApp()`; `src/node.ts` builds them once at startup. The Hono app itself never
knows which runtime it's on, and `routes/admin.ts` serves the dashboard through `services.assets`.

### Testing benefit
Route and logic tests use the in-memory fakes in `test/fakes/`, so they're fast and
runtime-independent. The D1 adapters and the Access provider get their own tests in
the Workers test pool; the SQLite adapters, migration runner and proxy adapters get theirs in a
second, plain-Node Vitest project (`vitest.config.ts` defines both).

## Request flow
On Workers (for Docker, see "Docker runtime → Compose preset"):
```
Visitor ──GET /abc──▶ Worker ──read links by slug──▶ D1
                        │
                        ├──▶ (link has rules) read visitor + resolveTarget()   (in-memory)
                        ├──▶ 302 Location: target   (response sent)
                        └──▶ ctx.waitUntil: INSERT visit + UPDATE visit_count (db.batch)

Team member ──/admin/*──▶ Cloudflare Access (login) ──▶ Worker ──▶ env.ASSETS (SPA)
Dashboard   ──/api/*────▶ Cloudflare Access ──▶ Worker ──verify JWT──▶ Hono API ──▶ D1
```

Route precedence in the app, on both hosts (first match wins):
1. `/api/*` → API (requires sign-in)
2. `/admin` and `/admin/*` → static assets via `services.assets.fetch`; if the asset 404s,
   serve `/admin/index.html` (SPA fallback). Also require sign-in here (defence in depth).
3. `/health` → `ok` (used by the Docker healthcheck, `deploy` and `doctor`)
4. `/` → root redirect
5. `/:slug` → redirect
6. anything else (e.g. multi-segment paths) → 404 page

## Configuration
This section covers Workers; Docker is configured with environment variables from `.env` (see
"Docker runtime → Configuration").

`wrangler.jsonc` is a committed template that runs local dev as is: `SHORT_DOMAIN` is
`go.localhost:4696` (with `dev.port: 4696`) and the Access values are placeholders. It has no
`dev.host` and no route, so under `wrangler dev` the Worker sees the real `Host` header; the
local sign-in shortcut depends on that to reject DNS-rebinding requests. Production values
live in the git-ignored `hop.config.json` (account, domain, D1 database, Access team domain and
AUD, root redirect). `npm run deploy` merges the two into `.wrangler/deploy/wrangler.production.json`
(`scripts/lib/hop-config.mjs`), rebasing relative paths, and deploys that file.

`workers_dev: false` and `preview_urls: false` matter: they stop anyone reaching the Worker on
a `*.workers.dev` or preview URL that isn't behind Access. `doctor` and a test check them. The one
exception is a deployment whose `shortDomain` is its own `hop.<subdomain>.workers.dev` address:
the merged config then sets `workers_dev: true` and no custom-domain route, and the Access
application covers `/admin` and `/api` on that hostname instead. Preview URLs stay off either way.

When the Access values are missing or placeholders, `Config.authConfigured` is false and
`requireIdentity` answers `/admin` and `/api` with a 503 `NOT_CONFIGURED` instead of a bare 401
(the local dev bypass still works).

## Database schema (`migrations/0001_init.sql`, `0002_routing_rules.sql`)
```sql
CREATE TABLE links (
  slug         TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  title        TEXT,
  visit_count  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,          -- UTC ms
  created_by   TEXT,
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT
);
CREATE INDEX idx_links_created_at ON links(created_at DESC);

CREATE TABLE visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  ts            INTEGER NOT NULL,         -- UTC ms
  country       TEXT,
  region        TEXT,
  city          TEXT,
  referrer_host TEXT,
  device        TEXT,                     -- desktop | mobile | tablet | other
  browser       TEXT,
  os            TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_visits_slug_ts ON visits(slug, ts);
CREATE INDEX idx_visits_ts ON visits(ts);

-- 0002_routing_rules.sql
ALTER TABLE links ADD COLUMN rules TEXT;  -- JSON array of routing rules; NULL = none
```
Notes:
- Rules live on the `links` row (not a separate table) so the redirect stays one indexed read.
  The adapter parses the JSON and treats NULL or malformed JSON as no rules.
- `visit_count` is a denormalised total of **non-bot** visits for fast list rendering;
  increment it in the same batch (transaction) as the visit insert only when `is_bot = 0`.
- Do not rely on `ON DELETE CASCADE` alone — explicitly delete visits then the link in one batch.
- Never store IP addresses.

## Auth: Cloudflare Access
This section covers Workers. The Docker runtime can use the same provider or the trusted-header
contract; see "Docker runtime → Identity".

Access sits in front of `/admin*` and `/api*` at Cloudflare's edge. The Worker still
verifies the token itself so it is safe even if Access is misconfigured.

`middleware/auth.ts` (`requireIdentity`) calls `services.identity.identify(req)`; on
`null` it returns 401, otherwise it sets `userEmail` on the context. The Cloudflare
implementation, `adapters/cloudflare/access.ts` (`AccessIdentityProvider`):
1. Read the JWT from the `Cf-Access-Jwt-Assertion` header (fallback: `CF_Authorization` cookie).
2. Verify with `jose`: `createRemoteJWKSet(new URL(`${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`))`,
   `jwtVerify(token, jwks, { issuer: ACCESS_TEAM_DOMAIN, audience: ACCESS_AUD })`.
   Create the JWKS once at module scope (per team domain) so keys are cached between requests.
3. On success return `{ email }` from the payload; on any failure return `null`.
4. The middleware turns `null` into `401` JSON for `/api`, plain `401` for `/admin`.

**Local dev bypass** (`adapters/dev/devIdentity.ts`): if `DEV_AUTH_EMAIL` is set (only in
`.dev.vars`) AND the request hostname is `localhost`, a `*.localhost` name or `127.0.0.1`, skip
verification and use that email. Both conditions are required, and `worker.ts` only wires this in
while the Access values are placeholders, so a real deployment never has it. Never set
`DEV_AUTH_EMAIL` in `wrangler.jsonc`. `npm run dev` creates `.dev.vars` from `.dev.vars.example`
when it's missing (`scripts/ensure-dev-vars.mjs`); without it, local `/admin` and `/api` answer
503 with a message saying to create it.

**CSRF** (in `middleware/auth.ts`, runtime-agnostic): the Access cookie is sent automatically by browsers, so for `POST`/`PATCH`/`DELETE`
on `/api/*` require `Content-Type: application/json` (except DELETE) and reject requests
whose `Origin` header is present and not the short-link origin (`https://${SHORT_DOMAIN}`, or
`http://` for a `*.localhost` domain); in dev, other local origins are allowed when the request
itself is to a local host.

## Docker runtime
A single Node process serving the same Hono app, behind Caddy and an auth proxy (or a
Cloudflare Tunnel) in Docker Compose. Local development stays on `npm run dev` (Wrangler); the
Docker preset is for hosting.

### Entry point (`src/node.ts`)
- Reads config from `process.env` with `readNodeConfig` (`adapters/node/config.ts`), which
  reports every problem at once; on any problem, including missing sign-in values, Hop logs them
  and exits. So `Config.authConfigured` is always true on Node, and there is no `NOT_CONFIGURED`
  state — a Docker deployment either starts correctly or restarts with a readable error.
- Opens the database, applies pending migrations, builds `Services` once, and serves
  `createApp()` with `@hono/node-server` on `PORT`.
- `assets` (`adapters/node/assets.ts`): serves `public/` with `@hono/node-server/serve-static`;
  files under `assets/` (content-hashed by Vite) get a one-year immutable cache, everything
  else `no-cache`. `routes/admin.ts` keeps the SPA fallback.
- `defer` (`adapters/node/background.ts`): tracks pending promises and logs rejections (an
  unhandled rejection would crash Node). On `SIGTERM`/`SIGINT` Hop stops accepting requests,
  waits up to 5 s for background work, and closes the database.
- `npm run build:node` builds the dashboard and bundles `src/node.ts` and its dependencies into
  `dist/node.mjs` with esbuild, so the runtime image has no `node_modules`. TypeScript stays
  `noEmit`; `tsconfig.node.json` checks the Node files with Node types.
- `migrations/` and `public/` are found next to `dist/` (`/app` in the image).

### Configuration (environment variables)
| Variable | Meaning |
|---|---|
| `SHORT_DOMAIN` | Bare hostname, e.g. `go.example.com` (no port) |
| `ROOT_REDIRECT_URL` | Optional, same as on Workers |
| `AUTH_MODE` | `proxy` (oauth2-proxy / Authelia) or `access` (Cloudflare Access via tunnel) |
| `PROXY_SECRET` | `proxy` mode: shared secret Caddy sends in `X-Hop-Proxy-Secret`; ≥ 32 chars |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | `access` mode: same as on Workers |
| `GEO_SOURCE` | `cloudflare` (read Cloudflare visitor-location headers) or `none` (default) |
| `DATABASE_PATH` | Default `/data/hop.db` |
| `PORT` | Default `8787` |

The dev bypass is never wired in on Node.

### Database (`src/adapters/sqlite/`)
- `node:sqlite` `DatabaseSync` (built into Node, no native module to compile). The image uses
  Node 24 and starts Node with `--disable-warning=ExperimentalWarning`.
- On open: `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`.
- `SqliteRunner` caches prepared statements by SQL text. `batch` runs its statements inside
  `BEGIN … COMMIT` (rolled back on error), matching `db.batch()` on D1.
- The API is synchronous, so each query runs to completion without interleaving with other
  requests. That's fine for one process at team scale; the redirect's indexed read is
  sub-millisecond.
- Migration runner (`applyMigrations`): applies `migrations/*.sql` in filename order, each in a
  transaction, and records them in a `d1_migrations (id, name, applied_at)` table — the same
  table and columns Wrangler uses — so a database exported from D1 keeps its migration history.

### Identity (`AUTH_MODE`)
**`proxy` — the trusted-header contract** (`adapters/proxy/identity.ts`,
`TrustedHeaderIdentityProvider`). Hop never talks to oauth2-proxy or Authelia; it only trusts
two headers that Caddy sets after the proxy approves a request:
- `X-Hop-Proxy-Secret` must equal `PROXY_SECRET`. Both are SHA-256 hashed and compared with
  `timingSafeEqual`, so the check is constant-time whatever length is presented. This protects
  Hop if its port is ever published by mistake; network isolation alone is not relied on. A
  wrong secret is logged (without the value) because it usually means a mismatched `.env`.
- `X-Hop-Email` is the signed-in email; trimmed, lower-cased, and must look like an email.
- Either check failing → `null` (401).

`docker/caddy/Caddyfile` deletes any client-sent `X-Hop-Email` and `X-Hop-Proxy-Secret` on every
request before routing. Only the `/admin`, `/admin/*`, `/api` and `/api/*` routes go through
`forward_auth`; on approval Caddy copies the proxy's email header to `X-Hop-Email`
(`X-Auth-Request-Email>X-Hop-Email` for oauth2-proxy, `Remote-Email>X-Hop-Email` for Authelia)
and adds `X-Hop-Proxy-Secret` when proxying to Hop. Hop doesn't know which proxy is in use.

**`access`**: `AccessIdentityProvider`, unchanged from Workers. For a Docker host reached only
through a Cloudflare Tunnel with Access on `/admin` and `/api`; no Caddy or auth-proxy container
runs.

The CSRF checks in `middleware/auth.ts` are unchanged: the proxy's session cookie is sent
automatically just like the Access cookie.

### Geo (`GEO_SOURCE`, `adapters/proxy/geo.ts`)
- `cloudflare`: `CloudflareHeaderGeoLookup` reads `CF-IPCountry` plus the "Add visitor location
  headers" managed-transform headers (`CF-IPContinent`, `CF-Region`, `CF-IPCity`); `XX` and
  missing values → null. Only safe when all traffic reaches the host through Cloudflare (a
  tunnel, or an origin firewalled to Cloudflare's IPs); otherwise visitors can set these headers.
- `none`: every field null. Analytics show "Unknown" and geo routing conditions never match.
  Caddy's `geo-none.caddy` also deletes these headers, so a visitor can't supply them.

### Compose preset
```
internet ──▶ caddy:443 ──┬─ /oauth2/*, /authelia/* ──────────────────────▶ auth proxy
                         ├─ /admin*, /api* ── forward_auth ─▶ auth proxy ─ ok ─▶ hop:8787
                         └─ everything else ─────────────────────────────▶ hop:8787

Cloudflare edge (Access) ──▶ cloudflared ──▶ hop:8787          (AUTH_PROVIDER=access)
```
- `.env` sets `AUTH_PROVIDER` and `COMPOSE_PROFILES` to the same value: `oauth2-proxy`,
  `authelia` or `access`. `hop` has no profile and always runs; `caddy` runs in the
  `oauth2-proxy` and `authelia` profiles; `cloudflared` in `access`.
- `hop` publishes no ports and keeps its database in the `hop-data` volume at `/data`. Caddy
  publishes 80/443 and keeps certificates in `caddy-data`.
- `docker/caddy/Caddyfile` does `import auth-{$AUTH_PROVIDER}.caddy` and
  `import geo-{$GEO_SOURCE}.caddy`.
- oauth2-proxy: `--reverse-proxy`, `--set-xauthrequest`, `--upstream=static://202`,
  `--skip-provider-button`, secure cookie `_hop_session`, trusted proxy IPs limited to private
  ranges, `--email-domain` from `.env` plus `--authenticated-emails-file`
  (`docker/oauth2-proxy/emails.txt`). Caddy redirects unauthenticated `/admin` requests to
  `/oauth2/start?rd=…`; unauthenticated `/api` requests get oauth2-proxy's plain 401, which the
  dashboard treats as "session expired".
- Authelia: served under `/authelia` on `SHORT_DOMAIN` (no second hostname), file-based users in
  `docker/authelia/users.yml`, SQLite storage and a filesystem notifier in the `authelia-data`
  volume. Each user's key is their lower-cased email and lookups are case-insensitive, so people
  sign in with their email address (Authelia has no setting to turn username sign-in off). `configuration.yml` is committed and uses Authelia's template filter for
  `SHORT_DOMAIN`; its three secrets come from `.env`. Authelia redirects browsers to its portal;
  for `/api` Caddy turns that redirect into a 401.
- Compose interpolates every service's variables even outside the active profile, so only
  `SHORT_DOMAIN` and `AUTH_MODE` are required in `compose.yaml`; `doctor --docker` checks the rest.
- Image tags are pinned in `compose.yaml` only (Caddy 2.11, oauth2-proxy v7.15.4, Authelia 4.39,
  cloudflared 2026.9.3): `setup:docker` hashes passwords with the Authelia image read from it, and
  the export copies its pins (`composeImages` in `scripts/lib/docker-config.mjs`). The Hop image
  builds from the repo's `Dockerfile` on `node:24-slim`.

### Tooling
- `npm run setup:docker`: asks for the domain, root redirect, sign-in option and its values,
  and (except for Access, which always uses Cloudflare's headers) whether Cloudflare fronts the host; generates `PROXY_SECRET` and the proxy's secrets; and
  writes `.env` (mode 600), `docker/oauth2-proxy/emails.txt` (mode 644, since oauth2-proxy runs
  unprivileged), or `docker/authelia/users.yml` (mode 600) with a first user keyed by their
  lower-case email, whose random password is shown once (hashed by the Authelia
  image) along with the sign-in URL. Re-running it
  keeps existing secrets and uses existing answers as defaults.
- `npm run setup:docker -- --export [--image=<ref>]` (`scripts/lib/docker-export.mjs`): writes
  `hop-stack/compose.yaml` and `hop-stack/stack.env` for use without the repo (Portainer, another
  host). The stack uses the published image instead of `build: .`, keeps only the chosen
  provider's services and drops profiles, and inlines the preset files as Compose `configs`
  (`content:`, Compose 2.23.1+) instead of bind mounts: the Caddyfile with its auth and geo
  snippets resolved and the domain filled in, the Authelia configuration with the domain filled
  in, and `users.yml` or `emails.txt`. `$` in inlined content is written as `$$` so Compose doesn't
  interpolate it (Authelia hashes contain `$`); the proxy secret stays a `{$PROXY_SECRET}`
  placeholder that Caddy reads from its environment, so secrets live only in `stack.env`.
- Image publishing (`.github/workflows/image.yml`): every push to `main` builds `linux/amd64` and
  `linux/arm64` images and pushes `ghcr.io/<owner>/hop:latest` and `:sha-<short sha>`; tags `v1.2.3`
  push `:1.2.3` and `:1.2`. The Dockerfile's build stage runs on the build platform, since its
  output is architecture-independent, so only the small runtime stage is built per architecture.
- `npm run doctor -- --docker`: validates `.env` for the chosen provider (`validateDockerEnv` in
  `scripts/lib/docker-config.mjs`), runs `docker compose config`, and fails if `hop` publishes
  ports. With `--live` it checks `/health`, that `/admin` redirects to the sign-in provider, and
  that `/api/me` requires sign-in. It also fails on an Authelia `users.yml` key that isn't lower
  case (Authelia refuses to start then) and on a sign-in file Docker replaced with a directory.

## Visit capture (`lib/visit.ts`)
- `country`, `region`, `city` from `services.geo.lookup(req)`. The Cloudflare
  implementation (`adapters/cloudflare/geo.ts`) reads `request.cf`; values may be
  undefined locally — return null. On Docker, see "Docker runtime → Geo".
- `referrer_host`: `new URL(Referer).hostname` if valid, else null. Strip leading `www.`.
- UA → `ua-parser-js` v1: device.type `mobile`/`tablet` map directly; no type → `desktop`;
  anything else (console, smarttv, wearable, embedded) → `other`.
- `is_bot`: case-insensitive regex on UA including at least: `bot`, `crawl`, `spider`,
  `slurp`, `facebookexternalhit`, `slackbot`, `discordbot`, `twitterbot`, `whatsapp`,
  `telegrambot`, `linkedinbot`, `embedly`, `preview`, `curl`, `wget`, `python-requests`,
  `headless`. Empty UA counts as bot.
- All of this runs inside `services.defer(...)` — wrap in try/catch and log errors; a logging
  failure must never affect a redirect.

## Smart routing (`lib/routing.ts`)
- Pure, runtime-agnostic module: rule types, `validateRules(input, shortDomain)` and
  `resolveTarget(defaultUrl, rules, visitor, now, random)` → `{ url, ruleIndex | null }`.
  `now` and `random` are parameters so evaluation is deterministic in tests.
- The redirect route only builds the visitor (geo via `services.geo`, UA parse, language,
  bot flag) when the link has rules. If reading the visitor fails, it falls back to the default
  URL. The same visitor object is reused for the deferred visit record.
- `continent` comes from `request.cf.continent` in the Cloudflare `GeoLookup`, and from
  `cf-ipcontinent` in the Docker `cloudflare` geo source.
- The dashboard imports `lib/routing.ts` for its "Test a visitor" panel, so the preview and the
  Worker can't drift apart.

## Background title fetch (`lib/title.ts`)
On create without a title: `services.defer(fetchTitle(url))` — `fetch` with
`AbortSignal.timeout(3000)`, `redirect: 'follow'`, only if response is `text/html`;
read at most the first 64 KB of the body and extract the first `<title>` with a small,
runtime-agnostic parser (regex on the head is fine; do not use `HTMLRewriter`, which is
Workers-only); decode basic HTML entities; trim, collapse whitespace, cap at 200 chars;
then `services.links.setTitleIfEmpty(slug, title)`.

## Stats queries (`adapters/sql/`, run by the D1 and SQLite visit stores)
All filtered by `slug` (per-link) or not (overview), by `ts >= from AND ts < to`, and by
`is_bot = 0` unless bots are included.
- Per day: `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS visits ... GROUP BY day ORDER BY day`
- Top-N: `SELECT COALESCE(country, 'Unknown') AS key, COUNT(*) AS visits ... GROUP BY key ORDER BY visits DESC LIMIT 10`
  (same pattern for referrer_host with `'Direct'`, device, browser, os)
- Run the independent queries together (`db.batch()` on D1, one read transaction on SQLite).
- Gap-filling of days is done in the dashboard.

## Dashboard
- Vite `base: '/admin/'`; client-side routing under `/admin` (react-router). The link detail and
  overview pages are lazy-loaded so the links list doesn't wait on Recharts.
- Pages: `/admin` (overview), `/admin/links` (list + search + create), `/admin/links/:slug`
  (detail: edit, smart routing, stats, QR, delete).
- Fetch the current user from `GET /api/me` to show the signed-in email in the header.
- Styling: Tailwind v4 with colour tokens defined once for light and dark (`src/index.css`);
  fonts (Bricolage Grotesque, DM Sans, DM Mono) are self-hosted from `dashboard/public/fonts`,
  so the admin UI makes no third-party requests. Icons are inline SVG components.
- Local dev: the Worker runs at `http://go.localhost:4696` (`SHORT_DOMAIN` and `dev.port` in
  `wrangler.jsonc`), so short URLs work locally; Vite runs on `:4697` (strict port) and proxies
  `/api` to the Worker port it reads from `wrangler.jsonc`. Short URLs use `http://` only for
  `localhost`/`*.localhost` domains.
- Light/dark via `prefers-color-scheme` plus a manual toggle.
