import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1LinkStore } from '../src/adapters/d1/linkStore';
import { D1VisitStore } from '../src/adapters/d1/visitStore';
import type { NewVisit } from '../src/core/types';

function visit(slug: string, isBot: boolean): NewVisit {
  return {
    slug,
    ts: Date.now(),
    country: 'AU',
    region: 'Victoria',
    city: 'Melbourne',
    referrerHost: null,
    device: 'desktop',
    browser: 'Chrome',
    os: 'macOS',
    isBot,
  };
}

describe('D1VisitStore.record', () => {
  it('inserts visits and counts only non-bot visits', async () => {
    const links = new D1LinkStore(env.DB);
    const visits = new D1VisitStore(env.DB);
    await links.create({ slug: 'rec', url: 'https://example.com/', title: null, by: 'a@b.c' });

    await visits.record(visit('rec', false));
    await visits.record(visit('rec', false));
    await visits.record(visit('rec', true));

    const rows = await env.DB.prepare('SELECT is_bot, country, city FROM visits WHERE slug = ? ORDER BY id')
      .bind('rec')
      .all<{ is_bot: number; country: string; city: string }>();
    expect(rows.results.map((r) => r.is_bot)).toEqual([0, 0, 1]);
    expect(rows.results[0]).toMatchObject({ country: 'AU', city: 'Melbourne' });
    expect((await links.getBySlug('rec'))?.visitCount).toBe(2);
  });
});
