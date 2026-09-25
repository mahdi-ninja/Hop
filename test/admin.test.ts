import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AssetServer } from '../src/core/ports';
import { createFakeServices } from './fakes/services';

const app = createApp();

const FILES: Record<string, string> = {
  '/admin/': '<!doctype html><div id="root"></div>',
  '/admin/assets/index.js': 'console.log(1)',
};

const assets: AssetServer = {
  fetch: async (req) => {
    const body = FILES[new URL(req.url).pathname];
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
  },
};

function request(path: string, authed = true, init: RequestInit = {}) {
  const services = createFakeServices({
    assets,
    identity: { identify: async () => (authed ? { email: 'a@example.com' } : null) },
  });
  return app.request(`https://go.example.com${path}`, init, { services });
}

describe('/admin', () => {
  it('requires an identity and returns plain 401', async () => {
    const res = await request('/admin/', false);
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/);
    expect((await request('/admin', false)).status).toBe(401);
    expect((await request('/admin/assets/index.js', false)).status).toBe(401);
  });

  it('serves static assets', async () => {
    const res = await request('/admin/assets/index.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('falls back to the SPA entry for client-side routes', async () => {
    for (const path of ['/admin/links', '/admin/links/abc123']) {
      const res = await request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('X-Frame-Options'), path).toBe('DENY');
      expect(await res.text()).toContain('id="root"');
    }
  });

  it('does not mask missing files with the SPA entry', async () => {
    const res = await request('/admin/assets/missing.js');
    expect(res.status).toBe(404);
  });

  it('rejects non-GET methods', async () => {
    expect((await request('/admin/links', true, { method: 'POST' })).status).toBe(405);
  });
});
