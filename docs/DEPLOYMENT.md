# Hop — Deployment

Steps marked **[Human]** need the Cloudflare dashboard or account access. The coding agent
should prompt for these and wait, rather than guessing values.

## Prerequisites
- A Cloudflare account, with the domain for your short links added as a zone on Cloudflare.
- Node.js LTS. `npm install` done in the repo.
- **[Human]** Zero Trust enabled on the account once: open https://one.dash.cloudflare.com/ and pick
  a team name. (One-time PIN login works out of the box; add Google or GitHub under
  Settings → Authentication if you want them.)

## Where deployment settings live
- `wrangler.jsonc` is a **committed template** with placeholders. Local dev and tests use it as is.
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
2. **Domain** — e.g. `go.yourcompany.com`. Wrangler creates its DNS record and certificate on
   deploy; remove any existing DNS record for that exact name first.
3. **Bare domain** — send `https://<domain>/` to the dashboard, or to another URL.
4. **Database** — reuse an existing D1 database, create a new one (name and location), or
   enter an ID.
5. **Access** — either:
   - **Automatic**: with a Cloudflare API token (Account › Access: Apps and Policies › Edit, and
     Account › Access: Organizations, Identity Providers, and Groups › Read), setup finds your
     team domain, reuses or creates the Access application for `<domain>/admin` and
     `<domain>/api`, asks who may sign in (`@domain` or emails) and the session length. The
     token is read from `$CLOUDFLARE_API_TOKEN` or a hidden prompt and never saved.
   - **Guided**: setup prints the exact dashboard steps, then checks the team domain you paste
     (it must publish signing keys) and the AUD tag's format.
   - Never protect the bare domain: short links must stay public.
6. **Review** — shows everything, then saves `hop.config.json` if you agree.
7. **Migrations** — shows pending migrations and applies them if you agree.
8. **Deploy** — builds, deploys and checks the live site (see "Verify" below).

`npm run setup -- --yes` accepts every default (useful for re-running with an existing
`hop.config.json`; automatic Access then needs `$CLOUDFLARE_API_TOKEN`).

## Later deploys
```
npm run deploy
```
Runs preflight checks, builds the dashboard, applies any new migrations, deploys, and checks
the live site. `npm run db:migrate:remote` applies migrations only.

## `npm run doctor`
Checks, without changing anything:
- `hop.config.json` is complete and has no placeholder values
- `workers_dev` and `preview_urls` are off in `wrangler.jsonc`
- Wrangler is logged in to the right account
- the Access team domain publishes signing keys
- which remote migrations are pending

`npm run doctor -- --live` also runs the live checks below against the deployed site.

## Verify (automatic after each deploy)
- `https://<domain>/health` answers `ok` (new custom domains can take a minute).
- `/admin` and `/api/me` redirect to your Access login when not signed in.
- The bare domain and short links do **not** ask for a login.

If Access values are missing or still placeholders, the deployed Worker answers `/admin` and
`/api` with a 503 "Access isn't configured" message instead of a bare 401.

Also check by hand once: create a link, open it in a private window (no login prompt), and
confirm the visit appears on its stats page. `https://hop.<account>.workers.dev` should not
resolve (workers.dev is disabled).

## Manual fallback (no scripts)
If you can't use `npm run setup`:
1. `npx wrangler d1 create hop`, and note the database ID.
2. In Zero Trust → Access → Applications → Add → **Self-hosted**: destinations `<domain>/admin`
   and `<domain>/api` (not the bare domain), an Allow policy for your team, then copy the
   **Application Audience (AUD) tag**.
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

## Limits to be aware of
Each click is one D1 write (two rows touched in a batch). The Workers Free plan's daily
D1 write and request limits are fine for a small team; if a link goes viral, the
Workers Paid plan raises them. Check Cloudflare's current pricing page for exact numbers.
The free Zero Trust plan covers up to 50 users.
