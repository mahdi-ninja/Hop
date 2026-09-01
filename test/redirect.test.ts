import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createFakeServices } from './fakes/services';

const app = createApp();

async function setup(config?: { rootRedirectUrl: string | null }) {
  const services = createFakeServices(
    config ? { config: { shortDomain: 'go.example.com', ...config } } : {},
  );
  await services.links.create({ slug: 'docs', url: 'https://example.com/docs?ref=hop', title: null, by: 'a@b.c' });
  const request = (path: string, init?: RequestInit) =>
    app.request(`https://go.example.com${path}`, init, { services });
  return { services, request };
}

describe('GET /:slug', () => {
  it('redirects with 302 and no-store caching', async () => {
    const { request } = await setup();
    const res = await request('/docs');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/docs?ref=hop');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('merges the incoming query string, incoming params winning', async () => {
    const { request } = await setup();
    const res = await request('/docs?ref=tw&utm_medium=social');
    const location = new URL(res.headers.get('Location')!);
    expect(location.searchParams.get('ref')).toBe('tw');
    expect(location.searchParams.get('utm_medium')).toBe('social');
  });

  it('is case-sensitive', async () => {
    const { request } = await setup();
    const res = await request('/DOCS');
    expect(res.status).toBe(404);
  });

  it('serves the HTML 404 page for unknown slugs', async () => {
    const { request } = await setup();
    const res = await request('/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('Link not found');
  });

  it('serves the 404 page for multi-segment and malformed paths', async () => {
    const { request } = await setup();
    for (const path of ['/docs/extra', '/a.b', '/%20']) {
      const res = await request(path);
      expect(res.status, path).toBe(404);
      expect(await res.text()).toContain('Link not found');
    }
  });

  it('redirects HEAD requests too', async () => {
    const { request } = await setup();
    const res = await request('/docs', { method: 'HEAD' });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/docs?ref=hop');
  });
});

describe('GET /', () => {
  it('redirects to /admin by default', async () => {
    const { request } = await setup();
    const res = await request('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('redirects to ROOT_REDIRECT_URL when set', async () => {
    const { request } = await setup({ rootRedirectUrl: 'https://example.com/' });
    const res = await request('/');
    expect(res.headers.get('Location')).toBe('https://example.com/');
  });
});
