import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1LinkStore } from '../src/adapters/d1/linkStore';
import { SlugTakenError } from '../src/core/ports';

describe('D1LinkStore', () => {
  it('creates and reads back a link', async () => {
    const store = new D1LinkStore(env.DB);
    const created = await store.create({ slug: 'd1-read', url: 'https://example.com/', title: 'Ex', by: 'a@b.c' });
    expect(created).toMatchObject({ slug: 'd1-read', url: 'https://example.com/', title: 'Ex', visitCount: 0 });
    expect(await store.getBySlug('d1-read')).toEqual(created);
  });

  it('returns null for unknown slugs and is case-sensitive', async () => {
    const store = new D1LinkStore(env.DB);
    await store.create({ slug: 'CaseY', url: 'https://example.com/', title: null, by: 'a@b.c' });
    expect(await store.getBySlug('casey')).toBeNull();
    expect(await store.getBySlug('missing')).toBeNull();
  });

  it('throws SlugTakenError on duplicate slugs', async () => {
    const store = new D1LinkStore(env.DB);
    await store.create({ slug: 'dupe', url: 'https://example.com/1', title: null, by: 'a@b.c' });
    await expect(
      store.create({ slug: 'dupe', url: 'https://example.com/2', title: null, by: 'a@b.c' }),
    ).rejects.toBeInstanceOf(SlugTakenError);
  });
});

describe('D1LinkStore list', () => {
  async function seed(store: D1LinkStore) {
    const rows: [string, number, string, string | null][] = [
      ['a1', 1000, 'https://alpha.example/', 'Alpha Page'],
      ['a2', 2000, 'https://beta.example/100%_off', null],
      ['a3', 2000, 'https://gamma.example/', 'Gamma'],
      ['a4', 3000, 'https://delta.example/', 'Weekly Report'],
    ];
    for (const [slug, ts, url, title] of rows) {
      await env.DB.prepare(
        'INSERT INTO links (slug, url, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(slug, url, title, ts, ts)
        .run();
    }
    return store;
  }

  it('orders by created_at desc then slug and paginates', async () => {
    const store = await seed(new D1LinkStore(env.DB));
    const first = await store.list({ limit: 2 });
    expect(first.items.map((l) => l.slug)).toEqual(['a4', 'a2']);
    expect(first.nextCursor).not.toBeNull();
    const second = await store.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((l) => l.slug)).toEqual(['a3', 'a1']);
    expect(second.nextCursor).toBeNull();
  });

  it('searches slug, url and title case-insensitively', async () => {
    const store = await seed(new D1LinkStore(env.DB));
    const slugs = async (search: string) => (await store.list({ search, limit: 10 })).items.map((l) => l.slug);
    expect(await slugs('REPORT')).toEqual(['a4']);
    expect(await slugs('beta.EXAMPLE')).toEqual(['a2']);
    expect(await slugs('a3')).toEqual(['a3']);
  });

  it('treats LIKE wildcards in search literally', async () => {
    const store = await seed(new D1LinkStore(env.DB));
    const slugs = async (search: string) => (await store.list({ search, limit: 10 })).items.map((l) => l.slug);
    expect(await slugs('%')).toEqual(['a2']);
    expect(await slugs('0%_o')).toEqual(['a2']);
    expect(await slugs('_')).toEqual(['a2']);
  });
});

describe('D1LinkStore mutations', () => {
  it('updates fields and returns null for unknown slugs', async () => {
    const store = new D1LinkStore(env.DB);
    await store.create({ slug: 'upd', url: 'https://example.com/a', title: 'A', by: 'bob' });
    const updated = await store.update('upd', { url: 'https://example.com/b' }, 'alice');
    expect(updated).toMatchObject({ url: 'https://example.com/b', title: 'A', createdBy: 'bob', updatedBy: 'alice' });
    expect(await store.update('upd', { title: null }, 'alice')).toMatchObject({ title: null });
    expect(await store.update('missing', { title: 'x' }, 'alice')).toBeNull();
  });

  it('deletes the link together with its visits', async () => {
    const store = new D1LinkStore(env.DB);
    await store.create({ slug: 'del', url: 'https://example.com/', title: null, by: 'a' });
    await store.create({ slug: 'keep', url: 'https://example.com/', title: null, by: 'a' });
    for (const slug of ['del', 'del', 'keep']) {
      await env.DB.prepare('INSERT INTO visits (slug, ts) VALUES (?, 0)').bind(slug).run();
    }
    expect(await store.delete('del')).toBe(true);
    expect(await store.getBySlug('del')).toBeNull();
    const counts = await env.DB.prepare('SELECT slug, COUNT(*) AS n FROM visits GROUP BY slug').all();
    expect(counts.results).toEqual([{ slug: 'keep', n: 1 }]);
    expect(await store.delete('del')).toBe(false);
  });

  it('sets the title only when empty', async () => {
    const store = new D1LinkStore(env.DB);
    await store.create({ slug: 't1', url: 'https://example.com/', title: null, by: 'a' });
    await store.create({ slug: 't2', url: 'https://example.com/', title: 'Kept', by: 'a' });
    await store.setTitleIfEmpty('t1', 'Fetched');
    await store.setTitleIfEmpty('t2', 'Fetched');
    expect((await store.getBySlug('t1'))?.title).toBe('Fetched');
    expect((await store.getBySlug('t2'))?.title).toBe('Kept');
  });
});
