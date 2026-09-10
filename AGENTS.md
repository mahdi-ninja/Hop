# Hop — instructions for coding agents

Hop is a small, self-hosted URL shortener that runs on Cloudflare Workers. A small team manages links through a web dashboard; anyone can use
short links. Access control is handled by Cloudflare Access — Hop has no login code.

## Read these first, in order
1. `docs/SPEC.md` — what to build and what NOT to build
2. `docs/ARCHITECTURE.md` — stack, layout, schema, auth, request flow
3. `docs/API.md` — exact API contract between Worker and dashboard
4. `docs/DEPLOYMENT.md` — setup steps (some are manual steps for the human)

## Working rules
- Before finishing a change: run typecheck and tests, fix failures, then make a git
  commit (see Commit rules below).
- Do not add features listed under "Non-goals" in SPEC.md. If something seems missing
  or contradictory, stop and ask rather than inventing scope.
- Stick to the stack in ARCHITECTURE.md. Ask before adding any dependency not listed there.
- TypeScript strict mode everywhere. No `any` unless unavoidable and commented.
- Keep the Worker small and dependency-light; it runs on every redirect.
- Respect the portability boundaries in ARCHITECTURE.md: only code under `src/adapters/`
  and the entry point `src/worker.ts` may touch `env.DB`, `request.cf`, or Access
  headers/JWTs. Everything else goes through the interfaces in `src/core/ports.ts`.
- Never commit secrets or real IDs. `.dev.vars` must be in `.gitignore`.

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
- When a step needs the human (Cloudflare dashboard, DNS, Access setup), say so clearly,
  point to the relevant section of DEPLOYMENT.md, and continue with what you can do locally.
- Keep `README.md` at the repo root up to date with setup and commands as you go.

## Commands (keep this section accurate as the project evolves)
- `npm install` — install root + dashboard deps (npm workspace)
- `npm run dev` — local Worker with local D1, dashboard built into assets
- `npm run dev:dashboard` — Vite dev server for dashboard work (proxies /api to the Worker)
- `npm run typecheck`
- `npm test` — boundary check, then Vitest in the Workers pool
- `npm run check:boundaries`
- `npm run db:migrate:local` / `npm run db:migrate:remote`
- `npm run db:seed:local` — demo links and visits in local D1
- `npm run deploy` — builds dashboard, then `wrangler deploy`
