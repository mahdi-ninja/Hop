# Contributing to Hop

Thanks for helping. Hop aims to stay small: a fast redirect path, a focused dashboard, sign-in
handled in front of Hop (never inside it), and the same app on Cloudflare Workers and Docker.
Changes that keep it that way are the easiest to accept.

## Before you start
- **Bugs:** open an issue with steps to reproduce.
- **Features:** open an issue to discuss the idea first. Check the non-goals in
  [docs/SPEC.md](docs/SPEC.md): link expiry, tags, multiple domains, API keys and user roles are
  deliberately out of scope.
- **Security issues:** don't open a public issue; see [SECURITY.md](SECURITY.md).

## Development setup
Use the Node version in `.nvmrc` (any of 22.22+, 24 or 26 works).

```sh
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev            # http://go.localhost:4696/admin (creates .dev.vars on first run)
```

No Cloudflare account is needed for local development or tests.

## Making a change
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), especially the portability rules: only
  `src/worker.ts`, `src/adapters/cloudflare/` and `src/adapters/d1/` may use Cloudflare-specific
  APIs, and only `src/node.ts` and `src/adapters/node/`, `sqlite/` and `proxy/` may use Node APIs.
  All SQL lives in `src/adapters/sql/`. `npm test` enforces this.
- TypeScript strict mode everywhere. No `any` unless unavoidable, with a comment saying why.
- Keep the Worker dependency-light; it runs on every redirect. Ask in an issue before adding a
  dependency.
- Behaviour changes update [docs/SPEC.md](docs/SPEC.md), and API changes update
  [docs/API.md](docs/API.md), in the same pull request.
- Comments explain *why* (a constraint, a workaround, a trade-off), not *what* the code does.
- Never commit real account IDs, database IDs, Access values, domains or secrets. Use made-up
  values in tests and docs; your own settings belong in the git-ignored `hop.config.json`
  (Cloudflare) or `.env`, `docker/authelia/users.yml` and `docker/oauth2-proxy/emails.txt` (Docker).

## Checks
```sh
npm run typecheck
npm test
npm run build:dashboard
```
`npm test` runs two Vitest projects: `workers` (the Workers runtime) and `node` (`test/node/`, the
SQLite, proxy and Docker-setup code). For changes to the Docker preset, also run it locally
([Try it on your machine](docs/deploy/docker.md#try-it-on-your-machine)) and
`npm run doctor -- --docker`. CI runs these checks, builds the Docker image, and validates the
Caddy configuration on every pull request. Pushes to `main` and version tags publish the image to
`ghcr.io/mahdi-ninja/hop` (`.github/workflows/image.yml`). A new GHCR package can start out
private: after its first publish, a maintainer checks **Package settings** → **Change
visibility** → **Public**, or nobody else can pull it. Proxy image versions are pinned only in
`compose.yaml`; bump them there.

## Commits and pull requests
- One short sentence per commit message, e.g. `Add Access JWT verification`. No prefixes, no
  emojis.
- Keep pull requests focused on one change, and describe how you tested it. Screenshots help for
  dashboard changes (light and dark, desktop and phone width).

## AI coding agents
[AGENTS.md](AGENTS.md) collects the rules above in the form coding agents read.
