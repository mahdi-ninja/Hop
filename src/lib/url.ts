export const MAX_URL_LENGTH = 2048;

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

/** `localhost`, any `*.localhost` name, or a loopback address: never a production host. */
export function isLocalHostname(hostname: string): boolean {
  const host = normalizeHost(hostname).replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1';
}

/** SHORT_DOMAIN may carry a port locally (go.localhost:4696); this is just the hostname. */
function hostnameOf(shortDomain: string): string {
  return new URL(`http://${shortDomain}`).hostname;
}

/** Local short domains are served over plain HTTP by `wrangler dev`; everything else is HTTPS. */
export function shortOrigin(shortDomain: string): string {
  return `${isLocalHostname(hostnameOf(shortDomain)) ? 'http' : 'https'}://${shortDomain}`;
}

/** Returns the normalized URL string, or null if the target is not allowed. */
export function validateTargetUrl(raw: unknown, shortDomain: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Pointing a link at the shortener itself could create redirect loops.
  if (normalizeHost(url.hostname) === normalizeHost(hostnameOf(shortDomain))) return null;

  const normalized = url.toString();
  return normalized.length > MAX_URL_LENGTH ? null : normalized;
}

/** Incoming params replace target params with the same key; all other target params are kept. */
export function mergeQuery(target: string, incoming: URLSearchParams): string {
  if (incoming.size === 0) return target;

  const url = new URL(target);
  for (const key of new Set(incoming.keys())) {
    url.searchParams.delete(key);
    for (const value of incoming.getAll(key)) url.searchParams.append(key, value);
  }
  return url.toString();
}
