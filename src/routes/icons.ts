import { Hono } from 'hono';
import type { AppEnv } from '../core/services';

// Browsers request these at the site root; the files ship with the dashboard build under /admin.
const ROOT_ICONS = ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'];

export function iconRoutes(): Hono<AppEnv> {
  const icons = new Hono<AppEnv>();
  for (const path of ROOT_ICONS) {
    icons.get(path, async (c) => {
      const res = await c.get('services').assets.fetch(new Request(new URL(`/admin${path}`, c.req.url), c.req.raw));
      if (!res.ok) return res;
      const cached = new Response(res.body, res);
      cached.headers.set('Cache-Control', 'public, max-age=86400');
      return cached;
    });
  }
  return icons;
}
