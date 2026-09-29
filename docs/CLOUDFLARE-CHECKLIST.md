# Cloudflare checklist for Hop

Running Hop on Docker with oauth2-proxy or Authelia? You don't need Cloudflare at all; see
the [Docker guide](deploy/docker.md). The Docker + Cloudflare Access option needs steps
1, 3 (your own domain, not `workers.dev`), 4 and 5 below, plus Node.js and a tunnel; `setup:docker`
guides you.

New to Cloudflare? Work through this list before running `npm run setup`. Each step links to
Cloudflare's own guide. Menu names below match Cloudflare's docs as of September 2026; if a
screen looks different, the linked guide is the source of truth.

Everything here is on Cloudflare's free plans. The only cost is a domain, if you don't already
have one (or use a free `workers.dev` address instead, see step 3).

## Before you start

- [ ] **1. Create a Cloudflare account** at https://dash.cloudflare.com/sign-up.

- [ ] **2. Verify your email address.** Cloudflare won't deploy Workers from an unverified account
  (deploys fail with error `10034`). If you missed the email: **My Profile** → **Email Address** →
  **Send verification email**. It shows `(verified)` once done.
  [Guide](https://developers.cloudflare.com/fundamentals/user-profiles/verify-email-address/)

- [ ] **3. Decide where short links will live.**
  - **Your own domain (recommended)**, e.g. `go.yourcompany.com`:
    - Add the domain: **Domains** → **Onboard a domain**, pick the Free plan, then change your
      nameservers at your registrar to the two Cloudflare gives you. Wait until the domain shows as
      **Active**. [Guide](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/) ·
      [Changing nameservers](https://developers.cloudflare.com/dns/nameservers/update-nameservers/)
    - No domain yet? You can buy one at cost from the **Register domains** page.
      [Guide](https://developers.cloudflare.com/registrar/get-started/register-domain/)
    - Pick the hostname for links (a subdomain such as `go.` works well) and make sure it has **no
      existing DNS record**, since Cloudflare can't attach a Worker to a hostname that already has one.
      [Guide](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  - **A free `workers.dev` address**, e.g. `hop.yourname.workers.dev`: no domain needed, good for
    trying Hop. Find or set your subdomain under **Workers & Pages** → **Your subdomain**
    (**Change** to pick one). Links there are tied to your Cloudflare account, and some networks
    block `workers.dev`, so switch to your own domain before sharing links widely.
    [Guide](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

- [ ] **4. Turn on Zero Trust (for sign-in).** In the dashboard select **Zero Trust**, choose a
  **team name** (your sign-in page becomes `<team>.cloudflareaccess.com`), and pick the **Zero Trust
  Free** plan. A payment method is required even on Free, but Free isn't charged; it covers up to 50
  users. Your team name and domain are shown later under **Zero Trust** → **Settings**.
  [Guide](https://developers.cloudflare.com/cloudflare-one/setup/) ·
  [Plans](https://www.cloudflare.com/plans/zero-trust-services/)

- [ ] **5. Choose how your team signs in.** New Zero Trust organizations only let **members of your
  Cloudflare account** sign in. For teammates, add a login method: **Zero Trust** → **Integrations** →
  **Identity providers** → **Add new identity provider**:
  - **One-time PIN**: people get a code by email. Nothing else to set up.
    [Guide](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
  - **Google** or **GitHub**: sign in with those accounts.
    [Google](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/) ·
    [GitHub](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/)

- [ ] **6. Install Node.js** (22.22 or newer, 24, or 26; see `.nvmrc`), then in the repo run
  `npm install`.

- [ ] **7. Log Wrangler in to the right account.** Run `npx wrangler login`, approve in the browser,
  then check with `npx wrangler whoami`. Logged in to the wrong account? `npx wrangler logout`, then log
  in again. If your browser is signed in to a different Cloudflare account, use
  `npx wrangler login --browser=false` and open the printed link in a private window.
  [Guide](https://developers.cloudflare.com/workers/wrangler/commands/general/#login)

- [ ] **8. Optional: create an API token for automatic sign-in setup.** `npm run setup` can create
  the Access application for you; it needs a token for that. Skip this if you'd rather follow
  setup's guided dashboard steps (with a `workers.dev` address, use the token route: the dashboard
  may not offer `workers.dev` hostnames).
  1. **My Profile** → **API Tokens** → **Create Token**, then create a **custom token**.
  2. Permissions: **Account** · **Access: Apps and Policies** · **Edit**, and **Account** ·
     **Access: Organizations, Identity Providers, and Groups** · **Read**. For a `workers.dev`
     address, also **Account** · **Workers Scripts** · **Read** (setup uses it to look up your
     `workers.dev` subdomain).
  3. **Account Resources**: include your account. **Continue to summary** → **Create Token**.
  4. Copy the token (it's shown only once). Paste it when setup asks, or first run
     `export HOP_CLOUDFLARE_API_TOKEN=<token>` in the terminal where you'll run setup. Don't put it
     in `CLOUDFLARE_API_TOKEN`: Wrangler would use it instead of your login and fail. Setup never
     saves the token.

  [Guide](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) ·
  [Permission names](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)

## Run setup

- [ ] **9.** `npm run setup`, and answer its questions. It checks your answers as it goes and
  deploys at the end. What each step does: [the Cloudflare guide](deploy/cloudflare.md).

## After the first deploy

- [ ] **10. Sign in once** at `https://<your-domain>/admin`, and ask a teammate to try too (this
  confirms step 5).
- [ ] **11. Open a short link in a private window.** It should redirect with no login prompt.
- [ ] **12. Delete the API token** from step 8 if you made one: **My Profile** → **API Tokens**, then
  the menu next to the token. Setup doesn't need it again unless you change the Access application.
  [Guide](https://developers.cloudflare.com/fundamentals/api/how-to/roll-token/)
- [ ] **13. If you created the Access application by hand**, check its cookie settings:
  **Zero Trust** → **Access controls** → **Applications** → your app → **Configure** →
  **Additional settings** → **Cookie settings**: **SameSite** set to **Lax**, **HttpOnly** on (the
  default). [Guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/#cookie-settings)
- [ ] **14. Optional, custom domains only: limit abuse of public links.** On your domain's
  **Security rules** page → **Create rule** → **Rate limiting rules**. The Free plan includes one rule
  that matches on the URL path and counts over 10 seconds, for example: when the path doesn't start
  with `/admin` or `/api`, more than 30 requests per 10 seconds from one IP → **Block**.
  [Guide](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/) ·
  [What's included](https://developers.cloudflare.com/waf/rate-limiting-rules/)

## Renaming later

Both names below can be changed at any time, but Hop remembers them, so re-run setup afterwards.

- **Your `workers.dev` subdomain** (only if your links use `workers.dev`): **Workers & Pages** →
  **Change** next to **Your subdomain**. Every existing `workers.dev` short link and QR code stops
  working, since the old address goes away. Then run `npm run setup` and choose the workers.dev
  option: it looks up the new subdomain with your API token, and automatic Access setup creates the
  Access application for the new address. Let it deploy. Delete the old Access application under **Zero Trust** → **Access
  controls** → **Applications**.
  [Guide](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- **Your Zero Trust team name**: **Zero Trust** → **Settings** → **Team name** → **Edit**. Your
  sign-in address changes to the new `<team>.cloudflareaccess.com`, and Hop rejects dashboard
  sign-ins until it knows it (`npm run doctor` reports this). Run `npm run setup`, choose to update
  the settings, and at the Access step pick automatic setup (it reads the new team domain) or enter
  the new team domain in the guided steps. Short links keep working throughout.
  [Guide](https://developers.cloudflare.com/cloudflare-one/setup/)

## Good to know

- **Free-plan limits** are plenty for a small team; each click is one small database write.
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) ·
  [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- **Several Cloudflare accounts on one machine?** Wrangler has (beta) login profiles, so you don't
  have to log out and in.
  [Guide](https://developers.cloudflare.com/workers/wrangler/profiles/)
- **Stopping:** cancel the Zero Trust plan from the billing section under **Zero Trust** →
  **Settings**, and delete the Worker from **Workers & Pages**.
  [Cancel a subscription](https://developers.cloudflare.com/billing/manage/cancel-subscription/) ·
  [Delete an account](https://developers.cloudflare.com/fundamentals/user-profiles/delete-account/)
