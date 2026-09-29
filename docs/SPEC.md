# Hop — Product Spec

## Summary
A URL shortener on one domain (referred to as `SHORT_DOMAIN`): a custom domain such as
`go.example.com` (recommended), or, on Cloudflare Workers only, the Worker's free
`hop.<subdomain>.workers.dev` address.
Short links are public. The dashboard and API live at `/admin` and `/api` on the same
domain and are protected by sign-in that happens in front of Hop — Cloudflare Access, or an
authenticating proxy in the Docker preset (see "Hosting"). Hop itself has no login code.
Everyone who gets past sign-in has full rights: they can create, edit, and delete any link.
There are no roles or ownership rules.

## Users
- **Team members** (a handful to a few dozen people): sign in via Cloudflare Access
  (Google / GitHub / email one-time PIN — configured in Cloudflare, not in Hop), or, on the
  Docker preset, via oauth2-proxy (Google / GitHub / Microsoft / any OIDC provider) or
  Authelia (local user list; people sign in with their email) — configured in the preset's
  files, not in Hop.
- **Visitors**: anyone who clicks a short link. They never see the dashboard.

## Features

### 1. Redirects
- `GET /:slug` → `302` to the link's target URL. `HEAD` also redirects but is not logged.
- Incoming query string is forwarded: if the target already has params, merge them;
  incoming params win on key conflicts. (So a visitor can override a parameter baked into the
  target, such as `utm_source` or a `redirect_uri`; don't rely on target parameters for security.)
- Response has `Cache-Control: private, no-store` so every click reaches Hop.
- Unknown slug → `404` with a small, self-contained HTML "Link not found" page.
- `GET /` → `302` to `ROOT_REDIRECT_URL` if set, otherwise to `/admin`.
- Slug lookup is case-sensitive.

### 2. Link management (dashboard)
- **Create**: target URL (required), custom slug (optional), title (optional).
  - No slug given → generate a random 7-char base62 slug; retry on collision (max 5).
  - No title given → after creating, fetch the target page in the background and store
    its `<title>` (best-effort, 3 s timeout, never blocks the response).
- **List**: all links, newest first, with search (matches slug, URL, or title),
  showing slug, short URL, target, title, total visits, created date, created by.
  Paginated (50 per page, cursor-based).
- **Edit**: target URL and title. The slug is immutable.
- **Delete**: with a confirm step. Deletes the link's visit history too.
- **Copy short URL** button everywhere a link is shown.
- `created_by` / `updated_by` are recorded from the signed-in identity (email) — informational only.

### 3. Visit analytics
Every `GET` redirect records a visit (in the background, after the response is sent):
- timestamp (UTC ms)
- country, region, city — from the deployment's geo source (`request.cf` on Workers; on Docker,
  Cloudflare's visitor-location headers when behind Cloudflare, otherwise none — see "Hosting")
- referrer host only (e.g. `twitter.com`), or empty for direct
- device type (`desktop` / `mobile` / `tablet` / `other`), browser name, OS name — parsed from User-Agent
- `is_bot` flag — true for known crawlers and link-preview fetchers

Per-link stats page shows, for a selectable range (7d / 30d / 90d / all time):
- total visits and unique-ish visitors is NOT required — just totals
- visits per day (line/bar chart, UTC days, gaps filled with zero)
- top 10 countries, top 10 referrers, devices, top browsers, top OS
- the 50 most recent visits in a table
- a toggle "Include bots" (default off)

Dashboard home also shows an overview: total links, total visits in last 30 days,
visits-per-day chart across all links, and top 5 links by visits in the range.

### 4. QR codes
- On the link detail page, show a QR code for the short URL.
- Generated in the browser (no server endpoint). Download as SVG and PNG.

### 5. Smart routing
A link can send different visitors to different destinations. The link's own URL is the
**default**; on top of it the link has an ordered list of up to 20 **rules**. Rules are checked
top to bottom and the **first matching rule wins**; if none match, the visitor gets the default.

Each rule has:
- **Conditions** (all must match; a rule with no conditions matches everyone). Each condition is
  a field, an operator (`is one of` / `is not one of`) and a list of values. Values within one
  condition are OR; conditions within a rule are AND. Fields:
  - `continent` — `AF`, `AN`, `AS`, `EU`, `NA`, `OC`, `SA` (from the geo source)
  - `country` — ISO 3166-1 alpha-2 code (from the geo source)
  - `device` — `desktop`, `mobile`, `tablet`, `other` (same mapping as analytics)
  - `browser`, `os` — names as reported by the UA parser (e.g. `Chrome`, `Mobile Safari`,
    `iOS`, `macOS`), compared case-insensitively
  - `language` — the visitor's top `Accept-Language` preference; a value of `pt` also matches
    `pt-BR`, while `pt-BR` matches only `pt-BR`
  - `visitor` — `bot` or `human`, using the same bot detection as analytics
  When the visitor's value is unknown (e.g. no geo data locally), `is one of` does not match and
  `is not one of` does.
- **Time window** (optional): `start` and/or `end` in UTC ms; the rule only applies while
  `start <= now < end`. Outside the window the rule is skipped (the link keeps working).
- **Destinations**: 1–5 URLs, each with an integer weight; weights sum to 100. With more than one
  destination the visitor is sent to one at random, in proportion to the weights (a per-visit
  split — no cookies, so repeat visits are not sticky).

Bots and link previews are evaluated like any other visitor; add a `visitor is bot` rule to send
them somewhere specific. Incoming query strings are merged into whichever destination is chosen,
exactly as for the default URL. Routing is best-effort: geo is IP-based (VPNs route by their exit
country) and device/browser/OS trust the User-Agent.

Routing is **not access control**. Device, browser, OS, language and bot/person come from
headers the visitor controls, so anyone can reach any rule's destination by changing them; only
country and continent come from the geo source. Don't use rule destinations for anything secret.
On a Docker deployment with no geo source, country and continent are always unknown, so rules on
them never match (`is one of`) or always match (`is not one of`).

Analytics are unchanged: visits are recorded per link, not per rule or destination.

Dashboard: a "Smart routing" section on the link detail page lists the rules in order with
move up/down, edit and delete, and a fixed "Otherwise → default" row. A rule editor offers
pickers for each field, the time window and a split editor. A "Test a visitor" panel lets you
choose country, device, language etc. and shows which destination that visitor would get, using
the same routing function as the server. Links with rules show a "Routes" badge in the list.

## Validation rules
- **Target URL**: must parse with `new URL()`, protocol `http:` or `https:` only,
  max 2048 chars, and must not point at `SHORT_DOMAIN` itself (prevents redirect loops).
- **Custom slug**: `^[A-Za-z0-9_-]{1,64}$`. Reserved (case-insensitive): `admin`, `api`,
  `cdn-cgi`, `assets`, `static`, `health`, `robots.txt`, `favicon.ico`, `oauth2`, `authelia`
  (the last two are paths the Docker preset's auth proxies use).
- Duplicate slug → `409` error shown inline on the form.
- **Routing rules**: at most 20 rules; each field at most once per rule; at most 250 values per
  condition; values must be valid for their field (known continent/device/visitor values,
  two-letter country codes, BCP 47-style language tags, browser/OS names up to 40 chars);
  `start < end` when both are set; 1–5 destinations with integer weights ≥ 1 summing to 100;
  every destination URL passes the same checks as the target URL.

## Hosting
Hop runs on one of two supported runtimes. Features, API and dashboard are identical on both.

| | Cloudflare Workers (default) | Docker (Node + SQLite) |
|---|---|---|
| Where | Your Cloudflare account | Any machine that runs Docker Compose |
| Database | D1 | One SQLite file on a volume |
| Sign-in | Cloudflare Access | Cloudflare Access (behind a Cloudflare Tunnel), oauth2-proxy, or Authelia |
| Visitor geo | `request.cf` | Cloudflare visitor-location headers when behind Cloudflare; otherwise none |
| TLS | Cloudflare | Cloudflare (tunnel), or Caddy with Let's Encrypt |
| Setup | `npm run setup`, `npm run deploy` | `npm run setup:docker`, then `docker compose up -d --build`, or an exported stack (published image) for Portainer or another host |

The Docker preset is a `compose.yaml` running **hop** behind either **Caddy** (TLS and routing)
plus an **auth proxy**, or **cloudflared** (a Cloudflare Tunnel). The operator picks sign-in at
setup:
- **oauth2-proxy** (default): team members sign in with an existing Google / GitHub / Microsoft /
  OIDC account; access is limited to an email domain or an allowlist of addresses. Needs an OAuth
  app created with that provider.
- **Authelia**: team members are listed in a local users file and sign in with their email and a
  password, with optional 2FA. No outside identity provider.
- **Cloudflare Access**: for a Docker host reached through a Cloudflare Tunnel; no auth-proxy
  container, Hop verifies Access tokens exactly as on Workers.

Short links never pass through the auth proxy. Only `/admin` and `/api` do.

The Docker runtime is a single instance: one container, one SQLite file. Hop does not schedule
backups; the Docker deployment guide shows how to take one. A Docker deployment with incomplete settings
refuses to start and logs what's missing, rather than running half-configured.

## Non-goals (do not build)
- Expiry dates, max-visit limits, tags, multiple domains
- API keys, or sign-in handled inside Hop (passwords, OAuth flows, sessions, user tables). Hop
  only trusts an identity established in front of it: Cloudflare Access, or the Docker preset's
  auth proxy through the trusted-header contract in ARCHITECTURE.md
- User accounts, roles, per-user permissions
- Unique visitor counting, IP storage (never store IP addresses)
- Server-side QR generation, link previews/interstitial pages
- Data retention jobs, CSV export (may come later — keep schema friendly to them)
- Runtimes other than Cloudflare Workers and the Docker preset (e.g. Vercel, Netlify, Deno
  Deploy), databases other than D1 and SQLite (e.g. Postgres), and auth-proxy presets beyond
  oauth2-proxy and Authelia. Other proxies can use the trusted-header contract, but aren't
  shipped or tested.
- Running the Docker runtime as several instances, or any clustering or replication
- IP-database geo lookup on Docker (e.g. MaxMind GeoLite2)

## Quality bar
- Redirect path: one indexed database read (D1 or SQLite) before responding; nothing else blocks it. For links with
  routing rules, the visitor's geo, User-Agent and language are read before responding (in-memory
  work, no extra I/O); links without rules skip this entirely.
- Dashboard works on desktop and mobile widths, supports light and dark mode.
- All API input validated server-side; errors returned in the shape defined in API.md.
