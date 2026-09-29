# Hop — instructions for coding agents

Hop is a small, self-hosted URL shortener that runs on Cloudflare Workers or, via the Docker preset,
on Node + SQLite. A small team manages links through a web dashboard; anyone can use short links.
Sign-in happens in front of Hop (Cloudflare Access, or oauth2-proxy / Authelia on Docker) — Hop has
no login code.

Human contributors: see `CONTRIBUTING.md`. These rules apply to everyone; this file adds the
parts specific to AI coding agents.

## Read these first
1. `docs/SPEC.md` — what Hop does, and what it deliberately doesn't (Non-goals)
2. `docs/ARCHITECTURE.md` — stack, layout, schema, auth, request flow, portability rules
3. `docs/API.md` — exact API contract between the server and the dashboard
4. `docs/DEPLOYMENT.md` — choosing a host, then `docs/deploy/cloudflare.md` or `docs/deploy/docker.md`
   for setup and deploy (some steps need the human)

## Working rules
- Before finishing a change: run `npm run typecheck` and `npm test`, fix failures, and update
  the docs the change affects (SPEC, API, ARCHITECTURE, the deploy guides, README, this file's
  command list).
- New behaviour goes into `docs/SPEC.md` (and `docs/API.md` for API changes) as part of the
  same change.
- Do not add features listed under "Non-goals" in SPEC.md. If something seems missing
  or contradictory, stop and ask rather than inventing scope.
- Stick to the stack in ARCHITECTURE.md. Ask before adding any dependency not listed there.
- TypeScript strict mode everywhere. No `any` unless unavoidable and commented.
- Keep the Worker small and dependency-light; it runs on every redirect.
- Respect the portability boundaries in ARCHITECTURE.md: only code under `src/adapters/`
  and the entry points `src/worker.ts` / `src/node.ts` may touch `env.DB`, `request.cf`, Access
  headers/JWTs, `node:*` modules, `process.env`, or the trusted proxy headers. Everything else
  goes through the interfaces in `src/core/ports.ts`. All SQL lives in `src/adapters/sql/`.
- Never commit secrets or real IDs (account, database, Access AUD, real domains).
  `.dev.vars`, `hop.config.json`, `.env`, `docker/authelia/users.yml`,
  `docker/oauth2-proxy/emails.txt` and `hop-stack/` must stay git-ignored; use made-up values in tests and docs.
- Keep `ua-parser-js` on v1 (MIT); v2 is AGPL.

## Comment rules
- Write code that explains itself through clear names and structure. Do not add comments
  that restate what the code does.
- Only comment when the code cannot show the intent on its own: a non-obvious reason,
  a workaround, a security or ordering constraint, or a deliberate trade-off.
- No commented-out code, no section-divider or banner comments, no TODOs without a reason.
- No JSDoc blocks on functions whose name and types already make usage obvious.

## Commit rules
- One short sentence per commit message, e.g. `Add Access JWT verification`.
- No body, no bullet lists, no prefixes, no emojis.
- No attribution of any kind: no `Co-Authored-By` trailers, no "Generated with …" lines,
  no tool or agent names.
- When a step needs the human (Cloudflare dashboard, DNS, Access setup, an OAuth app, the
  server), say so clearly, point to the relevant section of `docs/deploy/cloudflare.md` or
  `docs/deploy/docker.md`, and continue with what you can do locally.
- Keep `README.md` at the repo root up to date with setup and commands.

## Commands (keep this section accurate as the project evolves)
- `npm install` — install root + dashboard deps (npm workspace)
- `npm run dev` — local Worker at http://go.localhost:4696 with local D1, dashboard built into assets
  (creates `.dev.vars` from `.dev.vars.example` if it's missing)
- `npm run dev:dashboard` — Vite dev server on :4697 for dashboard work (proxies /api to the Worker)
- `npm run typecheck` — Worker (`tsconfig.json`), Node entry (`tsconfig.node.json`), dashboard
- `npm test` — boundary check, then Vitest: `workers` project (Workers pool) and `node` project (`test/node/`)
- `npm run check:boundaries`
- `npm run db:migrate:local` / `npm run db:migrate:remote` (remote uses `hop.config.json`)
- `npm run db:seed:local` — demo links and visits in local D1
- `npm run setup` — interactive first deploy; writes the git-ignored `hop.config.json`
- `npm run deploy` — checks, builds dashboard, applies remote migrations, deploys, verifies
- `npm run doctor` — deploy-readiness checks (`-- --live` checks the deployed site)
- `npm run build:node` — dashboard build + esbuild bundle of `src/node.ts` into `dist/node.mjs`
- `npm run setup:docker` — interactive Docker setup; writes the git-ignored `.env` and sign-in files
- `npm run setup:docker -- --export [--image=<ref>]` — self-contained stack in the git-ignored `hop-stack/`
  (published image, inlined configs) for Portainer or another host
- `npm run doctor -- --docker` — Docker preset checks (`--live` checks the running site)
- `docker compose up -d --build` — run the Docker preset (profile from `COMPOSE_PROFILES` in `.env`)
