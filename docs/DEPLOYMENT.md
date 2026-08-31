# Hop — Deployment

Steps marked **[Human]** need the Cloudflare dashboard or account access. The coding agent
should prompt for these and wait, rather than guessing values.

## Prerequisites
- A Cloudflare account, with the domain for `SHORT_DOMAIN` added as a zone on Cloudflare.
- Node.js LTS and `npx wrangler login` done on the machine.

## 1. Create the D1 database
```
npx wrangler d1 create hop
```
Copy the returned `database_id` into `wrangler.jsonc`. Then:
```
npm run db:migrate:remote
```

## 2. Set the domain
In `wrangler.jsonc`, set `SHORT_DOMAIN` and the `routes` entry to your domain
(e.g. `go.example.com`, with `custom_domain: true`). Wrangler creates the DNS record
and certificate on deploy.

## 3. **[Human]** Set up Cloudflare Access (Zero Trust)
1. Cloudflare dashboard → Zero Trust. If first time, pick a team name — your team
   domain is `https://<team>.cloudflareaccess.com`.
2. Settings → Authentication: add the login methods you want
   (One-time PIN works out of the box; Google or GitHub need an OAuth app).
3. Access → Applications → Add → **Self-hosted**.
   - Add destinations for `go.example.com` with path `admin` and `go.example.com`
     with path `api`. After saving, confirm that subpaths (e.g. `/admin/links`,
     `/api/links`) are also protected.
   - Do **not** protect the bare domain — short links must stay public.
4. Add a policy: Action **Allow**, include e.g. "Emails ending in `@yourcompany.com`"
   or a list of specific emails.
5. Open the application's overview and copy the **Application Audience (AUD) tag**.
6. Put the team domain and AUD tag into `wrangler.jsonc` as
   `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.

The free Zero Trust plan covers up to 50 users.

## 4. Deploy
```
npm run deploy
```

## 5. Verify
- `https://go.example.com/admin` → Access login → dashboard loads, header shows your email.
- Create a link, open the short URL in a private window → redirects without a login prompt.
- The visit appears on the link's stats page.
- `curl -i https://go.example.com/api/links` → blocked by Access (redirect to login or 401/403).
- `https://hop.<account>.workers.dev` → should not resolve (workers.dev disabled).

## Limits to be aware of
Each click is one D1 write (two rows touched in a batch). The Workers Free plan's daily
D1 write and request limits are fine for a small team; if a link goes viral, the
Workers Paid plan raises them. Check Cloudflare's current pricing page for exact numbers.
