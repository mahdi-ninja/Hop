import { describe, expect, it } from 'vitest';
import { extractTitle, fetchTitle, fillTitle } from '../src/lib/title';
import { FakeLinkStore } from './fakes/linkStore';

function htmlResponse(body: string, contentType = 'text/html; charset=utf-8', status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}

describe('extractTitle', () => {
  it('extracts, decodes, and collapses whitespace', () => {
    expect(extractTitle('<html><head><TITLE lang="en">\n  Tom &amp; Jerry&#39;s &quot;Page&quot; &#x2014; &lt;1&gt;\n</TITLE>')).toBe(
      'Tom & Jerry\'s "Page" — <1>',
    );
  });

  it('returns the first title only', () => {
    expect(extractTitle('<title>One</title><svg><title>Two</title></svg>')).toBe('One');
  });

  it('returns null when missing or blank', () => {
    expect(extractTitle('<html><head></head></html>')).toBeNull();
    expect(extractTitle('<title>   </title>')).toBeNull();
  });

  it('caps at 200 characters', () => {
    expect(extractTitle(`<title>${'a'.repeat(500)}</title>`)).toHaveLength(200);
  });

  it('leaves unknown entities alone', () => {
    expect(extractTitle('<title>a &bogus; b</title>')).toBe('a &bogus; b');
  });
});

describe('fetchTitle', () => {
  it('reads the title from HTML responses', async () => {
    const fetcher = async () => htmlResponse('<title>Hello</title>');
    expect(await fetchTitle('https://example.com', fetcher)).toBe('Hello');
  });

  it('ignores non-HTML and error responses', async () => {
    expect(await fetchTitle('https://x', async () => htmlResponse('<title>x</title>', 'application/json'))).toBeNull();
    expect(await fetchTitle('https://x', async () => htmlResponse('<title>x</title>', 'text/html', 500))).toBeNull();
  });

  it('only reads the first 64 KB', async () => {
    const late = `${' '.repeat(70 * 1024)}<title>Late</title>`;
    expect(await fetchTitle('https://x', async () => htmlResponse(late))).toBeNull();
    const early = `<title>Early</title>${' '.repeat(70 * 1024)}`;
    expect(await fetchTitle('https://x', async () => htmlResponse(early))).toBe('Early');
  });

  it('passes a timeout signal and follows redirects', async () => {
    let init: RequestInit | undefined;
    await fetchTitle('https://x', async (_url, i) => {
      init = i;
      return htmlResponse('');
    });
    expect(init?.redirect).toBe('follow');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fillTitle', () => {
  it('stores the title only if the link has none', async () => {
    const links = new FakeLinkStore();
    await links.create({ slug: 'a', url: 'https://x', title: null, by: 'me' });
    await links.create({ slug: 'b', url: 'https://x', title: 'Mine', by: 'me' });
    const fetcher = async () => htmlResponse('<title>Fetched</title>');
    await fillTitle('a', 'https://x', { links }, fetcher);
    await fillTitle('b', 'https://x', { links }, fetcher);
    expect(links.links.get('a')?.title).toBe('Fetched');
    expect(links.links.get('b')?.title).toBe('Mine');
  });

  it('never rejects', async () => {
    const links = new FakeLinkStore();
    await expect(
      fillTitle('a', 'https://x', { links }, async () => {
        throw new Error('timeout');
      }),
    ).resolves.toBeUndefined();
  });
});
