import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { SlugTakenError } from '../src/core/ports';
import { createFakeServices, type FakeServices } from './fakes/services';

const app = createApp();
let services: FakeServices;

beforeEach(() => {
  services = createFakeServices({ identity: { identify: async () => ({ email: 'alice@example.com' }) } });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('<title>Fetched title</title>', { headers: { 'Content-Type': 'text/html' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return app.request(`https://go.example.com/api${path}`, init, { services });
}

async function create(body: unknown) {
  const res = await call('POST', '/links', body);
  return { res, json: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/links', () => {
  it('creates a link with a random 7-char slug', async () => {
    const { res, json } = await create({ url: 'https://example.com/page', title: 'Page' });
    expect(res.status).toBe(201);
    expect(json.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(json).toMatchObject({
      shortUrl: `https://go.example.com/${json.slug}`,
      url: 'https://example.com/page',
      title: 'Page',
      visitCount: 0,
      createdBy: 'alice@example.com',
      updatedBy: 'alice@example.com',
    });
    expect(json.createdAt).toEqual(expect.any(Number));
  });

  it('builds http short URLs for a local short domain', async () => {
    services.config = { shortDomain: 'go.localhost:4696', rootRedirectUrl: null, accessConfigured: true };
    const { json } = await create({ url: 'https://example.com/', slug: 'local' });
    expect(json.shortUrl).toBe('http://go.localhost:4696/local');
  });

  it('creates a link with a custom slug', async () => {
    const { res, json } = await create({ url: 'https://example.com/', slug: 'Launch_2026' });
    expect(res.status).toBe(201);
    expect(json.slug).toBe('Launch_2026');
  });

  it('treats an empty slug as "generate one"', async () => {
    const { res, json } = await create({ url: 'https://example.com/', slug: '' });
    expect(res.status).toBe(201);
    expect(json.slug).toMatch(/^[0-9A-Za-z]{7}$/);
  });

  it('returns 409 SLUG_TAKEN for duplicates', async () => {
    await create({ url: 'https://example.com/', slug: 'dupe' });
    const { res, json } = await create({ url: 'https://example.com/2', slug: 'dupe' });
    expect(res.status).toBe(409);
    expect(json).toEqual({ error: { code: 'SLUG_TAKEN', message: 'That slug is already in use.' } });
  });

  it('retries random slugs on collision', async () => {
    const realCreate = services.links.create.bind(services.links);
    let calls = 0;
    services.links.create = async (input) => {
      if (++calls <= 3) throw new SlugTakenError(input.slug);
      return realCreate(input);
    };
    const { res } = await create({ url: 'https://example.com/' });
    expect(res.status).toBe(201);
    expect(calls).toBe(4);
  });

  it('gives up after 5 collisions', async () => {
    let calls = 0;
    services.links.create = async (input) => {
      calls++;
      throw new SlugTakenError(input.slug);
    };
    const { res, json } = await create({ url: 'https://example.com/' });
    expect(res.status).toBe(500);
    expect(json).toMatchObject({ error: { code: 'INTERNAL' } });
    expect(calls).toBe(5);
  });

  it.each([
    [{ url: 'javascript:alert(1)' }],
    [{ url: 'https://go.example.com/loop' }],
    [{ url: 'not a url' }],
    [{ url: 42 }],
    [{}],
    [{ url: `https://example.com/${'a'.repeat(2048)}` }],
  ])('rejects %j with INVALID_URL', async (body) => {
    const { res, json } = await create(body);
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: { code: 'INVALID_URL' } });
  });

  it.each(['has space', 'a/b', 'x'.repeat(65), 'robots.txt'])('rejects slug %j with INVALID_SLUG', async (slug) => {
    const { res, json } = await create({ url: 'https://example.com/', slug });
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: { code: 'INVALID_SLUG' } });
  });

  it('rejects non-string slugs', async () => {
    const { json } = await create({ url: 'https://example.com/', slug: 123 });
    expect(json).toMatchObject({ error: { code: 'INVALID_SLUG' } });
  });

  it.each(['admin', 'API', 'Health', 'cdn-cgi', 'assets', 'static'])('rejects reserved slug %s', async (slug) => {
    const { res, json } = await create({ url: 'https://example.com/', slug });
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: { code: 'RESERVED_SLUG' } });
  });

  it.each(['not json', '[]', 'null', '"str"'])('rejects body %j with INVALID_INPUT', async (body) => {
    const { res, json } = await create(body);
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });

  it('rejects non-string or overlong titles', async () => {
    expect((await create({ url: 'https://example.com/', title: 5 })).json).toMatchObject({
      error: { code: 'INVALID_INPUT' },
    });
    expect((await create({ url: 'https://example.com/', title: 'x'.repeat(201) })).json).toMatchObject({
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('fetches the title in the background when none is given', async () => {
    const { json } = await create({ url: 'https://example.com/' });
    expect(json.title).toBeNull();
    await services.settle();
    expect(services.links.links.get(json.slug as string)?.title).toBe('Fetched title');
    expect(fetch).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ redirect: 'follow' }));
  });

  it('does not fetch a title when one is given', async () => {
    await create({ url: 'https://example.com/', title: 'Given' });
    await services.settle();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/links', () => {
  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      await services.links.create({ slug: `s${String(i).padStart(3, '0')}`, url: `https://example.com/${i}`, title: `Link ${i}`, by: 'a' });
    }
  }

  it('lists newest first with a default page size of 50', async () => {
    await seed(60);
    const res = await call('GET', '/links');
    const json = (await res.json()) as { items: { slug: string }[]; nextCursor: string | null };
    expect(json.items).toHaveLength(50);
    expect(json.items[0]?.slug).toBe('s059');
    expect(json.nextCursor).toEqual(expect.any(String));
  });

  it('paginates with an opaque cursor until exhausted', async () => {
    await seed(25);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await call('GET', `/links?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      const json = (await res.json()) as { items: { slug: string }[]; nextCursor: string | null };
      seen.push(...json.items.map((i) => i.slug));
      cursor = json.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe('s024');
    expect(seen[24]).toBe('s000');
  });

  it('caps limit at 100 and rejects invalid limits and cursors', async () => {
    await seed(3);
    expect((await call('GET', '/links?limit=500')).status).toBe(200);
    expect((await call('GET', '/links?limit=0')).status).toBe(400);
    expect((await call('GET', '/links?limit=abc')).status).toBe(400);
    const bad = await call('GET', '/links?cursor=garbage');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });

  it('searches slug, url and title case-insensitively', async () => {
    await services.links.create({ slug: 'alpha', url: 'https://one.example/', title: null, by: 'a' });
    await services.links.create({ slug: 'beta', url: 'https://GITHUB.com/x', title: null, by: 'a' });
    await services.links.create({ slug: 'gamma', url: 'https://three.example/', title: 'Quarterly Report', by: 'a' });
    const slugs = async (q: string) =>
      ((await (await call('GET', `/links?search=${encodeURIComponent(q)}`)).json()) as { items: { slug: string }[] }).items.map(
        (i) => i.slug,
      );
    expect(await slugs('ALPH')).toEqual(['alpha']);
    expect(await slugs('github')).toEqual(['beta']);
    expect(await slugs('report')).toEqual(['gamma']);
    expect(await slugs('example')).toEqual(['gamma', 'alpha']);
    expect(await slugs('zzz')).toEqual([]);
  });
});

describe('GET /api/links/:slug', () => {
  it('returns the link or 404', async () => {
    await create({ url: 'https://example.com/', slug: 'one' });
    const res = await call('GET', '/links/one');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ slug: 'one', shortUrl: 'https://go.example.com/one' });
    const missing = await call('GET', '/links/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('PATCH /api/links/:slug', () => {
  beforeEach(async () => {
    await services.links.create({ slug: 'edit', url: 'https://example.com/old', title: 'Old', by: 'bob@example.com' });
  });

  it('updates url and title and records the editor', async () => {
    const res = await call('PATCH', '/links/edit', { url: 'https://example.com/new', title: 'New' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      slug: 'edit',
      url: 'https://example.com/new',
      title: 'New',
      createdBy: 'bob@example.com',
      updatedBy: 'alice@example.com',
    });
  });

  it('can clear the title with null', async () => {
    const res = await call('PATCH', '/links/edit', { title: null });
    expect(await res.json()).toMatchObject({ title: null, url: 'https://example.com/old' });
  });

  it('does not change the slug', async () => {
    const res = await call('PATCH', '/links/edit', { slug: 'other', title: 'T' });
    expect(await res.json()).toMatchObject({ slug: 'edit' });
    expect(services.links.links.has('other')).toBe(false);
  });

  it('validates input', async () => {
    expect(await (await call('PATCH', '/links/edit', {})).json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    expect(await (await call('PATCH', '/links/edit', { url: 'ftp://x' })).json()).toMatchObject({
      error: { code: 'INVALID_URL' },
    });
    expect(await (await call('PATCH', '/links/edit', { title: 7 })).json()).toMatchObject({
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('returns 404 for unknown links', async () => {
    const res = await call('PATCH', '/links/nope', { title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/links/:slug', () => {
  it('deletes the link and its visits', async () => {
    await services.links.create({ slug: 'gone', url: 'https://example.com/', title: null, by: 'a' });
    await services.links.create({ slug: 'kept', url: 'https://example.com/', title: null, by: 'a' });
    const ua = { 'User-Agent': 'Mozilla/5.0 Chrome/128.0' };
    await app.request('https://go.example.com/gone', { headers: ua }, { services });
    await app.request('https://go.example.com/kept', { headers: ua }, { services });
    await services.settle();
    expect(services.visits.visits).toHaveLength(2);

    const res = await call('DELETE', '/links/gone');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(services.links.links.has('gone')).toBe(false);
    expect(services.visits.visits.map((v) => v.slug)).toEqual(['kept']);
  });

  it('returns 404 for unknown links', async () => {
    const res = await call('DELETE', '/links/nope');
    expect(res.status).toBe(404);
  });
});
