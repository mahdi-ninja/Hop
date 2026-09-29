export type NodeAuth = { mode: 'proxy'; secret: string } | { mode: 'access'; teamDomain: string; audience: string };

export interface NodeConfig {
  shortDomain: string;
  rootRedirectUrl: string | null;
  auth: NodeAuth;
  geoSource: 'cloudflare' | 'none';
  databasePath: string;
  port: number;
}

export const MIN_PROXY_SECRET_LENGTH = 32;

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const isPlaceholder = (value: string) => value.includes('your-');

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates the whole environment up front and reports every problem at once, so a Docker
 * deployment fails at startup with one readable message instead of misbehaving later.
 */
export function readNodeConfig(env: Record<string, string | undefined>): NodeConfig {
  const problems: string[] = [];
  const value = (name: string) => env[name]?.trim() ?? '';

  const shortDomain = value('SHORT_DOMAIN').toLowerCase();
  if (!DOMAIN_PATTERN.test(shortDomain)) {
    problems.push('SHORT_DOMAIN must be a bare hostname such as go.example.com (no scheme, port or path).');
  }

  const rootRedirectUrl = value('ROOT_REDIRECT_URL') || null;
  if (rootRedirectUrl && !isHttpUrl(rootRedirectUrl)) problems.push('ROOT_REDIRECT_URL must be an http(s) URL.');

  let auth: NodeAuth | null = null;
  const mode = value('AUTH_MODE');
  if (mode === 'proxy') {
    const secret = value('PROXY_SECRET');
    if (secret.length < MIN_PROXY_SECRET_LENGTH) {
      problems.push(`PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters (npm run setup:docker generates one).`);
    }
    auth = { mode, secret };
  } else if (mode === 'access') {
    const teamDomain = value('ACCESS_TEAM_DOMAIN').replace(/\/+$/, '');
    const audience = value('ACCESS_AUD');
    if (!teamDomain.startsWith('https://') || isPlaceholder(teamDomain)) {
      problems.push('ACCESS_TEAM_DOMAIN must be your Access team domain, e.g. https://your-team.cloudflareaccess.com.');
    }
    if (!audience || isPlaceholder(audience)) problems.push('ACCESS_AUD must be the Access application AUD tag.');
    auth = { mode, teamDomain, audience };
  } else {
    problems.push('AUTH_MODE must be "proxy" (oauth2-proxy or Authelia) or "access" (Cloudflare Access).');
  }

  const geoSource = value('GEO_SOURCE') || 'none';
  if (geoSource !== 'cloudflare' && geoSource !== 'none') problems.push('GEO_SOURCE must be "cloudflare" or "none".');

  const port = Number(value('PORT') || '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be a port number.');

  if (problems.length > 0 || !auth) {
    throw new Error(`Hop can't start:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return {
    shortDomain,
    rootRedirectUrl,
    auth,
    geoSource: geoSource as NodeConfig['geoSource'],
    databasePath: value('DATABASE_PATH') || '/data/hop.db',
    port,
  };
}
