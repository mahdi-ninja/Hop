import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { AssetServer } from '../../core/ports';

export function staticAssets(root: string): AssetServer {
  const app = new Hono();
  app.use(serveStatic({ root }));
  return {
    async fetch(req) {
      const res = await app.fetch(req);
      if (!res.ok) return res;
      const out = new Response(res.body, res);
      // Vite puts content-hashed files under assets/, so only those can be cached forever.
      const hashed = new URL(req.url).pathname.includes('/assets/');
      out.headers.set('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      return out;
    },
  };
}
