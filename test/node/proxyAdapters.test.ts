import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareHeaderGeoLookup, noGeo } from '../../src/adapters/proxy/geo';
import { TrustedHeaderIdentityProvider } from '../../src/adapters/proxy/identity';

const SECRET = 'test-secret-0123456789abcdef0123456789';

function request(headers: Record<string, string>) {
  return new Request('https://go.example.com/api/me', { headers });
}

afterEach(() => vi.restoreAllMocks());

describe('TrustedHeaderIdentityProvider', () => {
  const provider = new TrustedHeaderIdentityProvider(SECRET);

  it('trusts the email only alongside the right secret', async () => {
    expect(await provider.identify(request({ 'X-Hop-Proxy-Secret': SECRET, 'X-Hop-Email': ' Ann@Example.com ' }))).toEqual({
      email: 'ann@example.com',
    });
    expect(await provider.identify(request({ 'X-Hop-Email': 'ann@example.com' }))).toBeNull();
  });

  it('rejects a wrong secret, including a prefix of the right one, and logs it once a minute', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fresh = new TrustedHeaderIdentityProvider(SECRET);
    for (const secret of ['nope', SECRET.slice(0, -1), `${SECRET}x`]) {
      expect(await fresh.identify(request({ 'X-Hop-Proxy-Secret': secret, 'X-Hop-Email': 'ann@example.com' }))).toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing or malformed email', async () => {
    expect(await provider.identify(request({ 'X-Hop-Proxy-Secret': SECRET }))).toBeNull();
    for (const email of ['', 'ann', 'ann @example.com', 'a@b@c d']) {
      expect(await provider.identify(request({ 'X-Hop-Proxy-Secret': SECRET, 'X-Hop-Email': email }))).toBeNull();
    }
  });
});

describe('geo lookups', () => {
  it('reads Cloudflare visitor-location headers and treats XX as unknown', async () => {
    const geo = new CloudflareHeaderGeoLookup();
    expect(
      await geo.lookup(request({ 'CF-IPCountry': 'AU', 'CF-IPContinent': 'OC', 'CF-Region': 'Victoria', 'CF-IPCity': 'Melbourne' })),
    ).toEqual({ continent: 'OC', country: 'AU', region: 'Victoria', city: 'Melbourne' });
    expect(await geo.lookup(request({ 'CF-IPCountry': 'XX' }))).toEqual({ continent: null, country: null, region: null, city: null });
  });

  it('ignores the headers entirely when there is no geo source', async () => {
    expect(await noGeo.lookup(request({ 'CF-IPCountry': 'AU' }))).toEqual({ continent: null, country: null, region: null, city: null });
  });
});
