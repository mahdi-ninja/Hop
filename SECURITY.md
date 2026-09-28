# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Report them privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. If that isn't available, email **git@dotmahdi.com** with "Hop
security" in the subject.

Please include what you found, how to reproduce it, and the impact you expect. You'll get an
acknowledgement within a few days. Fixes are released as soon as they're ready, and reporters
are credited in the release notes unless they prefer not to be.

## Supported versions

Security fixes go into the latest release on the `main` branch. Hop is self-hosted, so update
your deployment with `git pull` and `npm run deploy` to get them.

## Scope

In scope: the Worker (redirects, API, authentication checks), the dashboard, and the
setup/deploy scripts. Out of scope: Cloudflare's own services (report those to Cloudflare),
and deployments whose Access application was changed to leave `/admin` or `/api` unprotected.

## How Hop is designed to be safe

- The dashboard and API sit behind Cloudflare Access, **and** the Worker verifies the Access
  token itself (issuer, audience and signature), so a misconfigured Access app doesn't expose
  them.
- The local sign-in shortcut needs both `DEV_AUTH_EMAIL` and a local host name, which
  production traffic can't have.
- Preview URLs are disabled, and so is the `workers.dev` address unless you chose it as your
  short-link domain, so the Worker is only reachable on the one domain Access protects.
- Visits never include IP addresses.
