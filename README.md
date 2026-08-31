# Hop

A small, self-hosted URL shortener on Cloudflare Workers + D1, with a team dashboard
protected by Cloudflare Access.

See `docs/` for the spec, architecture, API contract, and deployment steps.

## Local development

Requires Node.js LTS.

```sh
npm install
cp .dev.vars.example .dev.vars   # sets DEV_AUTH_EMAIL for the localhost-only auth bypass
npm run dev                      # http://localhost:8787
```

`wrangler.jsonc` sets `dev.host` to `localhost` so the Worker sees `localhost` as its host
under `wrangler dev` (otherwise wrangler rewrites it to the production route).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local Worker via `wrangler dev` |
| `npm run typecheck` | Regenerates `worker-configuration.d.ts` and runs `tsc` |
| `npm test` | Portability boundary check, then Vitest in the Workers runtime |
| `npm run check:boundaries` | Fails if Cloudflare-specific APIs leak outside `src/worker.ts` / `src/adapters/` |
