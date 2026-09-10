import { Hono, type Context } from 'hono';
import type { AppEnv } from '../core/services';
import { isValidSlugFormat } from '../lib/slug';
import { mergeQuery } from '../lib/url';
import { recordVisit } from '../lib/visit';
import { NOT_FOUND_HTML } from '../pages/notFound';

// no-store so a slug that 404s now redirects as soon as someone creates it.
export function notFoundPage(c: Context<AppEnv>): Response {
  return c.html(NOT_FOUND_HTML, 404, { 'Cache-Control': 'private, no-store' });
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  });
}

export function redirectRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', (c) => redirectTo(c.get('services').config.rootRedirectUrl ?? '/admin'));

  // Hono serves HEAD through GET handlers; c.req.method still reports HEAD.
  routes.get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlugFormat(slug)) return notFoundPage(c);

    const services = c.get('services');
    const link = await services.links.getBySlug(slug);
    if (!link) return notFoundPage(c);

    if (c.req.method === 'GET') services.defer(recordVisit(c.req.raw, slug, services));

    return redirectTo(mergeQuery(link.url, new URL(c.req.url).searchParams));
  });

  return routes;
}
