// The Docker preset's settings live in .env (read by compose.yaml). This module holds the parts of
// `npm run setup:docker` and `npm run doctor -- --docker` that don't prompt or touch the network.
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isPlaceholder, isValidAud, isValidHostname, isWorkersDevHost, normalizeTeamDomain } from './hop-config.mjs';

export const ENV_FILE = '.env';
export const AUTHELIA_USERS_FILE = 'docker/authelia/users.yml';
export const OAUTH2_EMAILS_FILE = 'docker/oauth2-proxy/emails.txt';

export const AUTH_PROVIDERS = ['oauth2-proxy', 'authelia', 'access'];
export const OAUTH2_PROVIDERS = ['google', 'github', 'entra-id', 'oidc'];
export const MIN_PROXY_SECRET_LENGTH = 32;

export const authModeFor = (provider) => (provider === 'access' ? 'access' : 'proxy');

/**
 * Reads a preset file, or undefined when it's missing. A path that exists but isn't a file (Docker
 * creates a directory when a bind-mounted file is missing) is reported as such, not read.
 */
export function readPresetFile(root, file) {
  const path = join(root, file);
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return undefined;
  }
  if (!stats.isFile()) {
    throw new Error(`${file} is a directory, probably created by Docker before setup ran. Delete it and run \`npm run setup:docker\` again.`);
  }
  return readFileSync(path, 'utf8');
}

/** Image references per service, read from compose.yaml so the pins live in one place. */
export function composeImages(composeText) {
  const images = {};
  let service = null;
  for (const line of String(composeText).split('\n')) {
    const name = /^ {2}([a-z0-9][a-z0-9-]*):\s*$/.exec(line);
    if (name) service = name[1];
    else if (/^\S/.test(line)) service = null;
    const image = /^ {4}image:\s*(\S+)\s*$/.exec(line);
    if (service && image) images[service] = image[1];
  }
  return images;
}

// base64url never contains `$`, which Compose would otherwise try to interpolate in .env.
export const newSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');

// oauth2-proxy needs a cookie secret of exactly 16, 24 or 32 bytes.
export const newCookieSecret = () => randomBytes(16).toString('hex');

export function parseEnv(text) {
  const values = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^'.*'$/.test(value) || /^".*"$/.test(value)) value = value.slice(1, -1);
    values[line.slice(0, eq).trim()] = value;
  }
  return values;
}

const SAFE_VALUE = /^[A-Za-z0-9_./:@,+=-]*$/;

export const needsQuoting = (value) => !SAFE_VALUE.test(String(value ?? ''));

export function envLine(key, value) {
  const text = String(value ?? '');
  if (!needsQuoting(text)) return `${key}=${text}`;
  // Single quotes keep Compose from interpolating `$`; they can't themselves be escaped.
  if (text.includes("'")) throw new Error(`${key} contains a single quote ('), which .env files can't hold. Use a value without it.`);
  return `${key}='${text}'`;
}

const SECTIONS = [
  { title: 'Hop', keys: ['SHORT_DOMAIN', 'ROOT_REDIRECT_URL', 'GEO_SOURCE'] },
  { title: 'Sign-in (AUTH_PROVIDER picks the Compose profile)', keys: ['AUTH_PROVIDER', 'COMPOSE_PROFILES', 'AUTH_MODE', 'PROXY_SECRET'] },
  {
    title: 'oauth2-proxy',
    keys: [
      'OAUTH2_PROXY_PROVIDER',
      'OAUTH2_PROXY_OIDC_ISSUER_URL',
      'OAUTH2_PROXY_CLIENT_ID',
      'OAUTH2_PROXY_CLIENT_SECRET',
      'OAUTH2_PROXY_COOKIE_SECRET',
      'OAUTH2_PROXY_EMAIL_DOMAINS',
    ],
  },
  {
    title: 'Authelia',
    keys: ['AUTHELIA_SESSION_SECRET', 'AUTHELIA_STORAGE_ENCRYPTION_KEY', 'AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET'],
  },
  { title: 'Cloudflare Access through a Cloudflare Tunnel', keys: ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'TUNNEL_TOKEN'] },
];

export function serializeEnv(values) {
  const known = new Set(SECTIONS.flatMap((s) => s.keys));
  const lines = ['# Written by `npm run setup:docker`. Keep this file private: it holds secrets.'];
  for (const section of SECTIONS) {
    const present = section.keys.filter((key) => values[key] !== undefined && values[key] !== '');
    if (present.length === 0) continue;
    lines.push('', `# ${section.title}`, ...present.map((key) => envLine(key, values[key])));
  }
  const extra = Object.keys(values).filter((key) => !known.has(key) && values[key] !== '');
  if (extra.length) lines.push('', '# Other', ...extra.map((key) => envLine(key, values[key])));
  return `${lines.join('\n')}\n`;
}

/** Fills in generated secrets that don't exist yet; secrets already in .env are never replaced. */
export function withSecrets(values) {
  const out = { ...values };
  const provider = out.AUTH_PROVIDER;
  if (authModeFor(provider) === 'proxy') out.PROXY_SECRET ||= newSecret();
  if (provider === 'oauth2-proxy') out.OAUTH2_PROXY_COOKIE_SECRET ||= newCookieSecret();
  if (provider === 'authelia') {
    out.AUTHELIA_SESSION_SECRET ||= newSecret(48);
    out.AUTHELIA_STORAGE_ENCRYPTION_KEY ||= newSecret(48);
    out.AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET ||= newSecret(48);
  }
  out.COMPOSE_PROFILES = provider;
  out.AUTH_MODE = authModeFor(provider);
  return out;
}

export function autheliaUserKeys(usersYaml) {
  return [...String(usersYaml ?? '').matchAll(/^ {2}'?([^'\s:#][^':]*?)'?:\s*$/gm)].map((m) => m[1]);
}

export function listedEmails(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

// Each user's key is their email, so people sign in with the email and nothing else: Authelia
// has no switch to turn username sign-in off.
export function autheliaUsersYaml({ email, hash }) {
  const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;
  const address = quote(String(email).trim().toLowerCase());
  return `# Authelia users for Hop. People sign in with their email, so each key is the email address,
# in lower case (Authelia won't start otherwise). To add someone, copy an entry, hash their
# password with the command below, then run \`docker compose restart authelia\`:
#   docker compose run --rm authelia authelia crypto hash generate argon2
users:
  ${address}:
    disabled: false
    displayname: ${address}
    email: ${address}
    password: ${quote(hash)}
`;
}

/** Problems that stop the Docker preset from working, as sentences; empty when ready. */
export function validateDockerEnv(env, files = {}) {
  const problems = [];
  const value = (key) => String(env[key] ?? '').trim();
  const required = (key, why) => {
    if (!value(key)) problems.push(`${key} is missing${why ? ` (${why})` : ''}.`);
  };

  const domain = value('SHORT_DOMAIN');
  if (!isValidHostname(domain)) problems.push('SHORT_DOMAIN must be a bare hostname such as go.example.com.');
  else if (isWorkersDevHost(domain)) problems.push('SHORT_DOMAIN is a workers.dev address, which only works on Cloudflare Workers.');

  const provider = value('AUTH_PROVIDER');
  if (!AUTH_PROVIDERS.includes(provider)) {
    problems.push(`AUTH_PROVIDER must be one of ${AUTH_PROVIDERS.join(', ')}.`);
    return problems;
  }
  if (value('COMPOSE_PROFILES') !== provider) problems.push(`COMPOSE_PROFILES must be ${provider}, matching AUTH_PROVIDER.`);
  if (value('AUTH_MODE') !== authModeFor(provider)) problems.push(`AUTH_MODE must be ${authModeFor(provider)} for ${provider}.`);
  if (!['', 'none', 'cloudflare'].includes(value('GEO_SOURCE'))) problems.push('GEO_SOURCE must be none or cloudflare.');

  if (authModeFor(provider) === 'proxy' && value('PROXY_SECRET').length < MIN_PROXY_SECRET_LENGTH) {
    problems.push(`PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters.`);
  }

  if (provider === 'oauth2-proxy') {
    const oauthProvider = value('OAUTH2_PROXY_PROVIDER') || 'google';
    if (!OAUTH2_PROVIDERS.includes(oauthProvider)) problems.push(`OAUTH2_PROXY_PROVIDER must be one of ${OAUTH2_PROVIDERS.join(', ')}.`);
    if (['entra-id', 'oidc'].includes(oauthProvider)) required('OAUTH2_PROXY_OIDC_ISSUER_URL', `needed for ${oauthProvider}`);
    required('OAUTH2_PROXY_CLIENT_ID', 'from your OAuth app');
    required('OAUTH2_PROXY_CLIENT_SECRET', 'from your OAuth app');
    required('OAUTH2_PROXY_COOKIE_SECRET');
    if (files.emails === undefined) problems.push(`${OAUTH2_EMAILS_FILE} is missing (it may be empty, but must exist).`);
    if (!value('OAUTH2_PROXY_EMAIL_DOMAINS') && listedEmails(files.emails).length === 0) {
      problems.push(`Nobody can sign in: set OAUTH2_PROXY_EMAIL_DOMAINS or list emails in ${OAUTH2_EMAILS_FILE}.`);
    }
  }

  if (provider === 'authelia') {
    required('AUTHELIA_SESSION_SECRET');
    required('AUTHELIA_STORAGE_ENCRYPTION_KEY');
    required('AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET');
    if (files.autheliaUsers === undefined) problems.push(`${AUTHELIA_USERS_FILE} is missing; run npm run setup:docker to create the first user.`);
    // configuration.yml turns on case-insensitive sign-in, and Authelia then refuses to start
    // unless every username in the file is lower case.
    const upper = autheliaUserKeys(files.autheliaUsers).filter((key) => key !== key.toLowerCase());
    if (upper.length) problems.push(`${AUTHELIA_USERS_FILE}: write these users' emails in lower case, or Authelia won't start: ${upper.join(', ')}.`);
  }

  if (provider === 'access') {
    const teamDomain = normalizeTeamDomain(value('ACCESS_TEAM_DOMAIN'));
    if (!teamDomain || isPlaceholder(teamDomain) || teamDomain !== value('ACCESS_TEAM_DOMAIN').replace(/\/+$/, '')) {
      problems.push('ACCESS_TEAM_DOMAIN must be your Access team domain as a URL, e.g. https://acme.cloudflareaccess.com.');
    }
    if (!isValidAud(value('ACCESS_AUD'))) problems.push('ACCESS_AUD must be the Access application AUD tag.');
    required('TUNNEL_TOKEN', 'from the Cloudflare Tunnel you created');
  }

  return problems;
}
