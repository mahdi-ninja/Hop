import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createFakeServices } from './fakes/services';

const app = createApp();

describe('root icons', () => {
  it('serves favicons from the dashboard build without authentication', async () => {
    const requested: string[] = [];
    const services = createFakeServices({
      assets: {
        fetch: async (req) => {
          requested.push(new URL(req.url).pathname);
          return new Response('icon', { status: 200, headers: { 'Content-Type': 'image/x-icon' } });
        },
      },
    });
    for (const path of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png']) {
      const res = await app.request(`https://go.example.com${path}`, {}, { services });
      expect(res.status, path).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    }
    expect(requested).toEqual(['/admin/favicon.ico', '/admin/favicon.svg', '/admin/apple-touch-icon.png']);
  });

  it('passes through a missing icon without caching it', async () => {
    const services = createFakeServices({ assets: { fetch: async () => new Response('missing', { status: 404 }) } });
    const res = await app.request('https://go.example.com/favicon.ico', {}, { services });
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('shows the mark on the 404 page', async () => {
    const res = await app.request('https://go.example.com/nope', {}, { services: createFakeServices() });
    const html = await res.text();
    expect(html).toContain('<svg');
    expect(html).toContain('href="/favicon.svg"');
  });
});
