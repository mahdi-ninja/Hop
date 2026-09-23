// Pure helpers for hop.config.json (the git-ignored per-deployment settings) and for building the
// Wrangler config used by `npm run deploy`. No Node APIs here, so the Workers test pool can import it.

export const HOP_CONFIG_FILE = 'hop.config.json';
export const DEPLOY_CONFIG_DIR = '.wrangler/deploy';
export const DEPLOY_CONFIG_FILE = `${DEPLOY_CONFIG_DIR}/wrangler.production.json`;

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const AUD = /^[0-9a-f]{64}$/;

export function isPlaceholder(value) {
  return (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.includes('your-') ||
    value.includes('example.com') ||
    /(^|\.)localhost(:\d+)?$/.test(value) ||
    value === '00000000-0000-0000-0000-000000000000'
  );
}

/** Strips // and /* *\/ comments and trailing commas outside of strings, then parses. */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export function normalizeHostname(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export function isValidHostname(host) {
  return HOSTNAME.test(host);
}

export function normalizeTeamDomain(input) {
  const host = normalizeHostname(input);
  if (!host) return '';
  return `https://${host.includes('.') ? host : `${host}.cloudflareaccess.com`}`;
}

export function isValidAud(aud) {
  return AUD.test(String(aud ?? '').trim());
}

/** Returns a list of human-readable problems; empty means the config is usable for a deploy. */
export function validateHopConfig(config) {
  const problems = [];
  if (!config || typeof config !== 'object') return ['hop.config.json is not a JSON object.'];
  if (!ACCOUNT_ID.test(config.accountId ?? '')) problems.push('accountId must be a 32-character Cloudflare account ID.');
  if (!isValidHostname(config.shortDomain ?? '') || isPlaceholder(config.shortDomain)) {
    problems.push('shortDomain must be your short-link hostname, e.g. go.yourcompany.com.');
  }
  if (config.rootRedirectUrl) {
    try {
      const url = new URL(config.rootRedirectUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    } catch {
      problems.push('rootRedirectUrl must be an http(s) URL, or empty.');
    }
  }
  if (!config.database || !UUID.test(config.database.id ?? '') || isPlaceholder(config.database.id)) {
    problems.push('database.id must be the UUID of your D1 database.');
  }
  if (!config.database?.name) problems.push('database.name is missing.');
  const team = config.access?.teamDomain ?? '';
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(team) || isPlaceholder(team)) {
    problems.push('access.teamDomain must look like https://<team>.cloudflareaccess.com.');
  }
  if (!isValidAud(config.access?.aud) || isPlaceholder(config.access?.aud)) {
    problems.push('access.aud must be the 64-character Application Audience (AUD) tag.');
  }
  return problems;
}

/**
 * Merges hop.config.json into the committed wrangler.jsonc template. The result is written to
 * DEPLOY_CONFIG_FILE, two directories below the repo root, so relative paths are rebased.
 */
export function buildDeployConfig(template, config) {
  const rebase = (p) => (typeof p === 'string' && !p.startsWith('/') ? `../../${p.replace(/^\.\//, '')}` : p);
  const out = structuredClone(template);
  delete out.$schema;
  delete out.dev;
  out.account_id = config.accountId;
  out.main = rebase(out.main);
  if (out.assets) out.assets = { ...out.assets, directory: rebase(out.assets.directory) };
  out.routes = [{ pattern: config.shortDomain, custom_domain: true }];
  out.d1_databases = (out.d1_databases ?? []).map((db) =>
    db.binding === 'DB'
      ? { ...db, database_name: config.database.name, database_id: config.database.id, migrations_dir: rebase(db.migrations_dir) }
      : db,
  );
  out.vars = {
    ...out.vars,
    SHORT_DOMAIN: config.shortDomain,
    ACCESS_TEAM_DOMAIN: config.access.teamDomain,
    ACCESS_AUD: config.access.aud,
    ROOT_REDIRECT_URL: config.rootRedirectUrl ?? '',
  };
  return out;
}
