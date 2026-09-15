import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createFakeServices, type FakeServices } from './fakes/services';

const app = createApp();
let services: FakeServices;

beforeEach(async () => {
  services = createFakeServices({ identity: { identify: async () => ({ email: 'alice@example.com' }) } });
  await services.links.create({ slug: 'route', url: 'https://example.com/default', title: null, by: 'bob@example.com' });
});

const put = (slug: string, body: unknown) =>
  app.request(
    `https://go.example.com/api/links/${slug}/rules`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { services },
  );

const rule = { conditions: [{ field: 'country', op: 'in', values: ['au'] }], destinations: [{ url: 'https://example.com/au' }] };

describe('PUT /api/links/:slug/rules', () => {
  it('saves normalized rules and records the editor', async () => {
    const res = await put('route', { rules: [rule] });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      updatedBy: 'alice@example.com',
      rules: [{ conditions: [{ field: 'country', op: 'in', values: ['AU'] }], destinations: [{ url: 'https://example.com/au', weight: 100 }] }],
    });
    const get = await app.request('https://go.example.com/api/links/route', {}, { services });
    expect(((await get.json()) as { rules: unknown[] }).rules).toHaveLength(1);
  });

  it('clears rules with an empty list', async () => {
    await put('route', { rules: [rule] });
    const res = await put('route', { rules: [] });
    expect(((await res.json()) as { rules: unknown[] }).rules).toEqual([]);
  });

  it('validates the body', async () => {
    expect(await (await put('route', {})).json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    const badUrl = await put('route', { rules: [{ destinations: [{ url: 'ftp://x' }] }] });
    expect(badUrl.status).toBe(400);
    expect(await badUrl.json()).toMatchObject({ error: { code: 'INVALID_URL', message: expect.stringMatching(/^Rule 1/) } });
  });

  it('returns 404 for unknown links', async () => {
    expect((await put('nope', { rules: [] })).status).toBe(404);
  });

  it('lists links with their rules', async () => {
    await put('route', { rules: [rule] });
    const res = await app.request('https://go.example.com/api/links', {}, { services });
    const json = (await res.json()) as { items: { rules: unknown[] }[] };
    expect(json.items[0]?.rules).toHaveLength(1);
  });
});

describe('redirects with rules', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  async function setRules(rules: unknown[]) {
    const res = await put('route', { rules });
    expect(res.status).toBe(200);
  }

  const visit = (headers: Record<string, string>, query = '') =>
    app.request(`https://go.example.com/route${query}`, { headers }, { services });

  it('routes by device, OS and language, falling back to the default', async () => {
    await setRules([
      { conditions: [{ field: 'os', op: 'in', values: ['iOS'] }], destinations: [{ url: 'https://apps.example/ios' }] },
      { conditions: [{ field: 'language', op: 'in', values: ['fr'] }], destinations: [{ url: 'https://example.com/fr' }] },
    ]);
    expect((await visit({ 'User-Agent': iphone })).headers.get('Location')).toBe('https://apps.example/ios');
    expect((await visit({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0', 'Accept-Language': 'fr-CA,fr;q=0.9' })).headers.get('Location')).toBe(
      'https://example.com/fr',
    );
    expect((await visit({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0' })).headers.get('Location')).toBe(
      'https://example.com/default',
    );
  });

  it('routes by country and continent from geo', async () => {
    services.geo = { lookup: async () => ({ continent: 'EU', country: 'DE', region: null, city: null }) };
    await setRules([
      { conditions: [{ field: 'country', op: 'in', values: ['AU'] }], destinations: [{ url: 'https://example.com/au' }] },
      { conditions: [{ field: 'continent', op: 'in', values: ['EU'] }], destinations: [{ url: 'https://example.com/eu' }] },
    ]);
    expect((await visit({ 'User-Agent': iphone })).headers.get('Location')).toBe('https://example.com/eu');
  });

  it('sends bots to a bot rule', async () => {
    await setRules([{ conditions: [{ field: 'visitor', op: 'in', values: ['bot'] }], destinations: [{ url: 'https://example.com/preview' }] }]);
    expect((await visit({ 'User-Agent': 'Slackbot-LinkExpanding 1.0' })).headers.get('Location')).toBe('https://example.com/preview');
    expect((await visit({ 'User-Agent': iphone })).headers.get('Location')).toBe('https://example.com/default');
  });

  it('merges the incoming query into the chosen destination', async () => {
    await setRules([{ conditions: [], destinations: [{ url: 'https://example.com/all?src=rule' }] }]);
    expect((await visit({ 'User-Agent': iphone }, '?utm=x')).headers.get('Location')).toBe('https://example.com/all?src=rule&utm=x');
  });

  it('skips rules outside their time window', async () => {
    await setRules([{ conditions: [], window: { end: Date.now() - 1000 }, destinations: [{ url: 'https://example.com/expired' }] }]);
    expect((await visit({ 'User-Agent': iphone })).headers.get('Location')).toBe('https://example.com/default');
  });

  it('falls back to the default URL when reading the visitor fails, and still records the visit', async () => {
    await setRules([{ conditions: [], destinations: [{ url: 'https://example.com/all' }] }]);
    let calls = 0;
    services.geo = {
      lookup: async () => {
        if (++calls === 1) throw new Error('geo down');
        return { continent: null, country: null, region: null, city: null };
      },
    };
    const res = await visit({ 'User-Agent': iphone });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/default');
    await services.settle();
    expect(services.visits.visits).toHaveLength(1);
  });

  it('records one visit per routed GET, reusing the visitor', async () => {
    let lookups = 0;
    services.geo = {
      lookup: async () => {
        lookups++;
        return { continent: 'OC', country: 'AU', region: null, city: 'Sydney' };
      },
    };
    await setRules([{ conditions: [{ field: 'country', op: 'in', values: ['AU'] }], destinations: [{ url: 'https://example.com/au' }] }]);
    await visit({ 'User-Agent': iphone });
    await services.settle();
    expect(lookups).toBe(1);
    expect(services.visits.visits[0]).toMatchObject({ slug: 'route', country: 'AU', city: 'Sydney', os: 'iOS' });
  });

  it('does not wait on the visitor before responding for links without rules', async () => {
    services.geo = { lookup: () => new Promise(() => {}) };
    const res = await visit({ 'User-Agent': iphone });
    expect(res.headers.get('Location')).toBe('https://example.com/default');
  });
});
