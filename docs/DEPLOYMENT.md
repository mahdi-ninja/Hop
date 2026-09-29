# Hop — Deployment

Hop runs the same app, dashboard and API on either of two hosts. Pick one and follow its guide.

| | [Cloudflare Workers](deploy/cloudflare.md) | [Docker](deploy/docker.md) |
|---|---|---|
| Runs on | Your Cloudflare account; no server | Any server with Docker Compose |
| Cost for a small team | Free plans (Zero Trust asks for a payment method) | Your server; a small VPS is plenty |
| Domain | Your own, or a free `workers.dev` address | Your own, pointed at the server |
| Sign-in | Cloudflare Access | oauth2-proxy (Google, GitHub, Microsoft, OIDC), Authelia (local users), or Cloudflare Access through a Tunnel |
| Database | D1 | One SQLite file on a volume |
| Visitor locations | Always | Only when Cloudflare is in front of the server |
| Availability | Cloudflare's network | One server, no failover |
| Setup | `npm run setup`, then `npm run deploy` | `npm run setup:docker`, then `docker compose up -d --build`, or export a stack for Portainer or another host |
| Try it without a domain | `workers.dev` address | `go.localhost` on your machine |

**Choosing:** Cloudflare is the least to run: no server, free, and visitor locations built in.
Docker suits you if you'd rather not use Cloudflare, already run servers, or want your team to
sign in with an identity provider you have. You can move from Workers to Docker later with your
links and stats ([how](deploy/docker.md#moving-from-workers-to-docker)).

## Cloudflare Workers
[deploy/cloudflare.md](deploy/cloudflare.md): prerequisites, `npm run setup`, `workers.dev`,
later deploys, `npm run doctor`, live checks, manual fallback, abuse and limits. New to
Cloudflare? Start with the [Cloudflare checklist](CLOUDFLARE-CHECKLIST.md).

## Docker
[deploy/docker.md](deploy/docker.md): prerequisites, `npm run setup:docker`, trying it on your
machine, each sign-in option, exporting a stack for Portainer or another host, updates, backups,
moving from Workers, and limits.
