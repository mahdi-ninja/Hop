# Hop — Deployment

Steps marked **[Human]** need the Cloudflare dashboard or account access. (AI coding agents:
prompt the human for these and wait, rather than guessing values.)

## Prerequisites
New to Cloudflare? [CLOUDFLARE-CHECKLIST.md](CLOUDFLARE-CHECKLIST.md) walks through each item with
links to Cloudflare's guides. In short, **[Human]**:
- a Cloudflare account with a **verified email** (Worker deploys fail until it is)
- **either** your domain added and **Active** in the account, **or** a `workers.dev` subdomain (see
  "No domain? Use workers.dev" below)
- **Zero Trust** turned on once: a team name and the Free plan (a payment method is required, but Free
  isn't charged)
- a **login method for your team** under **Zero Trust** → **Integrations** → **Identity providers**
  (for example One-time PIN). New organizations only let members of your Cloudflare account sign in.
- Node.js (see `.nvmrc`) and `npm install` done in the repo

## Where deployment settings live
- `wrangler.jsonc` is a **committed template**. Its values work for local dev
  (`go.localhost:4696`) and are treated as placeholders for production: `setup` and `doctor`
  never accept a `localhost` or `*.localhost` domain.
- `hop.config.json` (git-ignored) holds your deployment's values: account ID, domain, D1
  database, Access team domain and AUD, root redirect URL. `npm run setup` writes it.
  It contains no secrets, but keep a copy somewhere safe: it identifies your deployment.
- `npm run deploy` merges the two into `.wrangler/deploy/wrangler.production.json` on every
  run, so template changes (new bindings, migrations) always reach production.

## First deploy: `npm run setup` **[Human]**
```
npm run setup
```
It asks before every change, offering a default each time:
1. **Cloudflare account** — logs in with Wrangler if needed; picks the account.
2. **Domain** — your own domain (e.g. `go.yourcompany.com`; Wrangler creates its DNS record and
   certificate on deploy, so remove any existing DNS record for that exact name first), or a free
   `hop.<your-subdomain>.workers.dev` address.
3. **Bare domain** — send `https://<domain>/` to the dashboard, or to another URL.
4. **Database** — reuse an existing D1 database, create a new one (name and location), or
   enter an ID.
5. **Access** — either:
   - **Automatic**: with a Cloudflare API token (Account · Access: Apps and Policies · Edit, and
     Account · Access: Organizations, Identity Providers, and Groups · Read, plus Account · Workers
     Scripts · Read for a `workers.dev` address; see the checklist),
     setup finds your team domain, warns if only Cloudflare-account members can sign in, reuses or
     creates the Access application for `<domain>/admin` and `<domain>/api` (Lax, HttpOnly cookie),
     and asks who may sign in (`@domain` or emails) and the session length. The token is read from
     `$HOP_CLOUDFLARE_API_TOKEN` or a hidden prompt and never saved. (Not `CLOUDFLARE_API_TOKEN`:
     Wrangler treats that as its login, so an Access-only token there breaks every Wrangler step.
     Setup and `doctor` warn if it's set.)
   - **Guided**: setup prints the dashboard steps (**Zero Trust** → **Access controls** →
     **Applications** → **Create new application** → **Self-hosted and private**), then checks the
     team domain you paste (it must publish signing keys) and the AUD tag's format.
   - Never protect the bare domain: short links must stay public.
6. **Review** — shows everything, then saves `hop.config.json` if you agree.
7. **Migrations** — shows pending migrations and applies them if you agree.
8. **Deploy** — builds, deploys and checks the live site (see "Verify" below).

`npm run setup -- --yes` accepts every default (useful for re-running with an existing
`hop.config.json`; automatic Access then needs `$HOP_CLOUDFLARE_API_TOKEN`).

## No domain? Use workers.dev
Choose "On a free workers.dev address" in setup's domain step. Setup asks for your API token
right away (it needs Workers Scripts · Read as well), looks up the account's `workers.dev`
subdomain and shows the address for you to confirm: `https://hop.<your-subdomain>.workers.dev`.
If the account has no subdomain yet, pick one under **Workers & Pages** → **Your subdomain** →
**Change**, and setup checks again. Setup turns the `workers.dev` address on for this Worker only,
and Access protects just `/admin` and `/api` on it, as with a custom domain (tested live on a
`workers.dev` address in September 2026).

Use automatic Access setup here: the dashboard's application form may only offer domains from your
zones. Trade-offs to accept:
- **Links are tied to your Cloudflare account.** Changing the subdomain or moving accounts breaks
  every shared link and QR code (after a subdomain change, re-run setup; see "Renaming later" in
  the [checklist](CLOUDFLARE-CHECKLIST.md)).
- **Some email filters and company networks block `workers.dev`.**
- **No zone features** such as rate-limiting rules. Cloudflare recommends custom domains for
  production and describes `workers.dev` as meant for personal or hobby projects.

To move to your own domain later, run setup again and pick it. Old `workers.dev` links stop working
once the new deploy turns the `workers.dev` address off.

## Later deploys
```
npm run deploy
```
Runs preflight checks, builds the dashboard, applies any new migrations, deploys, and checks
the live site. `npm run db:migrate:remote` applies migrations only.

## `npm run doctor`
Checks, without changing anything:
- `hop.config.json` is complete and has no placeholder values (and a warning if it uses workers.dev)
- `workers_dev` and `preview_urls` are off in `wrangler.jsonc` (deploys turn `workers.dev` on only
  for a workers.dev address)
- Wrangler is logged in to the right account
- the Access team domain publishes signing keys
- which remote migrations are pending

`npm run doctor -- --live` also runs the live checks below against the deployed site.

Renamed your Zero Trust team or `workers.dev` subdomain? Hop keeps the old name until you re-run
`npm run setup`; see "Renaming later" in the [checklist](CLOUDFLARE-CHECKLIST.md).

## Verify (automatic after each deploy)
- `https://<domain>/health` answers `ok`. A new custom domain can take a few minutes: the check
  waits up to 5 minutes, says what it's waiting for (DNS, certificate, Cloudflare attaching the
  domain), and asks whether to keep waiting. It looks up DNS through 1.1.1.1 so a stale
  "no such domain" answer cached by your OS can't hide a live site. If the site still isn't
  reachable, the deploy is reported as done but not yet verified, not as a failure.
- `/admin` and `/api/me` redirect to your Access login when not signed in.
- The bare domain and short links do **not** ask for a login.

If Access values are missing or still placeholders, the deployed Worker answers `/admin` and
`/api` with a 503 "Access isn't configured" message instead of a bare 401.

Also check by hand once: create a link, open it in a private window (no login prompt), and
confirm the visit appears on its stats page. With a custom domain,
`https://hop.<your-subdomain>.workers.dev` should not answer (workers.dev is off).

## Manual fallback (no scripts)
If you can't use `npm run setup`:
1. `npx wrangler d1 create hop`, and note the database ID.
2. In the Cloudflare dashboard: **Zero Trust** → **Access controls** → **Applications** → **Create
   new application** → **Self-hosted and private**. **Add public hostname** for `<domain>/admin`
   and again for `<domain>/api` (not the bare domain), add an Allow policy for your team
   (**Emails ending in** `@yourcompany.com`, or **Emails**), and **Create**. Then **Configure** →
   **Additional settings**: copy the **Application Audience (AUD) Tag**, and under **Cookie
   settings** set SameSite to **Lax** (HttpOnly on). Your team domain is under **Zero Trust** →
   **Settings**. [Cloudflare's guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
3. Write `hop.config.json`:
   ```json
   {
     "accountId": "<32-char account ID>",
     "shortDomain": "go.yourcompany.com",
     "rootRedirectUrl": "",
     "database": { "name": "hop", "id": "<database UUID>" },
     "access": { "teamDomain": "https://<team>.cloudflareaccess.com", "aud": "<AUD tag>" }
   }
   ```
4. `npm run deploy`.

## Abuse and data growth
Short links are public, and every click is a database write. Hop keeps redirects working when
writes fail, but a script hammering a link can use up D1's free daily write quota (so stats
stop recording) and inflate its counts. Two optional safeguards:
- **Rate limiting** (custom domains): on your domain's **Security rules** page → **Create rule** →
  **Rate limiting rules**. The Free plan includes one rule matching on the URL path over a 10-second
  window, e.g. path not starting with `/admin` or `/api`, more than 30 requests per 10 seconds per IP
  → Block. [Cloudflare's guide](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/)
- **Retention:** visits are kept forever. To trim old ones, run for example
  `npx wrangler d1 execute <database> --remote --command "DELETE FROM visits WHERE ts < <UTC ms>"`.

## Limits to be aware of
Each click is one D1 write (two rows touched in a batch). The Workers Free plan's daily
request and D1 write limits are fine for a small team (free limits reset daily at 00:00 UTC); if a
link goes viral, the Workers Paid plan raises them. Current numbers:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/). The free Zero Trust plan covers
up to 50 users.
