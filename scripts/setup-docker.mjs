// `npm run setup:docker`: asks a few questions and writes .env (plus the sign-in files) for
// compose.yaml. Safe to re-run: existing answers become the defaults and secrets are kept.
// `-- --export [--image=<ref>]` turns that setup into a self-contained stack in hop-stack/.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ask, askSecret, bold, choose, closePrompts, confirm, dim, fail, heading, info, ok, ROOT, run, warn } from './lib/cli.mjs';
import {
  AUTHELIA_USERS_FILE,
  autheliaUsersYaml,
  composeImages,
  ENV_FILE,
  listedEmails,
  OAUTH2_EMAILS_FILE,
  parseEnv,
  readPresetFile,
  serializeEnv,
  validateDockerEnv,
  withSecrets,
} from './lib/docker-config.mjs';
import { DEFAULT_IMAGE, deploySteps, EXPORT_DIR, quotedKeys, renderStack, stackEnv } from './lib/docker-export.mjs';
import { isValidAud, isValidHostname, isWorkersDevHost, normalizeHostname, normalizeTeamDomain } from './lib/hop-config.mjs';

const path = (file) => join(ROOT, file);
const readIfExists = (file) => readPresetFile(ROOT, file);

function writeWithMode(file, text, mode) {
  mkdirSync(dirname(path(file)), { recursive: true });
  writeFileSync(path(file), text);
  chmodSync(path(file), mode);
}

const writePrivate = (file, text) => writeWithMode(file, text, 0o600);

const existing = parseEnv(readIfExists(ENV_FILE) ?? '');
const env = { ...existing };

async function main() {
  if (Object.keys(existing).length) info(`Found ${ENV_FILE}; its values are the defaults and its secrets are kept.`);

  heading(1, 'Short domain');
  env.SHORT_DOMAIN = normalizeHostname(
    await ask('Domain for short links, e.g. go.example.com:', {
      default: existing.SHORT_DOMAIN,
      hint: 'Point its DNS A/AAAA record at this server. Caddy gets the HTTPS certificate on first start.',
      validate: (answer) => {
        const host = normalizeHostname(answer);
        if (!isValidHostname(host)) return 'Enter a hostname such as go.example.com.';
        if (isWorkersDevHost(host)) return 'workers.dev addresses only work on Cloudflare Workers; use `npm run setup` instead.';
        return null;
      },
    }),
  );
  env.ROOT_REDIRECT_URL = await ask(`Where should https://${env.SHORT_DOMAIN}/ send visitors? (blank = the dashboard)`, {
    default: existing.ROOT_REDIRECT_URL,
    validate: (answer) => (!answer || /^https?:\/\/\S+$/.test(answer) ? null : 'Enter an http(s) URL or leave it blank.'),
  });

  heading(2, 'Sign-in for the dashboard');
  const providers = ['oauth2-proxy', 'authelia', 'access'];
  env.AUTH_PROVIDER = await choose(
    'How should your team sign in?',
    [
      { value: 'oauth2-proxy', label: 'oauth2-proxy', hint: 'existing Google / GitHub / Microsoft / OIDC accounts' },
      { value: 'authelia', label: 'Authelia', hint: 'a local user list with passwords and optional 2FA' },
      { value: 'access', label: 'Cloudflare Access', hint: 'this server is reached through a Cloudflare Tunnel' },
    ],
    Math.max(0, providers.indexOf(existing.AUTH_PROVIDER)),
  );

  if (env.AUTH_PROVIDER === 'oauth2-proxy') await setUpOauth2Proxy();
  if (env.AUTH_PROVIDER === 'authelia') await setUpAuthelia();
  if (env.AUTH_PROVIDER === 'access') await setUpAccess();

  if (env.AUTH_PROVIDER !== 'access') {
    heading(3, 'Visitor locations');
    info('Country and city in analytics (and geo routing rules) need Cloudflare in front of this server.');
    const behindCloudflare = await confirm(
      'Is this server proxied by Cloudflare (orange cloud) AND firewalled to accept only Cloudflare IPs?',
      existing.GEO_SOURCE === 'cloudflare',
    );
    env.GEO_SOURCE = behindCloudflare ? 'cloudflare' : 'none';
    if (!behindCloudflare) info('Visitor locations will show as "Unknown".');
  }

  const final = withSecrets(env);
  writePrivate(ENV_FILE, serializeEnv(final));
  ok(`Wrote ${ENV_FILE}.`);

  const problems = validateDockerEnv(final, { emails: readIfExists(OAUTH2_EMAILS_FILE), autheliaUsers: readIfExists(AUTHELIA_USERS_FILE) });
  for (const problem of problems) warn(problem);

  console.log(`\n${bold('Next steps')}`);
  if (existing.AUTH_PROVIDER && existing.AUTH_PROVIDER !== env.AUTH_PROVIDER) {
    console.log(`  0. Stop the ${existing.AUTH_PROVIDER} stack first: docker compose --profile ${existing.AUTH_PROVIDER} down`);
  }
  if (env.AUTH_PROVIDER === 'access') {
    console.log('  1. In the tunnel, add a public hostname for your domain with service HTTP and URL hop:8787.');
    console.log('  2. docker compose up -d --build');
  } else {
    console.log(`  1. Point ${env.SHORT_DOMAIN} at this server and open ports 80 and 443.`);
    console.log('  2. docker compose up -d --build');
  }
  console.log('  3. npm run doctor -- --docker --live');
}

function exportStack() {
  if (Object.keys(existing).length === 0) throw new Error(`${ENV_FILE} is missing. Run \`npm run setup:docker\` first, then export.`);
  const files = {
    emails: readIfExists(OAUTH2_EMAILS_FILE),
    autheliaUsers: readIfExists(AUTHELIA_USERS_FILE),
  };
  const problems = validateDockerEnv(existing, files);
  if (problems.length) throw new Error(`Fix ${ENV_FILE} before exporting:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  const provider = existing.AUTH_PROVIDER;
  const image = process.argv.find((arg) => arg.startsWith('--image='))?.slice('--image='.length) || DEFAULT_IMAGE;
  const presetFiles = {
    ...files,
    caddyfile: readIfExists('docker/caddy/Caddyfile'),
    authSnippet: readIfExists(`docker/caddy/auth-${provider}.caddy`),
    geoSnippet: readIfExists(`docker/caddy/geo-${existing.GEO_SOURCE || 'none'}.caddy`),
    autheliaConfig: readIfExists('docker/authelia/configuration.yml'),
  };
  const compose = renderStack({ env: existing, image, images: composeImages(readIfExists('compose.yaml')), files: presetFiles });
  writePrivate(`${EXPORT_DIR}/compose.yaml`, compose);
  writePrivate(`${EXPORT_DIR}/stack.env`, stackEnv(existing));
  ok(`Exported the ${provider} stack for ${existing.SHORT_DOMAIN} to ${EXPORT_DIR}/ (image ${image}).`);
  const quoted = quotedKeys(existing);
  if (quoted.length) {
    warn(`${quoted.join(', ')} ${quoted.length > 1 ? 'contain' : 'contains'} characters that stack.env has to quote. Docker Compose reads the quotes correctly; if Portainer's .env loader doesn't, paste ${quoted.length > 1 ? 'those values' : 'that value'} into its variable editor instead.`);
  }
  console.log(`\n${bold('Deploy it')}`);
  console.log('  Portainer: Stacks → Add stack → Web editor. Paste compose.yaml, then under Environment');
  console.log('             variables choose "Load variables from .env file" and pick stack.env. Deploy.');
  console.log(`  Any host:  copy ${EXPORT_DIR}/ over, then run: docker compose --env-file stack.env up -d`);
  console.log(dim('  Both files hold secrets or password hashes. Keep them private and delete local copies you no longer need.'));
  console.log(`\n${bold(`Outside the stack (${provider})`)} ${dim('— also at the top of compose.yaml')}`);
  deploySteps(existing, presetFiles).forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
}

try {
  if (process.argv.includes('--export')) exportStack();
  else await main();
} catch (err) {
  if (err?.code === 'ABORT_ERR' || err?.name === 'AbortError') console.log('\nSetup stopped.');
  else fail(err.message);
  process.exitCode = 1;
} finally {
  closePrompts();
}

async function setUpOauth2Proxy() {
  const redirectUrl = `https://${env.SHORT_DOMAIN}/oauth2/callback`;
  const oauthProviders = ['google', 'github', 'entra-id', 'oidc'];
  env.OAUTH2_PROXY_PROVIDER = await choose(
    'Which accounts do people sign in with?',
    [
      { value: 'google', label: 'Google', hint: 'console.cloud.google.com → APIs & Services → Credentials' },
      { value: 'github', label: 'GitHub', hint: 'github.com/settings/developers → OAuth Apps' },
      { value: 'entra-id', label: 'Microsoft Entra ID', hint: 'portal.azure.com → App registrations' },
      { value: 'oidc', label: 'Other OIDC provider', hint: 'Okta, Auth0, Keycloak, …' },
    ],
    Math.max(0, oauthProviders.indexOf(existing.OAUTH2_PROXY_PROVIDER)),
  );
  console.log(`\n  ${bold('[You]')} Create an OAuth app with that provider and use this redirect / callback URL:`);
  console.log(`  ${bold(redirectUrl)}\n`);

  if (['entra-id', 'oidc'].includes(env.OAUTH2_PROXY_PROVIDER)) {
    env.OAUTH2_PROXY_OIDC_ISSUER_URL = await ask('OIDC issuer URL:', {
      default: existing.OAUTH2_PROXY_OIDC_ISSUER_URL,
      hint: env.OAUTH2_PROXY_PROVIDER === 'entra-id' ? 'https://login.microsoftonline.com/<tenant-id>/v2.0' : undefined,
      validate: (answer) => (/^https:\/\/\S+$/.test(answer) ? null : 'Enter an https:// URL.'),
    });
  } else {
    delete env.OAUTH2_PROXY_OIDC_ISSUER_URL;
  }
  env.OAUTH2_PROXY_CLIENT_ID = await ask('Client ID:', { default: existing.OAUTH2_PROXY_CLIENT_ID });
  if (!existing.OAUTH2_PROXY_CLIENT_SECRET || !(await confirm('Keep the client secret already in .env?', true))) {
    env.OAUTH2_PROXY_CLIENT_SECRET = await askSecret('Client secret (not shown):');
  }

  console.log('\nWho may sign in? Give an email domain, a list of addresses, or both.');
  // oauth2-proxy splits the list on commas without trimming, so spaces would break matching.
  env.OAUTH2_PROXY_EMAIL_DOMAINS = (
    await ask('Allowed email domain(s), comma-separated (blank = none):', {
      default: existing.OAUTH2_PROXY_EMAIL_DOMAINS,
      validate: (answer) => (!answer || /^[a-z0-9.-]+(,\s*[a-z0-9.-]+)*$/i.test(answer) ? null : 'Enter domains like example.com.'),
    })
  )
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
  const current = listedEmails(readIfExists(OAUTH2_EMAILS_FILE));
  const emails = await ask('Allowed email addresses, comma-separated (blank = none):', {
    default: current.join(', '),
    validate: (answer) => {
      if (!answer && !env.OAUTH2_PROXY_EMAIL_DOMAINS) return 'Allow at least one domain or address, or nobody can sign in.';
      const bad = answer.split(',').map((e) => e.trim()).filter((e) => e && !/^[^\s@]+@[^\s@]+$/.test(e));
      return bad.length ? `Not an email address: ${bad.join(', ')}` : null;
    },
  });
  const list = emails.split(',').map((e) => e.trim()).filter(Boolean);
  // oauth2-proxy runs as an unprivileged user, so on Linux it can only read a world-readable
  // bind-mounted file; the list holds no secrets.
  writeWithMode(
    OAUTH2_EMAILS_FILE,
    `# One email per line; these people may sign in. Run \`docker compose restart oauth2-proxy\` after editing.\n${list.join('\n')}\n`,
    0o644,
  );
  ok(`Wrote ${OAUTH2_EMAILS_FILE}.`);
}

// The Authelia version pinned in compose.yaml, so the hash matches the one that will check it.
const autheliaImage = () => composeImages(readIfExists('compose.yaml')).authelia;

async function setUpAuthelia() {
  if (existsSync(path(AUTHELIA_USERS_FILE))) {
    ok(`${AUTHELIA_USERS_FILE} already exists; people sign in with the emails listed there (see its top comment to add more).`);
    return;
  }
  const email = (
    await ask('Your email (you sign in with it):', {
      validate: (answer) => (/^[^\s@]+@[^\s@]+$/.test(answer) ? null : 'Enter an email address.'),
    })
  ).toLowerCase();
  info(`Generating a password with ${autheliaImage()} (Docker must be running)…`);
  const { stdout } = await run(
    'docker',
    ['run', '--rm', autheliaImage(), 'authelia', 'crypto', 'hash', 'generate', 'argon2', '--random', '--random.length', '20'],
    { capture: true },
  );
  const password = /Random Password:\s*(\S+)/.exec(stdout)?.[1];
  const hash = /Digest:\s*(\S+)/.exec(stdout)?.[1];
  if (!password || !hash) throw new Error("Couldn't read the password and hash from Authelia's hash command; its output format may have changed.");
  writePrivate(AUTHELIA_USERS_FILE, autheliaUsersYaml({ email, hash }));
  ok(`Wrote ${AUTHELIA_USERS_FILE}.`);
  console.log(`\n  Sign in at https://${env.SHORT_DOMAIN}/admin with`);
  console.log(`    email:    ${bold(email)}`);
  console.log(`    password: ${bold(password)}`);
  console.log(dim('  The password is shown only once. Store it in your password manager.\n'));
}

async function setUpAccess() {
  console.log(`\n  ${bold('[You]')} In the Cloudflare dashboard (see docs/deploy/docker.md, "Sign-in with Cloudflare Access"):`);
  console.log('  - Zero Trust: create a Cloudflared tunnel and copy its token.');
  console.log(`  - Access → Applications: protect ${env.SHORT_DOMAIN}/admin and ${env.SHORT_DOMAIN}/api, and copy the AUD tag.\n`);
  env.ACCESS_TEAM_DOMAIN = normalizeTeamDomain(
    await ask('Access team domain, e.g. acme.cloudflareaccess.com:', {
      default: existing.ACCESS_TEAM_DOMAIN,
      validate: (answer) => (normalizeTeamDomain(answer) ? null : 'Enter your team domain.'),
    }),
  );
  env.ACCESS_AUD = await ask('Application Audience (AUD) tag:', {
    default: existing.ACCESS_AUD,
    validate: (answer) => (isValidAud(answer) ? null : 'Paste the AUD tag from the Access application (Basic information).'),
  });
  if (!existing.TUNNEL_TOKEN || !(await confirm('Keep the tunnel token already in .env?', true))) {
    env.TUNNEL_TOKEN = await askSecret('Tunnel token (not shown):');
  }
  env.GEO_SOURCE = 'cloudflare';
  info('Visitor locations come from Cloudflare. Turn on "Add visitor location headers" under Rules → Managed Transforms for city and region.');
}
