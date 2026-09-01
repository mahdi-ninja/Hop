import { Hono } from 'hono';
import type { AppEnv } from './core/services';
import { notFoundPage, redirectRoutes } from './routes/redirect';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // The entry point passes Services as the Hono "env"; everything downstream reads it from the context.
  app.use(async (c, next) => {
    c.set('services', c.env.services);
    await next();
  });

  app.get('/health', (c) => c.text('ok'));
  app.route('/', redirectRoutes());
  app.notFound(notFoundPage);

  return app;
}
