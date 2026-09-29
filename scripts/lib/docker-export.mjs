// `npm run setup:docker -- --export`: turns the Docker preset into a stack that needs nothing from
// the repo on the target host (Portainer, another server): the published image instead of
// `build: .`, the Caddy/Authelia/oauth2-proxy files inlined as Compose configs instead of bind
// mounts, only the chosen sign-in option's services, and no profiles.
import { authModeFor, envLine, needsQuoting } from './docker-config.mjs';

export const DEFAULT_IMAGE = 'ghcr.io/mahdi-ninja/hop:latest';
export const EXPORT_DIR = 'hop-stack';

// Compose interpolates `$` inside config content too; `$$` is a literal dollar.
const escapeDollars = (text) => text.replace(/\$/g, '$$$$');

const indent = (text, spaces) =>
  text
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => (line ? `${' '.repeat(spaces)}${line}` : ''))
    .join('\n');

function inlineImport(caddyfile, name, snippet) {
  const line = new RegExp(`^(\\s*)import ${name.replace(/[{}$]/g, '\\$&')}\\s*$`, 'm');
  if (!line.test(caddyfile)) throw new Error(`The Caddyfile has no "import ${name}" line.`);
  return caddyfile.replace(line, (_, lead) => indent(snippet.replace(/^#.*\n/gm, ''), 0).replace(/^(?=.)/gm, lead));
}

/**
 * The Caddyfile with the chosen auth and geo snippets inlined and the domain filled in. The proxy
 * secret stays a `{$PROXY_SECRET}` placeholder that Caddy reads from its environment, so the
 * stack file itself holds no secrets.
 */
export function renderCaddyfile({ caddyfile, authSnippet, geoSnippet, shortDomain }) {
  let out = inlineImport(caddyfile, 'geo-{$GEO_SOURCE}.caddy', geoSnippet);
  out = inlineImport(out, 'auth-{$AUTH_PROVIDER}.caddy', authSnippet);
  return out.replaceAll('{$SHORT_DOMAIN}', shortDomain);
}

export function renderAutheliaConfig(config, shortDomain) {
  return config.replaceAll('{{ env "SHORT_DOMAIN" }}', shortDomain);
}

function autheliaEmails(usersYaml) {
  return [...String(usersYaml ?? '').matchAll(/^\s+email:\s*'?([^'\s]+)'?\s*$/gm)].map((m) => m[1]);
}

/**
 * What has to be true outside the stack before it works, for the chosen sign-in option. Printed
 * after exporting and written at the top of the exported compose file, so it travels with it.
 */
export function deploySteps(env, files = {}) {
  const domain = env.SHORT_DOMAIN;
  const behindCloudflare = env.GEO_SOURCE === 'cloudflare';
  const check = `Check: https://${domain}/health answers "ok", and https://${domain}/admin asks you to sign in.`;

  if (env.AUTH_PROVIDER === 'access') {
    return [
      `In Zero Trust, add a public hostname (route) to your tunnel: ${domain}, service HTTP, URL hop:8787. Delete any existing DNS record for ${domain} first; the route creates it.`,
      `Protect ${domain}/admin and ${domain}/api (not the bare domain) with an Access application whose AUD tag is ACCESS_AUD in stack.env.`,
      ...(behindCloudflare
        ? [`For city and region in analytics: ${domain}'s zone → Rules → Managed Transforms → "Add visitor location headers".`]
        : []),
      'Run this tunnel token in one place only: every stack using it becomes a connector and shares the traffic.',
      check,
    ];
  }

  const common = [
    `Point ${domain}'s DNS (A/AAAA) at this host and open ports 80 and 443; Caddy gets the certificate on first start.`,
    ...(behindCloudflare
      ? ["GEO_SOURCE is cloudflare: keep the DNS record proxied (orange cloud) and firewall the host to Cloudflare's IP ranges."]
      : []),
  ];
  if (env.AUTH_PROVIDER === 'oauth2-proxy') {
    return [
      ...common,
      `Your OAuth app's redirect / callback URL must be https://${domain}/oauth2/callback.`,
      'Who may sign in: OAUTH2_PROXY_EMAIL_DOMAINS in stack.env, plus the emails in this stack (re-export to change them).',
      check,
    ];
  }
  const emails = autheliaEmails(files.autheliaUsers);
  return [
    ...common,
    `Sign in at https://${domain}/admin with your email${emails.length ? ` (${emails.join(', ')})` : ''} and Authelia password.`,
    check,
  ];
}

function configBlock(name, content) {
  return `  ${name}:\n    content: |\n${indent(escapeDollars(content), 6)}\n`;
}

function envList(keys) {
  return keys.map((key) => `      ${key}: \${${key}:-}`).join('\n');
}

export function stackEnvKeys(provider) {
  const keys = ['SHORT_DOMAIN', 'ROOT_REDIRECT_URL', 'AUTH_MODE', 'GEO_SOURCE'];
  if (authModeFor(provider) === 'proxy') keys.push('PROXY_SECRET');
  if (provider === 'oauth2-proxy') {
    keys.push(
      'OAUTH2_PROXY_PROVIDER',
      'OAUTH2_PROXY_OIDC_ISSUER_URL',
      'OAUTH2_PROXY_CLIENT_ID',
      'OAUTH2_PROXY_CLIENT_SECRET',
      'OAUTH2_PROXY_COOKIE_SECRET',
      'OAUTH2_PROXY_EMAIL_DOMAINS',
    );
  }
  if (provider === 'authelia') {
    keys.push('AUTHELIA_SESSION_SECRET', 'AUTHELIA_STORAGE_ENCRYPTION_KEY', 'AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET');
  }
  if (provider === 'access') keys.push('ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'TUNNEL_TOKEN');
  return keys;
}

const stackValues = (env) => ({ ...env, AUTH_MODE: authModeFor(env.AUTH_PROVIDER), GEO_SOURCE: env.GEO_SOURCE || 'none' });

export function stackEnv(env) {
  const values = stackValues(env);
  const lines = stackEnvKeys(env.AUTH_PROVIDER).map((key) => envLine(key, values[key]));
  return `# Environment for the exported Hop stack (${env.AUTH_PROVIDER}). Keep it private: it holds secrets.\n${lines.join('\n')}\n`;
}

/** Pasted values (client secret, token) that stack.env must quote; generated ones never need it. */
export function quotedKeys(env) {
  const values = stackValues(env);
  return stackEnvKeys(env.AUTH_PROVIDER).filter((key) => needsQuoting(values[key]));
}

/**
 * The exported compose file. `files` holds the repo's preset files: caddyfile, authSnippet,
 * geoSnippet, autheliaConfig, autheliaUsers, emails (only those the provider needs).
 */
/** `images` holds the proxy images pinned in compose.yaml, keyed by service name. */
export function renderStack({ env, files, images, image = DEFAULT_IMAGE }) {
  const required = { 'oauth2-proxy': ['caddy', 'oauth2-proxy'], authelia: ['caddy', 'authelia'], access: ['cloudflared'] }[env.AUTH_PROVIDER] ?? [];
  const missing = required.filter((service) => !images?.[service]);
  if (missing.length) throw new Error(`compose.yaml has no image for: ${missing.join(', ')}.`);
  const provider = env.AUTH_PROVIDER;
  const domain = env.SHORT_DOMAIN;
  const hopEnv = ['SHORT_DOMAIN', 'ROOT_REDIRECT_URL', 'AUTH_MODE', 'GEO_SOURCE'];
  if (provider === 'access') hopEnv.push('ACCESS_TEAM_DOMAIN', 'ACCESS_AUD');
  else hopEnv.push('PROXY_SECRET');

  const services = [
    `  hop:
    image: ${image}
    restart: unless-stopped
    environment:
${envList(hopEnv)}
    volumes:
      - hop-data:/data
    # No published ports: only ${provider === 'access' ? 'cloudflared' : 'Caddy'} may reach Hop.`,
  ];
  const configs = [];
  const volumes = ['hop-data'];

  if (provider !== 'access') {
    services.push(`  caddy:
    image: ${images.caddy}
    restart: unless-stopped
    depends_on: [hop]
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
${envList(['PROXY_SECRET'])}
    configs:
      - source: caddyfile
        target: /etc/caddy/Caddyfile
    volumes:
      - caddy-data:/data
      - caddy-config:/config`);
    configs.push(
      configBlock(
        'caddyfile',
        renderCaddyfile({ caddyfile: files.caddyfile, authSnippet: files.authSnippet, geoSnippet: files.geoSnippet, shortDomain: domain }),
      ),
    );
    volumes.push('caddy-data', 'caddy-config');
  }

  if (provider === 'oauth2-proxy') {
    services.push(`  oauth2-proxy:
    image: ${images['oauth2-proxy']}
    restart: unless-stopped
    environment:
      OAUTH2_PROXY_HTTP_ADDRESS: 0.0.0.0:4180
      OAUTH2_PROXY_REVERSE_PROXY: "true"
      OAUTH2_PROXY_TRUSTED_PROXY_IPS: 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fd00::/8
      OAUTH2_PROXY_SET_XAUTHREQUEST: "true"
      OAUTH2_PROXY_UPSTREAMS: static://202
      OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true"
      OAUTH2_PROXY_COOKIE_SECURE: "true"
      OAUTH2_PROXY_COOKIE_NAME: _hop_session
      OAUTH2_PROXY_REDIRECT_URL: https://${domain}/oauth2/callback
      OAUTH2_PROXY_AUTHENTICATED_EMAILS_FILE: /etc/oauth2-proxy/emails.txt
${envList([
  'OAUTH2_PROXY_PROVIDER',
  'OAUTH2_PROXY_OIDC_ISSUER_URL',
  'OAUTH2_PROXY_CLIENT_ID',
  'OAUTH2_PROXY_CLIENT_SECRET',
  'OAUTH2_PROXY_COOKIE_SECRET',
  'OAUTH2_PROXY_EMAIL_DOMAINS',
])}
    configs:
      - source: oauth2-proxy-emails
        target: /etc/oauth2-proxy/emails.txt`);
    configs.push(configBlock('oauth2-proxy-emails', files.emails ?? ''));
  }

  if (provider === 'authelia') {
    services.push(`  authelia:
    image: ${images.authelia}
    restart: unless-stopped
    environment:
${envList(['AUTHELIA_SESSION_SECRET', 'AUTHELIA_STORAGE_ENCRYPTION_KEY', 'AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET'])}
    configs:
      - source: authelia-configuration
        target: /config/configuration.yml
      - source: authelia-users
        target: /config/users.yml
    volumes:
      - authelia-data:/data`);
    configs.push(configBlock('authelia-configuration', renderAutheliaConfig(files.autheliaConfig, domain)));
    configs.push(configBlock('authelia-users', files.autheliaUsers));
    volumes.push('authelia-data');
  }

  if (provider === 'access') {
    services.push(`  cloudflared:
    image: ${images.cloudflared}
    restart: unless-stopped
    depends_on: [hop]
    command: tunnel --no-autoupdate run
    environment:
${envList(['TUNNEL_TOKEN'])}`);
  }

  const steps = deploySteps(env, files)
    .map((step, i) => `#   ${i + 1}. ${step}`)
    .join('\n');
  return `# Hop stack exported by \`npm run setup:docker -- --export\` for ${domain} (${provider}).
# Self-contained: deploy it with its env file (Portainer: Stacks → Add stack → Web editor, then
# "Load variables from .env file"; or \`docker compose --env-file stack.env up -d\`).
# To change settings or users, re-run the setup and export again, then update the stack.
#
# Outside this stack, before it works:
${steps}

services:
${services.join('\n\n')}
${configs.length ? `\nconfigs:\n${configs.join('')}` : ''}
volumes:
${volumes.map((v) => `  ${v}:`).join('\n')}
`;
}
