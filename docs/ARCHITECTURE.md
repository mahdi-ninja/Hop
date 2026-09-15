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
  AGENTS.md
  README.md
  docs/
  wrangler.jsonc
  package.json            # Worker package + orchestration scripts
  tsconfig.json
  vitest.config.ts
  .dev.vars.example
  migrations/
    0001_init.sql
  src/
    worker.ts             # Cloudflare entry: builds Services from env, mounts app
    app.ts                # createApp(): Hono app + route wiring; runtime-agnostic
    core/
      ports.ts            # interfaces: LinkStore, VisitStore, GeoLookup, IdentityProvider
      types.ts            # Link, NewVisit, Visit, Stats, Identity, Range, etc.
      services.ts         # Services type + Hono context typing
    routes/redirect.ts    # GET/HEAD /:slug, GET /
    routes/api.ts         # /api/* (all behind requireIdentity)
    routes/admin.ts       # /admin/* static assets + SPA fallback
    middleware/auth.ts    # requireIdentity: calls IdentityProvider, CSRF checks
    lib/slug.ts           # generation + validation + reserved list
    lib/url.ts            # target validation, query-string merge
    lib/visit.ts          # read the visitor (geo, UA, referrer, language, bot) and build NewVisit
    lib/routing.ts        # routing rule types, validation and first-match evaluation (runtime-agnostic)
    lib/title.ts          # extract <title> from HTML (runtime-agnostic)
    lib/errors.ts         # error helper matching API.md
    pages/notFound.ts     # 404 HTML
    adapters/
      d1/linkStore.ts     # LinkStore on D1
      d1/visitStore.ts    # VisitStore on D1 (incl. stats SQL)
      cloudflare/geo.ts        # GeoLookup from request.cf
      cloudflare/access.ts     # IdentityProvider verifying Access JWTs
      dev/devIdentity.ts       # localhost-only dev bypass IdentityProvider
  test/
    fakes/                # in-memory LinkStore/VisitStore/GeoLookup/IdentityProvider
  dashboard/
    package.json
    vite.config.ts        # base: '/admin/', outDir: '../public/admin'
    index.html
    src/...
  public/                 # build output for Static Assets (gitignored)
    admin/
```

## Portability boundaries
Hop only targets Cloudflare today, but the database, geo lookup, and auth are kept behind
interfaces so another runtime (e.g. Node in Docker with SQLite) could be added later by
writing new adapters and a new entry point — without touching routes or business logic.

### Rules
- Only `src/worker.ts` and files under `src/adapters/cloudflare/` and `src/adapters/d1/`
  may reference `env.DB`, `D1Database`, `request.cf`, `Cf-Access-*` headers, or
  `CF_Authorization`. Add a lint rule or a test that greps for these to enforce it.
- Routes and `lib/` get everything via a `Services` object on the Hono context
  (`c.get('services')`), never from `c.env` directly (except `SHORT_DOMAIN`-style config,
  which is passed in as a plain `Config` object inside `Services`).
- All SQL lives in `src/adapters/d1/`. Keep it standard SQLite (no D1-only features) so a
  future `better-sqlite3` adapter can reuse the same SQL and the same migration files.
- `ctx.waitUntil` is only called from the entry point / adapters via a `defer(promise)`
  function in `Services`, so background work isn't tied to the Workers API either.
- Do NOT build any non-Cloudflare adapters now. Only the in-memory fakes used in tests.

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
  config: { shortDomain: string; rootRedirectUrl: string | null };
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

## wrangler.jsonc (shape)
```jsonc
{
  "name": "hop",
  "main": "src/index.ts",
  "compatibility_date": "<today's date when scaffolding>",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "go.example.com", "custom_domain": true }],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": true
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "hop", "database_id": "<filled in by human>", "migrations_dir": "migrations" }
  ],
  "vars": {
    "SHORT_DOMAIN": "go.example.com",
    "ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com",
    "ACCESS_AUD": "<Access application AUD tag>",
    "ROOT_REDIRECT_URL": ""
  }
}
```
`workers_dev: false` and `preview_urls: false` matter: they stop anyone reaching the
Worker on a `*.workers.dev` URL that isn't behind Access.

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
hostname is `localhost` or `127.0.0.1`, skip verification and use that email.
Both conditions required. Never set `DEV_AUTH_EMAIL` in `wrangler.jsonc`.

**CSRF** (in `middleware/auth.ts`, runtime-agnostic): the Access cookie is sent automatically by browsers, so for `POST`/`PATCH`/`DELETE`
on `/api/*` require `Content-Type: application/json` (except DELETE) and reject requests
whose `Origin` header is present and not `https://${SHORT_DOMAIN}` (allow localhost in dev).

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
- Vite `base: '/admin/'`; client-side routing under `/admin` (react-router).
- Pages: `/admin` (overview), `/admin/links` (list + search + create), `/admin/links/:slug` (detail: edit, stats, QR, delete).
- Fetch the current user from `GET /api/me` to show "Signed in as …" in the header.
- In dev, Vite proxies `/api` to `http://localhost:8787`.
- Light/dark via `prefers-color-scheme` plus a manual toggle.
