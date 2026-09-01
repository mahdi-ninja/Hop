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
