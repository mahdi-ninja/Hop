import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { createFakeServices, type FakeServices } from './fakes/services';

const app = createApp();
const NOW = Date.UTC(2026, 8, 28, 12);
let services: FakeServices;

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  services = createFakeServices({ identity: { identify: async () => ({ email: 'a@example.com' }) } });
  await services.links.create({ slug: 'alpha', url: 'https://example.com/', title: 'Alpha', by: 'a' });
  const base = { region: null, city: null, referrerHost: null, device: 'mobile', browser: 'Chrome', os: 'Android' } as const;
  await services.visits.record({ ...base, slug: 'alpha', ts: NOW - 1000, country: 'AU', isBot: false });
  await services.visits.record({ ...base, slug: 'alpha', ts: NOW - 10 * 86_400_000, country: 'US', isBot: false });
  await services.visits.record({ ...base, slug: 'alpha', ts: NOW - 2000, country: 'US', isBot: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const get = (path: string) => app.request(`https://go.example.com/api${path}`, {}, { services });

describe('GET /api/links/:slug/stats', () => {
  it('defaults to 30d without bots', async () => {
    const res = await get('/links/alpha/stats');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { range: { from: number; to: number }; total: number };
    expect(json.range).toEqual({ from: Date.UTC(2026, 7, 30), to: NOW });
    expect(json.total).toBe(2);
  });

  it('respects range and bots', async () => {
    const week = (await (await get('/links/alpha/stats?range=7d')).json()) as { total: number };
    expect(week.total).toBe(1);
    const withBots = (await (await get('/links/alpha/stats?range=7d&bots=1')).json()) as { total: number };
    expect(withBots.total).toBe(2);
  });

  it('starts "all" at the link creation time', async () => {
    const json = (await (await get('/links/alpha/stats?range=all')).json()) as { range: { from: number } };
    expect(json.range.from).toBe(services.links.links.get('alpha')?.createdAt);
  });

  it('validates params and 404s unknown links', async () => {
    expect((await get('/links/alpha/stats?range=1y')).status).toBe(400);
    expect((await get('/links/alpha/stats?bots=yes')).status).toBe(400);
    const missing = await get('/links/nope/stats');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /api/links/:slug/visits', () => {
  it('returns recent visits, respecting bots and limit', async () => {
    const res = await get('/links/alpha/visits');
    const json = (await res.json()) as { items: { country: string; isBot: boolean }[] };
    expect(json.items.map((i) => i.country)).toEqual(['AU', 'US']);
    const withBots = (await (await get('/links/alpha/visits?bots=1&limit=2')).json()) as { items: unknown[] };
    expect(withBots.items).toHaveLength(2);
    expect((await get('/links/alpha/visits?limit=-1')).status).toBe(400);
    expect((await get('/links/nope/visits')).status).toBe(404);
  });
});

describe('GET /api/stats/overview', () => {
  it('returns the overview for the range', async () => {
    const res = await get('/stats/overview?range=7d');
    expect(await res.json()).toEqual({
      range: { from: Date.UTC(2026, 8, 22), to: NOW },
      totalLinks: 1,
      totalVisits: 1,
      perDay: [{ day: '2026-09-28', visits: 1 }],
      topLinks: [{ slug: 'alpha', shortUrl: 'https://go.example.com/alpha', title: 'Alpha', visits: 1 }],
    });
  });

  it('uses from=0 for all time and validates params', async () => {
    const json = (await (await get('/stats/overview?range=all&bots=1')).json()) as {
      range: { from: number };
      totalVisits: number;
    };
    expect(json.range.from).toBe(0);
    expect(json.totalVisits).toBe(3);
    expect((await get('/stats/overview?range=bogus')).status).toBe(400);
  });

  it('requires authentication', async () => {
    const anon = createFakeServices();
    const res = await app.request('https://go.example.com/api/stats/overview', {}, { services: anon });
    expect(res.status).toBe(401);
  });
});
