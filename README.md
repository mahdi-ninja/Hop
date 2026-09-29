<p align="center">
  <img src="dashboard/public/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">Hop</h1>

<p align="center">
  A self-hosted URL shortener for teams, running on Cloudflare Workers or Docker.<br>
  Short links on your own domain, a dashboard with analytics and smart routing,<br>
  and sign-in handled by Cloudflare Access, oauth2-proxy or Authelia.<br>
  Free on Cloudflare's free plans, or on a small server of your own.
</p>

<p align="center">
  <a href="https://github.com/mahdi-ninja/hop/actions/workflows/ci.yml"><img src="https://github.com/mahdi-ninja/hop/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0f7a61" alt="MIT licence"></a>
  <a href="#deploy-to-cloudflare"><img src="https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white" alt="Runs on Cloudflare Workers"></a>
  <a href="#deploy-with-docker"><img src="https://img.shields.io/badge/runs%20on-Docker-2496ed?logo=docker&logoColor=white" alt="Runs on Docker"></a>
</p>

![Hop dashboard overview](docs/images/overview.png)

## Features

- **Short links on your domain.** `go.yourcompany.com/launch` → anywhere. Custom or random
  slugs, titles fetched automatically, query strings passed through.
- **Smart routing.** Send visitors to different places by country, continent, device, browser,
  OS, language, or bot vs person. Add time windows, and split traffic for A/B tests.
- **Analytics without tracking people.** Visits per day, countries, referrers, devices, browsers
  and operating systems, with bots filtered out. Hop never stores IP addresses.
- **QR codes** for every link, downloadable as SVG or PNG.
- **A dashboard your team will actually use.** Search, copy buttons everywhere, light and dark
  mode, works on phones.
- **No login code to trust.** Sign-in happens in front of Hop: Cloudflare Access, oauth2-proxy
  (Google, GitHub, Microsoft or any OIDC provider) or Authelia. Hop still checks every dashboard
  and API request itself.
- **Host it where you like.** On Cloudflare Workers with no server to run, or with Docker on
  any server. Same app and dashboard on both, and you can move from Workers to Docker with your
  links and stats.
- **Fast redirects.** One indexed database read, then the redirect. Analytics are written after
  the response is sent.

| Links | Smart routing |
|---|---|
| ![Links page](docs/images/links.png) | ![Smart routing rules and the visitor tester](docs/images/routing.png) |

| Analytics (dark mode) | On a phone |
|---|---|
| ![Link analytics in dark mode](docs/images/analytics-dark.png) | <img src="docs/images/mobile.png" width="260" alt="Links page on a phone"> |

## How it works

```
Visitor ──▶ go.yourcompany.com/launch ──▶ Hop ──▶ database (one read) ──▶ 302 to the destination
                                           └──▶ records the visit in the background

Team ──▶ go.yourcompany.com/admin ──▶ sign-in, in front of Hop ──▶ Hop ──▶ dashboard + API
```

Hop is a Hono app in TypeScript with a React dashboard. It runs on either host:

| | Cloudflare Workers | Docker |
|---|---|---|
| Hop runs as | a Worker | a Node process |
| Database | D1 (SQLite) | a SQLite file |
| Sign-in | Cloudflare Access | oauth2-proxy or Authelia behind Caddy, or Cloudflare Access through a Tunnel |

## Choose where to run it

| | Cloudflare Workers | Docker |
|---|---|---|
| You need | a free Cloudflare account and a domain (or a free `workers.dev` address) | a server with Docker Compose and a domain |
| Cost for a small team | free plans | your server |
| Visitor locations | always | only with Cloudflare in front |
| Try it first | on a `workers.dev` address | on your own machine, no accounts needed |

Not sure? Cloudflare is the least to run. Docker suits you if you'd rather not use Cloudflare or
want your team to sign in with an identity provider you already have. The full comparison is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Deploy to Cloudflare

```sh
git clone https://github.com/mahdi-ninja/hop && cd hop
npm install
npm run setup      # account, domain, database, Access; then deploys and checks the live site
```

`npm run setup` asks before every change. Deploy updates later with `npm run deploy`. You need a
Cloudflare account with a verified email, your domain added to it (or a free `workers.dev`
address), Zero Trust turned on (free for up to 50 users; Cloudflare asks for a payment method),
and Node.js 22.22+, 24 or 26. New to Cloudflare? Follow
the [Cloudflare checklist](docs/CLOUDFLARE-CHECKLIST.md) first. Everything else, including
`workers.dev` and a manual fallback: [docs/deploy/cloudflare.md](docs/deploy/cloudflare.md).

## Deploy with Docker

You need a server with Docker Compose, a domain pointed at it, and Node.js 22.22+, 24 or 26 for
the setup and check scripts (no `npm install` needed):

```sh
git clone https://github.com/mahdi-ninja/hop && cd hop
npm run setup:docker               # domain, sign-in option, secrets → .env
docker compose up -d --build
npm run doctor -- --docker --live
```

Pick how your team signs in:
- **oauth2-proxy** (default): existing Google, GitHub, Microsoft or OIDC accounts, limited to your
  email domain or a list of addresses. You create one OAuth app with the provider.
- **Authelia**: people sign in with their email and a password from a users file on the server,
  with optional 2FA; no outside provider.
- **Cloudflare Access** through a Cloudflare Tunnel: no open ports, same sign-in as on Workers.

Caddy gets the HTTPS certificate automatically, and Hop keeps its data in one SQLite file. The
image is published at `ghcr.io/mahdi-ninja/hop`. To deploy on another server or in Portainer,
`npm run setup:docker -- --export` writes a self-contained stack and env file
([how](docs/deploy/docker.md#run-it-on-another-host-or-in-portainer)). Want to try it first? The [Docker guide](docs/deploy/docker.md#try-it-on-your-machine) runs it on
`go.localhost` with Authelia, no domain or accounts needed. The guide also covers each sign-in
option, backups, and moving from Workers.

## Local development

```sh
npm install
npm run db:migrate:local
npm run db:seed:local            # optional: 10 demo links and a few thousand visits
npm run dev                      # http://go.localhost:4696/admin
```

The first `npm run dev` creates `.dev.vars` from `.dev.vars.example`. It sets `DEV_AUTH_EMAIL`,
which signs you in locally without Access; edit it to use another email.

Short links work locally too: `http://go.localhost:4696/<slug>` redirects through your local
Worker. Browsers and macOS send any `*.localhost` name to your own machine, so there's nothing
to configure. For hot reload while working on the dashboard, also run `npm run dev:dashboard`
and open http://go.localhost:4697/admin/.

The local sign-in shortcut only works when `DEV_AUTH_EMAIL` is set **and** the request is to
`localhost`, a `*.localhost` name or `127.0.0.1`. Cloudflare only routes your real domain to the
deployed Worker, so a production request can never look local, and the Docker server never
enables the shortcut.

`npm run dev` runs Hop the Cloudflare way, which is quickest for working on the code. To run the
Docker preset locally, see [Try it on your machine](docs/deploy/docker.md#try-it-on-your-machine).

### Commands

| Command | What it does |
|---|---|
| **Development** | |
| `npm run dev` | Build the dashboard, then run the Worker on http://go.localhost:4696 |
| `npm run dev:dashboard` | Vite dev server with hot reload on :4697 (proxies `/api` to the Worker) |
| `npm run typecheck` | TypeScript checks for the Worker, the Node server and the dashboard |
| `npm test` | Portability boundary check, then Vitest in the Workers runtime and in Node |
| `npm run db:migrate:local` | Apply migrations to the local database |
| `npm run db:seed:local` | Replace local data with demo links and visits |
| **Cloudflare** | |
| `npm run setup` | Interactive first deploy |
| `npm run deploy` | Checks, build, database migrations, deploy, live checks |
| `npm run doctor` | Check deploy readiness without changing anything (`-- --live` also checks the site) |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database |
| **Docker** | |
| `npm run setup:docker` | Interactive setup: writes `.env` and the sign-in files |
| `npm run setup:docker -- --export` | Write a self-contained stack for Portainer or another host to `hop-stack/` |
| `docker compose up -d --build` | Build and start Hop with the sign-in option from `.env` |
| `npm run doctor -- --docker` | Check the Docker setup (`--live` also checks the site) |
| `npm run build:node` | Build the dashboard and bundle the Node server into `dist/node.mjs` (the image does this) |

## Cost and limits

**Cloudflare:** for a small team, Hop fits in the free tiers: Workers Free, D1 free, and Zero
Trust free (up to 50 users). Each click is one small D1 write. If a link goes viral, the Workers
Paid plan raises the daily limits; check Cloudflare's pricing page for current numbers.

**Docker:** the cost is your server, and a small VPS is plenty. One server means no failover:
if it's down, so are your short links. Caddy has no rate limiting, so put Cloudflare in front if
you expect abuse ([details](docs/deploy/docker.md#limits-and-abuse)).

## Privacy

Hop records, per visit: time, country/region/city (from Cloudflare, when it's in front), the
referring site's host name, device type, browser, OS, and whether it looks like a bot. It never stores IP
addresses or full referrer URLs, sets no cookies on people who click links, and has no tracking
scripts. (Cloudflare Access, oauth2-proxy or Authelia sets its own sign-in cookie for
dashboard users.)

## FAQ

**Why no built-in logins?** Sign-in happens in front of Hop (Cloudflare Access, oauth2-proxy
or Authelia), which gives you Google, GitHub, Microsoft or email-code sign-in and the rules for
who's allowed in, without Hop storing any passwords or sessions.

**Can I run it somewhere other than Cloudflare?** Yes, with Docker on any server (see "Deploy
with Docker"). Other platforms such as Vercel or Netlify aren't supported; the database, geo
lookup and sign-in sit behind small interfaces ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) if
you want to explore one.

**Is anything sent to third parties?** No. The dashboard's fonts are self-hosted, and title
fetching only requests the page you're shortening.

**What's deliberately not included?** Link expiry, tags, multiple domains, API keys and user
roles. See the non-goals in [docs/SPEC.md](docs/SPEC.md).

## Documentation

- [Spec](docs/SPEC.md): what Hop does and doesn't do
- [Architecture](docs/ARCHITECTURE.md): code layout, data model, auth, request flow
- [API](docs/API.md): the dashboard's JSON API
- [Deployment](docs/DEPLOYMENT.md): choosing where to run Hop
  - [Cloudflare Workers](docs/deploy/cloudflare.md): setup, deploys, checks, limits
  - [Docker](docs/deploy/docker.md): setup, sign-in options, backups, moving from Workers
- [Cloudflare checklist](docs/CLOUDFLARE-CHECKLIST.md): account, domain, Zero Trust and login
  setup for newcomers (Cloudflare deployments only)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue,
follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Licence

[MIT](LICENSE). The bundled fonts (Bricolage Grotesque, DM Sans, DM Mono) are under the SIL Open
Font License; their licence files are in `dashboard/public/fonts`. `ua-parser-js` is pinned to v1
(MIT) because v2 is AGPL.
