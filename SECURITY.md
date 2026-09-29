# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Report them privately through GitHub: [report a vulnerability](https://github.com/mahdi-ninja/hop/security/advisories/new)
(the repository's **Security** tab → **Report a vulnerability**). If that isn't available, email **git@dotmahdi.com** with "Hop
security" in the subject.

Please include what you found, how to reproduce it, and the impact you expect. You'll get an
acknowledgement within a few days. Fixes are released as soon as they're ready, and reporters
are credited in the release notes unless they prefer not to be.

## Supported versions

Security fixes go into the latest release on the `main` branch. Hop is self-hosted, so update
your deployment to get them: `git pull` and `npm run deploy` on Cloudflare, `git pull` and
`docker compose up -d --build` on Docker, or pull the new `ghcr.io/mahdi-ninja/hop` image and
redeploy an exported stack. Update the pinned Caddy, oauth2-proxy, Authelia and
cloudflared images in `compose.yaml` when they publish security releases, then export again for
exported stacks, which carry their own copy of those versions.

## Scope

In scope: the Worker and the Node server (redirects, API, authentication checks), the dashboard,
the setup/deploy scripts, and the Docker preset's configuration (`compose.yaml`, the Caddy and
Authelia files). Out of scope: Cloudflare's own services and bugs in Caddy, oauth2-proxy or
Authelia themselves (report those to their projects), deployments whose Access application was
changed to leave `/admin` or `/api` unprotected, and Docker deployments that publish Hop's port
or share `PROXY_SECRET`.

## How Hop is designed to be safe

- The dashboard and API sit behind Cloudflare Access, **and** the Worker verifies the Access
  token itself (issuer, audience and signature), so a misconfigured Access app doesn't expose
  them.
- On Docker with oauth2-proxy or Authelia, Caddy strips any sign-in headers a visitor sends and
  only adds the signed-in email after the auth proxy approves the request. Hop accepts that email
  only together with a shared secret (compared in constant time), and Hop's container publishes no
  ports. A Docker deployment with missing or weak settings refuses to start.
- Without Cloudflare in front, Docker ignores visitor-supplied location headers.
- The local sign-in shortcut needs both `DEV_AUTH_EMAIL` and a local host name, which
  production traffic can't have.
- Preview URLs are disabled, and so is the `workers.dev` address unless you chose it as your
  short-link domain, so the Worker is only reachable on the one domain Access protects.
- Visits never include IP addresses.
