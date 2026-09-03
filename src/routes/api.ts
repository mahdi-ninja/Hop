import { Hono } from 'hono';
import type { AppEnv } from '../core/services';
import { apiError } from '../lib/errors';
import { requireIdentity } from '../middleware/auth';

export function apiRoutes(): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.use(requireIdentity('api'));

  api.get('/me', (c) => c.json({ email: c.get('userEmail') }));

  api.all('*', (c) => apiError(c, 'NOT_FOUND', 'Not found.'));

  return api;
}
