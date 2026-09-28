// Minimal Cloudflare API client for the parts of setup Wrangler doesn't cover (Zero Trust Access).

const API = 'https://api.cloudflare.com/client/v4';

export class CloudflareApiError extends Error {
  constructor(status, errors) {
    const detail = errors?.map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ');
    super(`Cloudflare API request failed (${status})${detail ? `: ${detail}` : ''}`);
    this.status = status;
  }
}

export function createApi(token) {
  async function call(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new CloudflareApiError(res.status, json.errors);
    return json.result;
  }

  return {
    verifyToken: () => call('GET', '/user/tokens/verify'),

    /** Returns the Zero Trust organization, or null if Zero Trust hasn't been set up yet. */
    async getAccessOrganization(accountId) {
      try {
        return await call('GET', `/accounts/${accountId}/access/organizations`);
      } catch (err) {
        if (err instanceof CloudflareApiError && err.status === 404) return null;
        throw err;
      }
    },

    async listAccessApps(accountId) {
      const apps = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await call('GET', `/accounts/${accountId}/access/apps?page=${page}&per_page=50`);
        apps.push(...batch);
        if (batch.length < 50) break;
      }
      return apps;
    },

    /** The account's `<subdomain>.workers.dev` name, or null if it hasn't registered one yet. */
    async getWorkersSubdomain(accountId) {
      try {
        const result = await call('GET', `/accounts/${accountId}/workers/subdomain`);
        return result?.subdomain || null;
      } catch (err) {
        if (err instanceof CloudflareApiError && err.status === 404) return null;
        throw err;
      }
    },

    listIdentityProviders: (accountId) => call('GET', `/accounts/${accountId}/access/identity_providers`),

    createAccessApp: (accountId, app) => call('POST', `/accounts/${accountId}/access/apps`, app),
    updateAccessApp: (accountId, appId, app) => call('PUT', `/accounts/${accountId}/access/apps/${appId}`, app),
  };
}

/**
 * New Zero Trust organizations start with only Cloudflare's own identity provider, which lets in
 * members of the Cloudflare account and nobody else. Any other provider (One-time PIN, Google,
 * GitHub, …) means teammates without a Cloudflare login can sign in.
 */
export function teamCanSignIn(identityProviders) {
  return identityProviders.some((idp) => !/cloudflare/i.test(String(idp.type ?? '')));
}

export function protectedPaths(shortDomain) {
  return [`${shortDomain}/admin`, `${shortDomain}/api`];
}

/** Finds an existing Access app that already protects Hop's dashboard path on this domain. */
export function findHopApp(apps, shortDomain) {
  const target = `${shortDomain}/admin`;
  return (
    apps.find((app) => {
      const uris = [app.domain, ...(app.self_hosted_domains ?? []), ...(app.destinations ?? []).map((d) => d.uri)];
      return uris.some((uri) => typeof uri === 'string' && uri.replace(/\/\*?$/, '') === target);
    }) ?? null
  );
}

/** Access include rules for "who may sign in": email domains and/or individual addresses. */
export function includeRules(entries) {
  return entries.map((entry) =>
    entry.startsWith('@') || !entry.includes('@')
      ? { email_domain: { domain: entry.replace(/^@/, '') } }
      : { email: { email: entry } },
  );
}

export function accessAppBody({ shortDomain, allowed, sessionDuration }) {
  const [adminPath, apiPath] = protectedPaths(shortDomain);
  return {
    name: `Hop (${shortDomain})`,
    type: 'self_hosted',
    domain: adminPath,
    destinations: [
      { type: 'public', uri: adminPath },
      { type: 'public', uri: apiPath },
    ],
    session_duration: sessionDuration,
    app_launcher_visible: false,
    // A Lax, HttpOnly sign-in cookie isn't sent inside another site's frames or readable by scripts.
    same_site_cookie_attribute: 'lax',
    http_only_cookie_attribute: true,
    policies: [{ name: 'Hop team', decision: 'allow', include: includeRules(allowed) }],
  };
}
