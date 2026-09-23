import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AccessIdentityProvider } from '../src/adapters/cloudflare/access';
import { DevIdentityProvider } from '../src/adapters/dev/devIdentity';

const TEAM = 'https://team.cloudflareaccess.com';
const AUD = 'test-aud';

let privateKey: CryptoKey;
let localKeys: JWTVerifyGetKey;
let provider: AccessIdentityProvider;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  localKeys = createLocalJWKSet({ keys: [jwk] });
  provider = new AccessIdentityProvider({ teamDomain: TEAM, audience: AUD, keys: localKeys });
});

function sign(claims: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ email: 'alice@example.com', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey);
}

const withHeader = (token: string) =>
  new Request('https://go.example.com/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } });

describe('AccessIdentityProvider', () => {
  it('returns null without a token', async () => {
    expect(await provider.identify(new Request('https://go.example.com/api/me'))).toBeNull();
  });

  it('accepts a valid token from the header', async () => {
    expect(await provider.identify(withHeader(await sign()))).toEqual({ email: 'alice@example.com' });
  });

  it('falls back to the CF_Authorization cookie', async () => {
    const req = new Request('https://go.example.com/api/me', {
      headers: { Cookie: `other=1; CF_Authorization=${await sign()}; x=y` },
    });
    expect(await provider.identify(req)).toEqual({ email: 'alice@example.com' });
  });

  it('rejects garbage tokens', async () => {
    expect(await provider.identify(withHeader('not.a.jwt'))).toBeNull();
  });

  it('rejects tokens signed with another key', async () => {
    const other = await generateKeyPair('RS256');
    expect(await provider.identify(withHeader(await sign({}, { key: other.privateKey })))).toBeNull();
  });

  it('rejects the wrong audience or issuer', async () => {
    expect(await provider.identify(withHeader(await sign({}, { aud: 'other-app' })))).toBeNull();
    expect(await provider.identify(withHeader(await sign({}, { iss: 'https://evil.cloudflareaccess.com' })))).toBeNull();
  });

  it('rejects expired tokens', async () => {
    expect(await provider.identify(withHeader(await sign({}, { exp: '-1m' })))).toBeNull();
  });

  it('rejects tokens without an email', async () => {
    expect(await provider.identify(withHeader(await sign({ email: undefined })))).toBeNull();
  });

  it('tolerates a trailing slash on the team domain', async () => {
    const slashed = new AccessIdentityProvider({ teamDomain: `${TEAM}/`, audience: AUD, keys: localKeys });
    expect(await slashed.identify(withHeader(await sign()))).toEqual({ email: 'alice@example.com' });
  });
});

describe('DevIdentityProvider', () => {
  const deny = { identify: async () => null };

  it('uses the dev email on localhost', async () => {
    const dev = new DevIdentityProvider(deny, 'dev@example.com');
    expect(await dev.identify(new Request('http://localhost:4696/api/me'))).toEqual({ email: 'dev@example.com' });
    expect(await dev.identify(new Request('http://127.0.0.1/api/me'))).toEqual({ email: 'dev@example.com' });
    expect(await dev.identify(new Request('http://go.localhost:4696/api/me'))).toEqual({ email: 'dev@example.com' });
  });

  it('ignores the bypass on non-localhost hosts', async () => {
    const dev = new DevIdentityProvider(deny, 'dev@example.com');
    expect(await dev.identify(new Request('https://go.example.com/api/me'))).toBeNull();
    expect(
      await dev.identify(new Request('https://go.example.com/api/me', { headers: { Host: 'localhost' } })),
    ).toBeNull();
    expect(await dev.identify(new Request('https://localhost.evil.com/api/me'))).toBeNull();
    expect(await dev.identify(new Request('https://go.localhost.example.com/api/me'))).toBeNull();
  });

  it('does nothing without a dev email', async () => {
    const dev = new DevIdentityProvider(deny, undefined);
    expect(await dev.identify(new Request('http://localhost:4696/api/me'))).toBeNull();
  });

  it('delegates to the real provider otherwise', async () => {
    const dev = new DevIdentityProvider(provider, 'dev@example.com');
    expect(await dev.identify(withHeader(await sign()))).toEqual({ email: 'alice@example.com' });
  });
});
