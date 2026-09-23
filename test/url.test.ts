import { describe, expect, it } from 'vitest';
import { isLocalHostname, mergeQuery, shortOrigin, validateTargetUrl } from '../src/lib/url';

const SHORT = 'go.example.com';

describe('validateTargetUrl', () => {
  it('accepts http and https URLs', () => {
    expect(validateTargetUrl('https://example.com/path?q=1', SHORT)).toBe('https://example.com/path?q=1');
    expect(validateTargetUrl('http://example.com', SHORT)).toBe('http://example.com/');
  });

  it.each(['javascript:alert(1)', 'ftp://example.com', 'data:text/html,hi', 'mailto:a@b.c', 'file:///etc/passwd'])(
    'rejects non-http protocol %s',
    (url) => {
      expect(validateTargetUrl(url, SHORT)).toBeNull();
    },
  );

  it.each(['', 'not a url', '/relative', 'example.com'])('rejects unparseable %j', (url) => {
    expect(validateTargetUrl(url, SHORT)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateTargetUrl(undefined, SHORT)).toBeNull();
    expect(validateTargetUrl(42, SHORT)).toBeNull();
  });

  it('enforces the 2048 character limit', () => {
    const base = 'https://example.com/';
    expect(validateTargetUrl(base + 'a'.repeat(2048 - base.length), SHORT)).not.toBeNull();
    expect(validateTargetUrl(base + 'a'.repeat(2049 - base.length), SHORT)).toBeNull();
  });

  it.each([
    'https://go.example.com/abc',
    'http://GO.EXAMPLE.COM/',
    'https://go.example.com./x',
    'https://go.example.com:8443/x',
    'https://user@go.example.com/x',
  ])('rejects the short domain itself: %s', (url) => {
    expect(validateTargetUrl(url, SHORT)).toBeNull();
  });

  it('allows other subdomains of the same parent', () => {
    expect(validateTargetUrl('https://example.com/', SHORT)).not.toBeNull();
    expect(validateTargetUrl('https://www.go.example.com/', SHORT)).not.toBeNull();
  });
});

describe('local short domains', () => {
  it('recognizes local hostnames', () => {
    for (const host of ['localhost', 'go.localhost', 'GO.LOCALHOST.', '127.0.0.1', '[::1]']) expect(isLocalHostname(host), host).toBe(true);
    for (const host of ['go.example.com', 'localhost.evil.com', 'evil-localhost', 'mylocalhost']) expect(isLocalHostname(host), host).toBe(false);
  });

  it('uses http for local short domains and https otherwise', () => {
    expect(shortOrigin('go.localhost:4696')).toBe('http://go.localhost:4696');
    expect(shortOrigin('go.example.com')).toBe('https://go.example.com');
  });

  it('rejects links to the local short domain, with or without the port', () => {
    expect(validateTargetUrl('http://go.localhost:4696/abc', 'go.localhost:4696')).toBeNull();
    expect(validateTargetUrl('http://go.localhost/abc', 'go.localhost:4696')).toBeNull();
    expect(validateTargetUrl('http://other.localhost:4696/abc', 'go.localhost:4696')).not.toBeNull();
  });
});

describe('mergeQuery', () => {
  it('returns the target unchanged when there are no incoming params', () => {
    expect(mergeQuery('https://example.com/a?x=1', new URLSearchParams())).toBe('https://example.com/a?x=1');
  });

  it('adds incoming params', () => {
    expect(mergeQuery('https://example.com/a', new URLSearchParams('utm_source=tw'))).toBe(
      'https://example.com/a?utm_source=tw',
    );
  });

  it('keeps target params and lets incoming params win on conflicts', () => {
    const merged = new URL(mergeQuery('https://example.com/a?x=1&y=2', new URLSearchParams('y=3&z=4')));
    expect(merged.searchParams.get('x')).toBe('1');
    expect(merged.searchParams.getAll('y')).toEqual(['3']);
    expect(merged.searchParams.get('z')).toBe('4');
  });

  it('keeps repeated incoming values', () => {
    const merged = new URL(mergeQuery('https://example.com/?tag=a', new URLSearchParams('tag=b&tag=c')));
    expect(merged.searchParams.getAll('tag')).toEqual(['b', 'c']);
  });

  it('preserves the target fragment', () => {
    expect(mergeQuery('https://example.com/a#section', new URLSearchParams('q=1'))).toBe(
      'https://example.com/a?q=1#section',
    );
  });
});
