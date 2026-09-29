const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'cdn-cgi',
  'assets',
  'static',
  'health',
  'robots.txt',
  'favicon.ico',
  // Paths the Docker preset's auth proxies serve on the short domain.
  'oauth2',
  'authelia',
]);

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const GENERATED_SLUG_LENGTH = 7;

export type SlugCheck = 'ok' | 'invalid' | 'reserved';

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function checkCustomSlug(slug: string): SlugCheck {
  if (!isValidSlugFormat(slug)) return 'invalid';
  if (isReservedSlug(slug)) return 'reserved';
  return 'ok';
}

export function generateSlug(length = GENERATED_SLUG_LENGTH): string {
  let slug = '';
  // Rejection sampling: bytes >= 248 (4 * 62) are discarded so every character is equally likely.
  const limit = 256 - (256 % BASE62.length);
  while (slug.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit) slug += BASE62[byte % BASE62.length];
      if (slug.length === length) break;
    }
  }
  return slug;
}
