# Deploy Hop with Docker

Hop on Node + SQLite, in Docker Compose, on any server you run. Short links go straight to Hop;
`/admin` and `/api` go through the sign-in you choose: oauth2-proxy, Authelia, or Cloudflare
Access through a Cloudflare Tunnel. How it fits together:
[ARCHITECTURE.md → Docker runtime](../ARCHITECTURE.md#docker-runtime). Prefer no server? See
[Cloudflare Workers](cloudflare.md). Comparing the two: [DEPLOYMENT.md](../DEPLOYMENT.md).

Steps marked **[Human]** need an identity provider's console, the Cloudflare dashboard, or the
server you're deploying to. (AI coding agents: prompt the human for these and wait, rather than
guessing values.)

## Prerequisites **[Human]**
- A server with Docker Engine and Docker Compose v2, and a clone of this repo on it
- Node.js 22.22+, 24 or 26 for `npm run setup:docker` and `npm run doctor`. They use no npm
  packages, so `npm install` isn't needed on the server. Or write the settings by hand: copy
  `.env.example` to `.env` and fill it in, and copy the sign-in option's file next to its example
  (`docker/oauth2-proxy/emails.txt`, or `docker/authelia/users.yml` with a real password hash).
  Create that file before the first `docker compose up`: a missing bind-mounted file makes Docker
  create a directory in its place.
- **oauth2-proxy or Authelia:** a domain whose DNS A/AAAA record points at the server, with ports
  80 and 443 open. Caddy gets a Let's Encrypt certificate on first start.
- **Cloudflare Access:** the domain active in a Cloudflare account with Zero Trust turned on and
  a login method for your team (steps 1, 3, 4 and 5 of the
  [Cloudflare checklist](../CLOUDFLARE-CHECKLIST.md), plus Node as above). No open ports are needed.

## Set up
```
npm run setup:docker                 # writes .env and the sign-in files
docker compose up -d --build
npm run doctor -- --docker --live    # checks .env, compose.yaml and the live site
```
Settings live in `.env` (git-ignored, mode 600). Re-running `setup:docker` keeps its secrets and
offers its answers as defaults. If you switch sign-in options, first stop the old one with
`docker compose --profile <old option> down`.

**Visitor locations:** analytics and geo routing rules need Cloudflare's location headers. Answer
yes to the setup question only if the server is proxied by Cloudflare (orange cloud) **and**
firewalled to accept only [Cloudflare's IP ranges](https://www.cloudflare.com/ips/). Otherwise
visitors could send the headers themselves, so Hop ignores them and locations show as "Unknown".

## Try it on your machine
Authelia on `go.localhost` needs no domain, DNS or OAuth app; ports 80 and 443 must be free.
1. `npm run setup:docker`: domain `go.localhost`, sign-in **Authelia**, not behind Cloudflare.
   Note the email and password it prints.
2. `docker compose up -d --build`, then open https://go.localhost/admin and sign in.

Caddy uses its own local certificate authority for `*.localhost` names, so the browser warns
about the certificate. To trust it on macOS:
```
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-root.crt
```
`npm run doctor -- --docker --live` needs `NODE_EXTRA_CA_CERTS=./caddy-root.crt` for the same
reason. Short URLs show as `http://go.localhost/…` locally, as in `npm run dev`. Clean up with
`docker compose down -v` and delete `.env` and `docker/authelia/users.yml`.

## Sign-in with oauth2-proxy (default) **[Human]**
People sign in with an account they already have. Create an OAuth app (client) with your provider
and use `https://<your domain>/oauth2/callback` as its redirect / callback URL:
- **Google:** [Google Cloud console](https://console.cloud.google.com/apis/credentials) →
  **Create credentials** → **OAuth client ID** → **Web application**. On Google Workspace, set
  the consent screen to **Internal** so only your organisation can sign in.
- **GitHub:** [Developer settings](https://github.com/settings/developers) → **OAuth Apps** →
  **New OAuth App**. Hop sees the account's primary verified email.
- **Microsoft Entra ID:** [App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
  → **New registration** → Web redirect URI, then **Certificates & secrets** → **New client
  secret**. The issuer URL is `https://login.microsoftonline.com/<tenant ID>/v2.0`.
- **Other OIDC** (Okta, Auth0, Keycloak, …): a confidential web client; setup asks for the issuer URL.

Setup asks who may sign in: an email domain (`OAUTH2_PROXY_EMAIL_DOMAINS` in `.env`), a list of
addresses (`docker/oauth2-proxy/emails.txt`, one per line), or both. After editing `emails.txt`,
run `docker compose restart oauth2-proxy`; after editing `.env`, run `docker compose up -d`.

## Sign-in with Authelia
People sign in with their **email address** and a password from a users file on the server; no
outside provider. Setup creates `docker/authelia/users.yml` with you as the first user and shows
the sign-in URL, your email and your password once.
- **Add a person:** hash a password with
  `docker compose run --rm authelia authelia crypto hash generate argon2`, then copy an entry in
  `users.yml` and use the person's email, **in lower case**, as the entry's key (in quotes) and as
  its `email`. Then run `docker compose restart authelia`. People can type their email in any
  case at sign-in, but Authelia refuses to start if a key in the file isn't lower case;
  `npm run doctor -- --docker` checks this.
- **Locked out after typos?** Authelia blocks an account for 5 minutes after 3 wrong passwords
  within 2 minutes; wait it out.
- **Password resets and 2FA** send links by "email", which this preset writes to a file instead:
  `docker compose exec authelia cat /data/notifications.txt`.
- **Require 2FA:** change `policy: one_factor` to `two_factor` in
  `docker/authelia/configuration.yml`, then `docker compose restart authelia`.

## Sign-in with Cloudflare Access (through a Tunnel) **[Human]**
The server makes an outbound tunnel to Cloudflare; Access protects `/admin` and `/api` and Hop
verifies Access tokens exactly as on Workers. Caddy doesn't run in this option.
1. In **Zero Trust**, create a remotely managed tunnel of type **Cloudflared**
   ([Cloudflare's guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/)).
   Copy the tunnel **token** from the install command, and skip installing the connector: the
   preset's `cloudflared` container is the connector.
2. Add a public hostname (route) to the tunnel for your domain, with service **HTTP** and URL
   `hop:8787`. Delete any existing DNS record for that hostname first; the route creates it.
3. Create the Access application for `<domain>/admin` and `<domain>/api` as in
   [Manual fallback step 2](cloudflare.md#manual-fallback-no-scripts) of the Workers guide, and copy
   its **AUD tag**.
4. For city and region in analytics: your domain → **Rules** → **Managed Transforms** → turn on
   **Add visitor location headers**. Country works without it.
5. `npm run setup:docker`, choose Cloudflare Access, and paste the team domain, AUD tag and token.

## Run it on another host or in Portainer
`compose.yaml` builds Hop from this repo and mounts files from it, so it only runs next to the
repo. To deploy somewhere else, export a self-contained stack:
```
npm run setup:docker                 # if you haven't yet: writes .env and the sign-in files
npm run setup:docker -- --export     # writes hop-stack/compose.yaml and hop-stack/stack.env
```
The exported `compose.yaml` uses the published image `ghcr.io/mahdi-ninja/hop:latest`, contains
only the services for your sign-in option (with the image versions pinned in the repo's
`compose.yaml`), and has the Caddy, Authelia and oauth2-proxy files inlined (as Compose
`configs`), so it needs nothing else from the repo. Secrets stay in `stack.env`. Both files are
private: the stack file holds Authelia password hashes or the oauth2-proxy email list.

`latest` is built from every push to `main`. Release tags publish versioned images too
(`v1.2.3` → `:1.2.3` and `:1.2`); once one exists, pin it with
`-- --export --image=ghcr.io/mahdi-ninja/hop:<version>`. `--image` can also point at your own
registry.

- **Portainer** (tested with Portainer CE 2.45): **Stacks** → **Add stack** → **Web editor**.
  Paste `hop-stack/compose.yaml`, then under **Environment variables** choose **Load variables
  from .env file** and pick `hop-stack/stack.env`. **Deploy the stack.**
- **Any Docker host** (Compose 2.23.1 or newer): copy `hop-stack/` over and run
  `docker compose --env-file stack.env up -d` in it.

The export also prints what has to be set up outside the stack for your sign-in option, and
writes the same checklist at the top of `compose.yaml`: DNS and ports for oauth2-proxy and
Authelia, the OAuth callback URL, or, for Cloudflare Access, the tunnel's public hostname
(`<domain>` → HTTP → `hop:8787`), the Access application and the location headers. The full steps
for each option are in the sign-in sections above. Run a tunnel token in one place only: a second
stack using it becomes another connector and receives part of the traffic.

Users and allowed emails are part of the exported stack: to change them, edit the files here,
export again, and replace the stack's contents (Portainer: the stack's **Editor** tab → paste →
**Update the stack**). In an exported stack, Authelia's users file is a copy inside the
container, so a password reset done through Authelia is lost when the stack is redeployed; set
new passwords by editing `users.yml` and exporting again.

If a pasted value such as a client secret contains spaces, `$`, `#` or similar characters, the
export quotes it in `stack.env` and warns you. Docker Compose reads the quotes; if Portainer's
.env loader keeps them as part of the value, type that value into Portainer's variable editor
instead.

## Updating
```
git pull
docker compose up -d --build
```
Hop applies new migrations when it starts. If the update changed files under `docker/` (the
Caddy, Authelia or oauth2-proxy configuration), also run `docker compose restart`: those files
are mounted, so a rebuild doesn't reload them.

For an exported stack, pull the new image and redeploy: in Portainer, the stack's **Editor** →
**Update the stack** with **Re-pull image** turned on; elsewhere,
`docker compose --env-file stack.env pull && docker compose --env-file stack.env up -d`. The
exported stack carries its own copy of the preset files and proxy image versions, so after a
`git pull` that changed `docker/` or the image versions in `compose.yaml`, export again and
replace the stack's contents.

## Backups
Hop's data is one SQLite file in the `hop-data` volume. These commands are for the repo's
`compose.yaml`, run in the repo; for an exported stack, run them in its `hop-stack/` folder with
`--env-file stack.env` after `docker compose`, or use `docker exec` / `docker run` with the
container and volume names Portainer shows (`<stack name>-hop-1`, `<stack name>_hop-data`).

To back up while Hop is running:
```
docker compose exec hop node --disable-warning=ExperimentalWarning -e "const { DatabaseSync, backup } = require('node:sqlite'); backup(new DatabaseSync(process.env.DATABASE_PATH), '/data/backup.db').then(() => console.log('Backed up.'))"
docker compose cp hop:/data/backup.db ./hop-backup.db
```
To restore `hop-backup.db`:
```
docker compose stop hop
docker compose run --rm --no-deps -v "$PWD/hop-backup.db:/import/backup.db:ro" hop sh -c 'rm -f /data/hop.db /data/hop.db-wal /data/hop.db-shm && cp /import/backup.db /data/hop.db'
docker compose start hop
```
This copies the file as Hop's own user and removes the old write-ahead log. Don't restore with
`docker compose cp`: the copied file would be owned by root, and Hop couldn't write to it.

## Moving from Workers to Docker
Export the D1 database, then import it into the Docker volume **before Hop's first start** (the
export includes its migration history, so nothing is migrated twice):
```
npx wrangler d1 export <database name> --remote --output hop.sql
docker compose run --rm --no-deps -v "$PWD/hop.sql:/import/hop.sql:ro" hop node --disable-warning=ExperimentalWarning -e "const { DatabaseSync } = require('node:sqlite'); new DatabaseSync(process.env.DATABASE_PATH).exec(require('node:fs').readFileSync('/import/hop.sql', 'utf8')); console.log('Imported.')"
docker compose up -d
```
If Hop has already started once, first remove its empty database with `docker compose down` and
`docker volume rm hop_hop-data` (the repo's `compose.yaml` names its project `hop`). For an
exported stack, run the import in its `hop-stack/` folder with `--env-file stack.env`, before
its first start.

## Limits and abuse
One process and one SQLite file comfortably handle a small team's links and traffic, but there
is no failover: if the server is down, so are the short links. Caddy has no rate limiting built
in; if a link is hammered, put the domain behind Cloudflare's proxy and use its rate-limiting rule
(see [Abuse and data growth](cloudflare.md#abuse-and-data-growth) in the Workers guide). To trim
old visits, run a `DELETE FROM visits WHERE ts < <UTC ms>` against the database the same way as
the backup command above.
