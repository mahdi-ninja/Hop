# Hop — Product Spec

## Summary
A URL shortener on one custom domain (referred to as `SHORT_DOMAIN`, e.g. `go.example.com`).
Short links are public. The dashboard and API live at `/admin` and `/api` on the same
domain and are protected by Cloudflare Access. Everyone who gets past Access has full
rights: they can create, edit, and delete any link. There are no roles or ownership rules.

## Users
- **Team members** (a handful to a few dozen people): sign in via Cloudflare Access
  (Google / GitHub / email one-time PIN — configured in Cloudflare, not in Hop).
- **Visitors**: anyone who clicks a short link. They never see the dashboard.

## Features

### 1. Redirects
- `GET /:slug` → `302` to the link's target URL. `HEAD` also redirects but is not logged.
- Incoming query string is forwarded: if the target already has params, merge them;
  incoming params win on key conflicts.
- Response has `Cache-Control: private, no-store` so every click reaches the Worker.
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
- `created_by` / `updated_by` are recorded from the Access identity (email) — informational only.

### 3. Visit analytics
Every `GET` redirect records a visit (in the background, after the response is sent):
- timestamp (UTC ms)
- country, region, city — from `request.cf`
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

## Validation rules
- **Target URL**: must parse with `new URL()`, protocol `http:` or `https:` only,
  max 2048 chars, and must not point at `SHORT_DOMAIN` itself (prevents redirect loops).
- **Custom slug**: `^[A-Za-z0-9_-]{1,64}$`. Reserved (case-insensitive): `admin`, `api`,
  `cdn-cgi`, `assets`, `static`, `health`, `robots.txt`, `favicon.ico`.
- Duplicate slug → `409` error shown inline on the form.

## Non-goals (do not build)
- Expiry dates, max-visit limits, tags, multiple domains
- API keys or any auth other than Cloudflare Access
- User accounts, roles, per-user permissions
- Unique visitor counting, IP storage (never store IP addresses)
- Server-side QR generation, link previews/interstitial pages
- Data retention jobs, CSV export (may come later — keep schema friendly to them)
- Non-Cloudflare deployment (e.g. Docker). The code is structured so this can be added
  later without a rewrite — see "Portability boundaries" in ARCHITECTURE.md — but no
  Node/Docker runtime, SQLite driver, or alternative auth/geo implementation is built now.

## Quality bar
- Redirect path: one indexed D1 read before responding; nothing else blocks it.
- Dashboard works on desktop and mobile widths, supports light and dark mode.
- All API input validated server-side; errors returned in the shape defined in API.md.
