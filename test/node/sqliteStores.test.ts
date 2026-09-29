import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { SqlLinkStore } from '../../src/adapters/sql/linkStore';
import { sql } from '../../src/adapters/sql/runner';
import { SqlVisitStore } from '../../src/adapters/sql/visitStore';
import { applyMigrations, openDatabase } from '../../src/adapters/sqlite/database';
import { SqliteRunner } from '../../src/adapters/sqlite/runner';
import { SlugTakenError } from '../../src/core/ports';
import type { NewVisit } from '../../src/core/types';

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname;

let db: DatabaseSync;
let runner: SqliteRunner;
let links: SqlLinkStore;
let visits: SqlVisitStore;

beforeEach(() => {
  db = openDatabase(':memory:');
  applyMigrations(db, MIGRATIONS);
  runner = new SqliteRunner(db);
  links = new SqlLinkStore(runner);
  visits = new SqlVisitStore(runner);
});

function visit(slug: string, overrides: Partial<NewVisit> = {}): NewVisit {
  return {
    slug,
    ts: Date.UTC(2026, 0, 2, 12),
    country: 'AU',
    region: 'Victoria',
    city: 'Melbourne',
    referrerHost: null,
    device: 'desktop',
    browser: 'Chrome',
    os: 'macOS',
    isBot: false,
    ...overrides,
  };
}

describe('SqliteRunner', () => {
  it('rolls back the whole batch when one statement fails', async () => {
    await links.create({ slug: 'a', url: 'https://example.com/', title: null, by: 'x' });
    await expect(
      runner.batch([sql("UPDATE links SET title = 'changed' WHERE slug = 'a'"), sql('INSERT INTO nope VALUES (1)')]),
    ).rejects.toThrow();
    expect((await links.getBySlug('a'))?.title).toBeNull();
    expect(db.isTransaction).toBe(false);
  });

  it('reports rows for reads and change counts for writes in a batch', async () => {
    await links.create({ slug: 'a', url: 'https://example.com/', title: null, by: 'x' });
    const [read, write] = await runner.batch([
      sql('SELECT slug FROM links'),
      sql("UPDATE links SET title = 't' WHERE slug = ?", 'a'),
    ]);
    expect(read).toEqual({ rows: [{ slug: 'a' }], changes: 0 });
    expect(write).toEqual({ rows: [], changes: 1 });
  });
});

describe('SQLite link store', () => {
  it('creates, reads, and rejects duplicate slugs', async () => {
    const created = await links.create({ slug: 'CaseY', url: 'https://example.com/', title: 'Ex', by: 'a@b.c' });
    expect(created).toMatchObject({ slug: 'CaseY', title: 'Ex', visitCount: 0, createdBy: 'a@b.c', rules: [] });
    expect(await links.getBySlug('CaseY')).toEqual(created);
    expect(await links.getBySlug('casey')).toBeNull();
    await expect(links.create({ slug: 'CaseY', url: 'https://example.com/2', title: null, by: 'a' })).rejects.toBeInstanceOf(
      SlugTakenError,
    );
  });

  it('paginates and searches with numbered parameters', async () => {
    for (const [slug, ts, title] of [
      ['a1', 1000, 'Alpha'],
      ['a2', 2000, '100%_off'],
      ['a3', 2000, 'Gamma'],
    ] as const) {
      db.prepare('INSERT INTO links (slug, url, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        slug,
        'https://example.com/',
        title,
        ts,
        ts,
      );
    }
    const first = await links.list({ limit: 2 });
    expect(first.items.map((l) => l.slug)).toEqual(['a2', 'a3']);
    const second = await links.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((l) => l.slug)).toEqual(['a1']);
    expect(second.nextCursor).toBeNull();
    expect((await links.list({ search: '%_', limit: 10 })).items.map((l) => l.slug)).toEqual(['a2']);
    expect((await links.list({ search: 'alpha', limit: 10, cursor: first.nextCursor! })).items.map((l) => l.slug)).toEqual(['a1']);
  });

  it('updates, stores rules, sets missing titles, and deletes visits with the link', async () => {
    await links.create({ slug: 'u', url: 'https://example.com/a', title: null, by: 'bob' });
    const rules = [{ conditions: [], destinations: [{ url: 'https://example.com/r', weight: 100 }] }];
    expect(await links.update('u', { url: 'https://example.com/b', rules }, 'alice')).toMatchObject({
      url: 'https://example.com/b',
      updatedBy: 'alice',
      rules,
    });
    expect(await links.update('missing', { title: 'x' }, 'alice')).toBeNull();

    await links.setTitleIfEmpty('u', 'Fetched');
    await links.setTitleIfEmpty('u', 'Again');
    expect((await links.getBySlug('u'))?.title).toBe('Fetched');

    await visits.record(visit('u'));
    expect(await links.delete('u')).toBe(true);
    expect(await links.delete('u')).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM visits').get()).toEqual({ n: 0 });
  });
});

describe('SQLite visit store', () => {
  it('counts only human visits and builds stats and the overview', async () => {
    await links.create({ slug: 's', url: 'https://example.com/', title: 'S', by: 'a' });
    await visits.record(visit('s'));
    await visits.record(visit('s', { country: null, referrerHost: 'news.example' }));
    await visits.record(visit('s', { isBot: true }));
    expect((await links.getBySlug('s'))?.visitCount).toBe(2);

    const range = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 3) };
    const stats = await visits.linkStats('s', range, false);
    expect(stats).toMatchObject({
      total: 2,
      perDay: [{ day: '2026-01-02', visits: 2 }],
      countries: [
        { key: 'AU', visits: 1 },
        { key: 'Unknown', visits: 1 },
      ],
      referrers: [
        { key: 'Direct', visits: 1 },
        { key: 'news.example', visits: 1 },
      ],
    });
    expect((await visits.linkStats('s', range, true)).total).toBe(3);

    const recent = await visits.recentVisits('s', 10, true);
    expect(recent).toHaveLength(3);
    expect(recent[0]).toMatchObject({ isBot: true, device: 'desktop' });

    expect(await visits.overview(range, false)).toMatchObject({
      totalLinks: 1,
      totalVisits: 2,
      topLinks: [{ slug: 's', title: 'S', visits: 2 }],
    });
  });
});
