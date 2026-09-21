import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createFakeServices } from './fakes/services';

const app = createApp();

async function setup(config?: { rootRedirectUrl: string | null }) {
  const services = createFakeServices(
    config ? { config: { shortDomain: 'go.example.com', accessConfigured: true, ...config } } : {},
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
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
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

describe('visit logging', () => {
  const browser = { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/128.0 Safari/537.36' };

  it('records one visit per GET, after responding', async () => {
    const { request, services } = await setup();
    await request('/docs', { headers: { ...browser, Referer: 'https://www.twitter.com/x' } });
    await services.settle();
    expect(services.visits.visits).toHaveLength(1);
    expect(services.visits.visits[0]).toMatchObject({ slug: 'docs', referrerHost: 'twitter.com', isBot: false });
    expect(services.links.links.get('docs')?.visitCount).toBe(1);
  });

  it('does not record HEAD requests', async () => {
    const { request, services } = await setup();
    await request('/docs', { method: 'HEAD', headers: browser });
    await services.settle();
    expect(services.visits.visits).toHaveLength(0);
  });

  it('does not record unknown slugs', async () => {
    const { request, services } = await setup();
    await request('/nope', { headers: browser });
    await services.settle();
    expect(services.visits.visits).toHaveLength(0);
  });

  it('flags bots without bumping the visit count', async () => {
    const { request, services } = await setup();
    await request('/docs', { headers: { 'User-Agent': 'Slackbot-LinkExpanding 1.0' } });
    await services.settle();
    expect(services.visits.visits[0]?.isBot).toBe(true);
    expect(services.links.links.get('docs')?.visitCount).toBe(0);
  });

  it('still redirects when recording fails', async () => {
    const { request, services } = await setup();
    services.visits.record = async () => {
      throw new Error('D1 is down');
    };
    const res = await request('/docs', { headers: browser });
    expect(res.status).toBe(302);
    await services.settle();
  });

  it('still redirects when geo lookup fails', async () => {
    const services = createFakeServices({
      geo: {
        lookup: async () => {
          throw new Error('no geo');
        },
      },
    });
    await services.links.create({ slug: 'docs', url: 'https://example.com/', title: null, by: 'a@b.c' });
    const res = await app.request('https://go.example.com/docs', { headers: browser }, { services });
    expect(res.status).toBe(302);
    await services.settle();
    expect(services.visits.visits).toHaveLength(0);
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
