import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1LinkStore } from '../src/adapters/d1/linkStore';
import { D1VisitStore } from '../src/adapters/d1/visitStore';
import type { LinkStore, VisitStore } from '../src/core/ports';
import type { NewVisit } from '../src/core/types';
import { DAY_MS } from '../src/lib/range';
import { FakeLinkStore } from './fakes/linkStore';
import { FakeVisitStore } from './fakes/visitStore';

const DAY1 = Date.UTC(2026, 8, 1);
const DAY2 = DAY1 + DAY_MS;
const DAY3 = DAY2 + DAY_MS;
const RANGE = { from: DAY1, to: DAY3 + DAY_MS };

type VisitFields = Omit<NewVisit, 'slug' | 'ts' | 'region'>;

const human: Omit<VisitFields, 'city'> = {
  country: 'AU',
  referrerHost: null,
  device: 'mobile',
  browser: 'Mobile Safari',
  os: 'iOS',
  isBot: false,
};

function v(slug: string, ts: number, overrides: Partial<VisitFields> = {}): NewVisit {
  return { slug, ts, region: null, city: null, ...human, ...overrides };
}

const VISITS: NewVisit[] = [
  v('alpha', DAY1 + 1000, { city: 'Melbourne' }),
  v('alpha', DAY1 + 2000),
  v('alpha', DAY1 + 3000, { country: 'US', referrerHost: 'twitter.com', device: 'desktop', browser: 'Chrome', os: 'macOS' }),
  v('alpha', DAY3 + 5000, { country: 'US', referrerHost: 'twitter.com', device: 'desktop', browser: 'Chrome', os: 'Windows' }),
  v('alpha', DAY3 + 6000, { country: null, referrerHost: 'news.ycombinator.com', device: 'tablet', browser: null, os: null }),
  v('alpha', DAY2 + 100, { isBot: true, country: 'US', device: 'desktop', browser: null, os: null }),
  v('alpha', DAY1 - 1, { country: 'NZ' }),
  v('alpha', RANGE.to, { country: 'NZ' }),
  v('beta', DAY2 + 10),
  v('beta', DAY2 + 20, { isBot: true }),
];

const implementations: [string, () => { links: LinkStore; visits: VisitStore }][] = [
  ['D1', () => ({ links: new D1LinkStore(env.DB), visits: new D1VisitStore(env.DB) })],
  [
    'fake',
    () => {
      const links = new FakeLinkStore();
      return { links, visits: new FakeVisitStore(links) };
    },
  ],
];

describe.each(implementations)('%s VisitStore stats', (_name, make) => {
  async function seeded() {
    const stores = make();
    await stores.links.create({ slug: 'alpha', url: 'https://example.com/a', title: 'Alpha', by: 'a' });
    await stores.links.create({ slug: 'beta', url: 'https://example.com/b', title: null, by: 'a' });
    await stores.links.create({ slug: 'unvisited', url: 'https://example.com/c', title: null, by: 'a' });
    for (const visit of VISITS) await stores.visits.record(visit);
    return stores;
  }

  it('bumps visit_count only for human visits', async () => {
    const { links } = await seeded();
    expect((await links.getBySlug('alpha'))?.visitCount).toBe(7);
    expect((await links.getBySlug('beta'))?.visitCount).toBe(1);
  });

  it('computes per-link stats without bots', async () => {
    const { visits } = await seeded();
    expect(await visits.linkStats('alpha', RANGE, false)).toEqual({
      range: RANGE,
      total: 5,
      perDay: [
        { day: '2026-09-01', visits: 3 },
        { day: '2026-09-03', visits: 2 },
      ],
      countries: [
        { key: 'AU', visits: 2 },
        { key: 'US', visits: 2 },
        { key: 'Unknown', visits: 1 },
      ],
      referrers: [
        { key: 'Direct', visits: 2 },
        { key: 'twitter.com', visits: 2 },
        { key: 'news.ycombinator.com', visits: 1 },
      ],
      devices: [
        { key: 'desktop', visits: 2 },
        { key: 'mobile', visits: 2 },
        { key: 'tablet', visits: 1 },
      ],
      browsers: [
        { key: 'Chrome', visits: 2 },
        { key: 'Mobile Safari', visits: 2 },
        { key: 'Unknown', visits: 1 },
      ],
      os: [
        { key: 'iOS', visits: 2 },
        { key: 'Unknown', visits: 1 },
        { key: 'Windows', visits: 1 },
        { key: 'macOS', visits: 1 },
      ],
    });
  });

  it('includes bots when asked', async () => {
    const { visits } = await seeded();
    const stats = await visits.linkStats('alpha', RANGE, true);
    expect(stats.total).toBe(6);
    expect(stats.perDay).toEqual([
      { day: '2026-09-01', visits: 3 },
      { day: '2026-09-02', visits: 1 },
      { day: '2026-09-03', visits: 2 },
    ]);
    expect(stats.countries[0]).toEqual({ key: 'US', visits: 3 });
  });

  it('limits top lists to 10', async () => {
    const { visits } = await seeded();
    for (let i = 0; i < 12; i++) {
      await visits.record(v('beta', DAY2 + i, { country: `C${String(i).padStart(2, '0')}` }));
    }
    const stats = await visits.linkStats('beta', RANGE, false);
    expect(stats.countries).toHaveLength(10);
    expect(stats.countries[0]).toEqual({ key: 'AU', visits: 1 });
  });

  it('returns empty stats for a link without visits', async () => {
    const { visits } = await seeded();
    expect(await visits.linkStats('unvisited', RANGE, true)).toEqual({
      range: RANGE,
      total: 0,
      perDay: [],
      countries: [],
      referrers: [],
      devices: [],
      browsers: [],
      os: [],
    });
  });

  it('lists recent visits newest first', async () => {
    const { visits } = await seeded();
    const recent = await visits.recentVisits('alpha', 3, false);
    expect(recent).toEqual([
      {
        ts: RANGE.to,
        country: 'NZ',
        city: null,
        referrerHost: null,
        device: 'mobile',
        browser: 'Mobile Safari',
        os: 'iOS',
        isBot: false,
      },
      {
        ts: DAY3 + 6000,
        country: null,
        city: null,
        referrerHost: 'news.ycombinator.com',
        device: 'tablet',
        browser: null,
        os: null,
        isBot: false,
      },
      {
        ts: DAY3 + 5000,
        country: 'US',
        city: null,
        referrerHost: 'twitter.com',
        device: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        isBot: false,
      },
    ]);
    const withBots = await visits.recentVisits('alpha', 50, true);
    expect(withBots).toHaveLength(8);
    expect(withBots.filter((x) => x.isBot)).toHaveLength(1);
    expect((await visits.recentVisits('alpha', 50, false)).at(-1)).toMatchObject({ ts: DAY1 - 1 });
  });

  it('computes the overview', async () => {
    const { visits } = await seeded();
    expect(await visits.overview(RANGE, false)).toEqual({
      range: RANGE,
      totalLinks: 3,
      totalVisits: 6,
      perDay: [
        { day: '2026-09-01', visits: 3 },
        { day: '2026-09-02', visits: 1 },
        { day: '2026-09-03', visits: 2 },
      ],
      topLinks: [
        { slug: 'alpha', title: 'Alpha', visits: 5 },
        { slug: 'beta', title: null, visits: 1 },
      ],
    });
    const withBots = await visits.overview(RANGE, true);
    expect(withBots.totalVisits).toBe(8);
    expect(withBots.perDay).toContainEqual({ day: '2026-09-02', visits: 3 });
  });
});
