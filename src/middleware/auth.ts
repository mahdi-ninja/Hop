import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../core/services';
import { apiError } from '../lib/errors';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function isAllowedOrigin(origin: string, requestUrl: string, shortDomain: string): boolean {
  if (origin === `https://${shortDomain}`) return true;
  // Local dev: the dashboard may be served from another localhost port (Vite), but only
  // when the request itself is addressed to localhost, which never happens in production.
  if (!LOCAL_HOSTNAMES.has(new URL(requestUrl).hostname)) return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isJson(contentType: string | undefined): boolean {
  return contentType?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

export function requireIdentity(kind: 'api' | 'page'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const services = c.get('services');
    const identity = await services.identity.identify(c.req.raw);
    if (!identity && !services.config.accessConfigured) {
      const message = "Cloudflare Access isn't configured for this deployment yet. Run `npm run setup`, then deploy again.";
      return kind === 'api' ? apiError(c, 'NOT_CONFIGURED', message) : c.text(message, 503);
    }
    if (!identity) {
      return kind === 'api' ? apiError(c, 'UNAUTHORIZED', 'Authentication required.') : c.text('Unauthorized', 401);
    }
    c.set('userEmail', identity.email);

    // The Access cookie is sent automatically by browsers, so mutating API calls need CSRF checks.
    if (kind === 'api' && MUTATING_METHODS.has(c.req.method)) {
      const origin = c.req.header('Origin');
      if (origin !== undefined && !isAllowedOrigin(origin, c.req.url, services.config.shortDomain)) {
        return apiError(c, 'BAD_ORIGIN', 'Cross-origin requests are not allowed.');
      }
      if (c.req.method !== 'DELETE' && !isJson(c.req.header('Content-Type'))) {
        return apiError(c, 'INVALID_INPUT', 'Content-Type must be application/json.');
      }
    }

    await next();
  };
}
