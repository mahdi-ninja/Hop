import { describe, expect, it } from 'vitest';
import { checkCustomSlug, generateSlug, isReservedSlug, isValidSlugFormat } from '../src/lib/slug';

describe('slug format', () => {
  it.each(['a', 'abc123', 'My_Link-2', 'x'.repeat(64)])('accepts %s', (slug) => {
    expect(isValidSlugFormat(slug)).toBe(true);
  });

  it.each(['', 'x'.repeat(65), 'has space', 'dot.ted', 'slash/y', 'ünï', 'a%20'])('rejects %j', (slug) => {
    expect(isValidSlugFormat(slug)).toBe(false);
  });
});

describe('reserved slugs', () => {
  it.each(['admin', 'API', 'cdn-cgi', 'Assets', 'static', 'HEALTH', 'robots.txt', 'favicon.ico', 'oauth2', 'Authelia'])(
    'reserves %s case-insensitively',
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    },
  );

  it('does not reserve lookalikes', () => {
    expect(isReservedSlug('admins')).toBe(false);
    expect(isReservedSlug('my-api')).toBe(false);
  });
});

describe('checkCustomSlug', () => {
  it('classifies slugs', () => {
    expect(checkCustomSlug('launch')).toBe('ok');
    expect(checkCustomSlug('bad slug')).toBe('invalid');
    expect(checkCustomSlug('Admin')).toBe('reserved');
    // Dots fail the format check before the reserved check.
    expect(checkCustomSlug('robots.txt')).toBe('invalid');
  });
});

describe('generateSlug', () => {
  it('produces 7 base62 characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSlug()).toMatch(/^[0-9A-Za-z]{7}$/);
    }
  });

  it('is random', () => {
    const slugs = new Set(Array.from({ length: 500 }, () => generateSlug()));
    expect(slugs.size).toBe(500);
  });
});
