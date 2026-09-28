# Changelog

All notable changes to Hop are listed here. Hop follows [semantic versioning](https://semver.org/).

## Unreleased

- `npm run setup` can put short links on a free `workers.dev` address (no domain needed): it looks
  up the account's subdomain with the API token, and Access protects `/admin` and `/api` there.
- Setup reads its API token from `HOP_CLOUDFLARE_API_TOKEN` (or a prompt). `CLOUDFLARE_API_TOKEN`
  is left to Wrangler, and setup and `doctor` warn when it would replace Wrangler's login.
- The API token prompt is visible again, and confirms when a token is received.
- `npm run dev` creates `.dev.vars` from `.dev.vars.example` when it's missing, so local sign-in
  works right after cloning; without it, local `/admin` and `/api` now explain how to fix it.
- Setup warns when only members of your Cloudflare account can sign in, and all dashboard steps
  use Cloudflare's current menu names.
- New [Cloudflare checklist](docs/CLOUDFLARE-CHECKLIST.md) for newcomers.

## 0.1.0 — first public release

- Short links on your own domain: custom or random slugs, background title fetching, query
  strings passed through, public 404 page.
- Smart routing: rules by continent, country, device, browser, OS, language or bot/person, with
  time windows and weighted A/B splits, plus a "Test a visitor" panel.
- Analytics: visits per day, countries, referrers, devices, browsers and operating systems,
  recent visits, and an overview; bots filtered out; no IP addresses stored.
- QR codes with SVG and PNG download.
- Dashboard: search, pagination, copy buttons, light and dark mode, phone layout.
- Sign-in with Cloudflare Access, verified again in the Worker; local development sign-in
  shortcut.
- `npm run setup`, `npm run deploy` and `npm run doctor` for deploying to Cloudflare.
