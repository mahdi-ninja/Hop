# Hop — Architecture

## Stack
| Concern | Choice |
|---|---|
| Runtime | Cloudflare Workers (TypeScript, ES modules) |
| Router | Hono |
| Database | Cloudflare D1 (SQLite), migrations via `wrangler d1 migrations` |
| Auth | Cloudflare Access; JWT verified in the Worker with `jose` |
| UA parsing | `ua-parser-js` **pinned to `^1`** (v1 is MIT; v2 is AGPL — do not upgrade) |
| Dashboard | React + Vite + TypeScript, served by Workers Static Assets |
| Dashboard styling | Tailwind CSS |
| Charts | Recharts |
| QR codes | `qrcode` (npm), browser-side |
| Tests | Vitest with `@cloudflare/vitest-pool-workers` for the Worker |
| Config | `wrangler.jsonc` |

## Repo layout
```
hop/
  AGENTS.md               # rules for AI coding agents working on the repo
  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  CHANGELOG.md  LICENSE
  README.md
  docs/                   # SPEC, ARCHITECTURE, API, DEPLOYMENT; images/ for the README
  wrangler.jsonc          # committed template; works for local dev as is
  hop.config.json         # per-deployment values written by `npm run setup` (git-ignored)
  package.json            # Worker package + orchestration scripts (npm workspace root)
  tsconfig.json  vitest.config.ts  .dev.vars.example  .nvmrc
  .github/                # CI workflow, issue and PR templates
  migrations/
    0001_init.sql
    0002_routing_rules.sql
  scripts/
    setup.mjs  deploy.mjs  doctor.mjs   # interactive setup, deploy pipeline, readiness checks
    seed-local.mjs                      # demo data for local dev
    check-boundaries.mjs                # enforces the portability rules below
    lib/                                # prompts, Cloudflare API, checks, config merging
  src/
    worker.ts             # Cloudflare entry: builds Services from env, mounts app
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
      d1/                 # LinkStore and VisitStore on D1 (all SQL lives here)
      cloudflare/geo.ts   # GeoLookup from request.cf
      cloudflare/access.ts # IdentityProvider verifying Access JWTs
      dev/devIdentity.ts  # local-only dev bypass IdentityProvider
  test/
    fakes/                # in-memory LinkStore/VisitStore used by route tests
  dashboard/              # React SPA (npm workspace)
    vite.config.ts        # base: '/admin/', outDir: '../public/admin', dev server on :4697
    public/               # favicons and self-hosted fonts (OFL licences alongside)
    src/                  # api client, components, pages, lib
  public/                 # build output for Static Assets (git-ignored)
```

## Portability boundaries
Hop only targets Cloudflare today, but the database, geo lookup, and auth are kept behind
interfaces so another runtime (e.g. Node in Docker with SQLite) could be added later by
writing new adapters and a new entry point — without touching routes or business logic.

### Rules
- Only `src/worker.ts` and files under `src/adapters/cloudflare/` and `src/adapters/d1/`
  may reference `env.DB`, `D1Database`, `request.cf`, `Cf-Access-*` headers, or
  `CF_Authorization`. `scripts/check-boundaries.mjs` (run by `npm test`) enforces this.
- Routes and `lib/` get everything via a `Services` object on the Hono context
  (`c.get('services')`), never from `c.env` directly (except `SHORT_DOMAIN`-style config,
  which is passed in as a plain `Config` object inside `Services`).
- All SQL lives in `src/adapters/d1/`. Keep it standard SQLite (no D1-only features) so a
  future `better-sqlite3` adapter can reuse the same SQL and the same migration files.
- `ctx.waitUntil` is only called from the entry point / adapters via a `defer(promise)`
  function in `Services`, so background work isn't tied to the Workers API either.
- Hop ships only the Cloudflare adapters (plus the in-memory fakes used in tests). A new
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
  config: { shortDomain: string; rootRedirectUrl: string | null; accessConfigured: boolean };
}
```
Shapes of `Link`, `LinkStats`, `Overview`, `Visit` mirror API.md (camelCase); adapters
map to and from snake_case columns.

`src/worker.ts` builds `Services` per request from `env` and `ctx`, then calls the app
created by `createApp()`. The Hono app itself never knows it's on Cloudflare, and
`routes/admin.ts` serves the dashboard through `services.assets`.

### Testing benefit
Route and logic tests use the in-memory fakes in `test/fakes/`, so they're fast and
runtime-independent. The D1 adapters and the Access provider get their own tests in
the Workers test pool.

## Request flow
```
Visitor ──GET /abc──▶ Worker ──read links by slug──▶ D1
                        │
                        ├──▶ (link has rules) read visitor + resolveTarget()   (in-memory)
                        ├──▶ 302 Location: target   (response sent)
                        └──▶ ctx.waitUntil: INSERT visit + UPDATE visit_count (db.batch)

Team member ──/admin/*──▶ Cloudflare Access (login) ──▶ Worker ──▶ env.ASSETS (SPA)
Dashboard   ──/api/*────▶ Cloudflare Access ──▶ Worker ──verify JWT──▶ Hono API ──▶ D1
```

Route precedence in the Worker (first match wins):
1. `/api/*` → API (requires Access)
2. `/admin` and `/admin/*` → static assets via `services.assets.fetch`; if the asset 404s,
   serve `/admin/index.html` (SPA fallback). Also require Access here (defence in depth).
3. `/` → root redirect
4. `/:slug` → redirect
5. anything else (e.g. multi-segment paths) → 404 page

## Configuration
`wrangler.jsonc` is a committed template that runs local dev as is: `SHORT_DOMAIN` is
`go.localhost:4696` (with `dev.port: 4696`) and the Access values are placeholders. It has no
`dev.host` and no route, so under `wrangler dev` the Worker sees the real `Host` header; the
local sign-in shortcut depends on that to reject DNS-rebinding requests. Production values
live in the git-ignored `hop.config.json` (account, domain, D1 database, Access team domain and
AUD, root redirect). `npm run deploy` merges the two into `.wrangler/deploy/wrangler.production.json`
(`scripts/lib/hop-config.mjs`), rebasing relative paths, and deploys that file.

`workers_dev: false` and `preview_urls: false` matter: they stop anyone reaching the Worker on
a `*.workers.dev` or preview URL that isn't behind Access. `doctor` and a test check them.

When the Access values are missing or placeholders, `Config.accessConfigured` is false and
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
  increment it in the same `db.batch()` as the visit insert only when `is_bot = 0`.
- Do not rely on `ON DELETE CASCADE` alone — explicitly delete visits then the link in one batch.
- Never store IP addresses.

## Auth: Cloudflare Access
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

**Local dev bypass** (`adapters/dev/devIdentity.ts`, wrapping the Access provider): if `DEV_AUTH_EMAIL` is set (only in `.dev.vars`) AND the request
hostname is `localhost`, a `*.localhost` name or `127.0.0.1`, skip verification and use that email.
Both conditions required. Never set `DEV_AUTH_EMAIL` in `wrangler.jsonc`.

**CSRF** (in `middleware/auth.ts`, runtime-agnostic): the Access cookie is sent automatically by browsers, so for `POST`/`PATCH`/`DELETE`
on `/api/*` require `Content-Type: application/json` (except DELETE) and reject requests
whose `Origin` header is present and not the short-link origin (`https://${SHORT_DOMAIN}`, or
`http://` for a `*.localhost` domain); in dev, other local origins are allowed when the request
itself is to a local host.

## Visit capture (`lib/visit.ts`)
- `country`, `region`, `city` from `services.geo.lookup(req)`. The Cloudflare
  implementation (`adapters/cloudflare/geo.ts`) reads `request.cf`; values may be
  undefined locally — return null.
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
- `continent` comes from `request.cf.continent` in the Cloudflare `GeoLookup`.
- The dashboard imports `lib/routing.ts` for its "Test a visitor" panel, so the preview and the
  Worker can't drift apart.

## Background title fetch (`lib/title.ts`)
On create without a title: `services.defer(fetchTitle(url))` — `fetch` with
`AbortSignal.timeout(3000)`, `redirect: 'follow'`, only if response is `text/html`;
read at most the first 64 KB of the body and extract the first `<title>` with a small,
runtime-agnostic parser (regex on the head is fine; do not use `HTMLRewriter`, which is
Workers-only); decode basic HTML entities; trim, collapse whitespace, cap at 200 chars;
then `services.links.setTitleIfEmpty(slug, title)`.

## Stats queries (`adapters/d1/visitStore.ts`)
All filtered by `slug` (per-link) or not (overview), by `ts >= from AND ts < to`, and by
`is_bot = 0` unless bots are included.
- Per day: `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS visits ... GROUP BY day ORDER BY day`
- Top-N: `SELECT COALESCE(country, 'Unknown') AS key, COUNT(*) AS visits ... GROUP BY key ORDER BY visits DESC LIMIT 10`
  (same pattern for referrer_host with `'Direct'`, device, browser, os)
- Run the independent queries together with `db.batch()`.
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
