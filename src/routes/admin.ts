import { Hono } from 'hono';
import type { AppEnv } from '../core/services';
import { requireIdentity } from '../middleware/auth';

// Requested as the directory rather than /admin/index.html, because the asset server
// redirects explicit index.html requests to the directory URL.
const SPA_ENTRY = '/admin/';

export function adminRoutes(): Hono<AppEnv> {
  const admin = new Hono<AppEnv>();

  admin.use(requireIdentity('page'));

  admin.get('*', async (c) => {
    const { assets } = c.get('services');
    const res = await assets.fetch(c.req.raw);
    if (res.status !== 404) return res;

    // Paths with a file extension are real asset misses, not client-side routes.
    if (/\.[a-z0-9]+$/i.test(new URL(c.req.url).pathname)) return res;
    return assets.fetch(new Request(new URL(SPA_ENTRY, c.req.url), c.req.raw));
  });

  admin.all('*', (c) => c.text('Method not allowed', 405));

  return admin;
}
