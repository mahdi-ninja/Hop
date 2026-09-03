import { Hono } from 'hono';
import type { AppEnv } from './core/services';
import { apiError } from './lib/errors';
import { apiRoutes } from './routes/api';
import { notFoundPage, redirectRoutes } from './routes/redirect';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // The entry point passes Services as the Hono "env"; everything downstream reads it from the context.
  app.use(async (c, next) => {
    c.set('services', c.env.services);
    await next();
  });

  app.route('/api', apiRoutes());
  app.get('/health', (c) => c.text('ok'));
  app.route('/', redirectRoutes());
  app.notFound(notFoundPage);

  app.onError((err, c) => {
    console.error('Unhandled error', err);
    if (new URL(c.req.url).pathname.startsWith('/api')) return apiError(c, 'INTERNAL', 'Internal error.');
    return c.text('Internal error', 500);
  });

  return app;
}
