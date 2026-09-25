import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { AccessIdentityProvider } from '../src/adapters/cloudflare/access';
import { DevIdentityProvider } from '../src/adapters/dev/devIdentity';
import { createIdentity } from '../src/worker';

const configured = {
  ...env,
  ACCESS_TEAM_DOMAIN: 'https://acme.cloudflareaccess.com',
  ACCESS_AUD: 'a'.repeat(64),
  DEV_AUTH_EMAIL: 'dev@example.com',
};

describe('createIdentity', () => {
  it('never includes the local sign-in shortcut when Access is configured', async () => {
    const identity = createIdentity(configured);
    expect(identity).toBeInstanceOf(AccessIdentityProvider);
    expect(await identity.identify(new Request('http://localhost:4696/api/me'))).toBeNull();
  });

  it('uses the local shortcut while Access is unconfigured', async () => {
    const identity = createIdentity({ ...env, DEV_AUTH_EMAIL: 'dev@example.com' });
    expect(identity).toBeInstanceOf(DevIdentityProvider);
    expect(await identity.identify(new Request('http://go.localhost:4696/api/me'))).toEqual({ email: 'dev@example.com' });
  });

  it('treats an empty or scheme-less team domain as unconfigured instead of crashing', () => {
    for (const teamDomain of ['', 'acme.cloudflareaccess.com']) {
      expect(() => createIdentity({ ...configured, ACCESS_TEAM_DOMAIN: teamDomain })).not.toThrow();
      expect(createIdentity({ ...configured, ACCESS_TEAM_DOMAIN: teamDomain })).toBeInstanceOf(DevIdentityProvider);
    }
  });
});
