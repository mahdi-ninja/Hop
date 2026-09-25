import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { IdentityProvider } from '../src/core/ports';
import { createFakeServices } from './fakes/services';

const app = createApp();

const tokenIdentity: IdentityProvider = {
  identify: async (req) => (req.headers.get('X-Test-Token') === 'good' ? { email: 'alice@example.com' } : null),
};

function request(path: string, init: RequestInit = {}, base = 'https://go.example.com') {
  const services = createFakeServices({ identity: tokenIdentity });
  return app.request(`${base}${path}`, init, { services });
}

const authed = (headers: Record<string, string> = {}) => ({ 'X-Test-Token': 'good', ...headers });

describe('requireIdentity', () => {
  it('returns 401 JSON without an identity', async () => {
    const res = await request('/api/me');
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });

  it('returns 401 for a bad token', async () => {
    const res = await request('/api/me', { headers: { 'X-Test-Token': 'bad' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown API routes before revealing anything', async () => {
    expect((await request('/api/whatever')).status).toBe(401);
  });

  it('GET /api/me returns the email', async () => {
    const res = await request('/api/me', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'alice@example.com' });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('returns JSON 404 for unknown API routes when authenticated', async () => {
    const res = await request('/api/whatever', { headers: authed() });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('CSRF checks', () => {
  const json = { 'Content-Type': 'application/json' };

  it('rejects a foreign Origin with 403 BAD_ORIGIN', async () => {
    const res = await request('/api/links', {
      method: 'POST',
      headers: authed({ ...json, Origin: 'https://evil.example' }),
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_ORIGIN' } });
  });

  it('rejects a foreign Origin on DELETE', async () => {
    const res = await request('/api/links/x', { method: 'DELETE', headers: authed({ Origin: 'https://evil.example' }) });
    expect(res.status).toBe(403);
  });

  it('rejects localhost origins on the production host', async () => {
    const res = await request('/api/links', {
      method: 'POST',
      headers: authed({ ...json, Origin: 'http://localhost:4697' }),
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('allows localhost origins when the request is to localhost', async () => {
    const res = await request(
      '/api/unknown',
      { method: 'POST', headers: authed({ ...json, Origin: 'http://localhost:4697' }), body: '{}' },
      'http://localhost:4696',
    );
    expect(res.status).toBe(404);
  });

  it('allows another local port when the request is to a *.localhost short domain', async () => {
    const services = createFakeServices({
      identity: tokenIdentity,
      config: { shortDomain: 'go.localhost:4696', rootRedirectUrl: null, accessConfigured: true },
    });
    for (const origin of ['http://go.localhost:4696', 'http://go.localhost:4697']) {
      const res = await app.request(
        'http://go.localhost:4696/api/unknown',
        { method: 'POST', headers: authed({ ...json, Origin: origin }), body: '{}' },
        { services },
      );
      expect(res.status, origin).toBe(404);
    }
  });

  it('allows the short domain origin and requests without Origin', async () => {
    for (const headers of [authed({ ...json, Origin: 'https://go.example.com' }), authed(json)]) {
      const res = await request('/api/unknown', { method: 'POST', headers, body: '{}' });
      expect(res.status).toBe(404);
    }
  });

  it('requires a JSON content type for POST and PATCH', async () => {
    for (const method of ['POST', 'PATCH']) {
      const res = await request('/api/links', {
        method,
        headers: authed({ 'Content-Type': 'text/plain' }),
        body: '{}',
      });
      expect(res.status, method).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    }
  });

  it('accepts JSON content types with parameters', async () => {
    const res = await request('/api/unknown', {
      method: 'POST',
      headers: authed({ 'Content-Type': 'application/json; charset=utf-8' }),
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('does not require a content type for DELETE', async () => {
    const res = await request('/api/unknown', { method: 'DELETE', headers: authed() });
    expect(res.status).toBe(404);
  });
});

describe('unconfigured Access', () => {
  function unconfigured(identity: IdentityProvider = { identify: async () => null }) {
    return createFakeServices({ identity, config: { shortDomain: 'go.example.com', rootRedirectUrl: null, accessConfigured: false } });
  }

  it('explains the problem instead of a bare 401', async () => {
    const api = await app.request('https://go.example.com/api/me', {}, { services: unconfigured() });
    expect(api.status).toBe(503);
    expect(await api.json()).toMatchObject({ error: { code: 'NOT_CONFIGURED', message: expect.stringContaining('npm run setup') } });
    const page = await app.request('https://go.example.com/admin/', {}, { services: unconfigured() });
    expect(page.status).toBe(503);
    expect(await page.text()).toContain('npm run setup');
  });

  it('still lets the local dev bypass through', async () => {
    const res = await app.request('https://go.example.com/api/me', { headers: authed() }, { services: unconfigured(tokenIdentity) });
    expect(res.status).toBe(200);
  });

  it('does not affect public short links', async () => {
    const services = unconfigured();
    await services.links.create({ slug: 'pub', url: 'https://example.com/', title: null, by: 'a' });
    expect((await app.request('https://go.example.com/pub', {}, { services })).status).toBe(302);
  });
});
