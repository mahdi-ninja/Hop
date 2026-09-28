import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessAppBody, createApi, findHopApp, includeRules, teamCanSignIn } from '../scripts/lib/cloudflare-api.mjs';

describe('accessAppBody', () => {
  it('protects only /admin and /api, with a Lax HttpOnly cookie and an allow policy', () => {
    expect(accessAppBody({ shortDomain: 'hop.acme.workers.dev', allowed: ['@acme.test', 'ann@else.test'], sessionDuration: '24h' })).toEqual({
      name: 'Hop (hop.acme.workers.dev)',
      type: 'self_hosted',
      domain: 'hop.acme.workers.dev/admin',
      destinations: [
        { type: 'public', uri: 'hop.acme.workers.dev/admin' },
        { type: 'public', uri: 'hop.acme.workers.dev/api' },
      ],
      session_duration: '24h',
      app_launcher_visible: false,
      same_site_cookie_attribute: 'lax',
      http_only_cookie_attribute: true,
      policies: [
        {
          name: 'Hop team',
          decision: 'allow',
          include: [{ email_domain: { domain: 'acme.test' } }, { email: { email: 'ann@else.test' } }],
        },
      ],
    });
  });

  it('treats bare domains as email domains', () => {
    expect(includeRules(['acme.test'])).toEqual([{ email_domain: { domain: 'acme.test' } }]);
  });
});

describe('findHopApp', () => {
  it('finds the app protecting the dashboard path, however the API lists it', () => {
    const apps = [
      { id: 'other', destinations: [{ uri: 'go.acme.test/internal' }] },
      { id: 'hop', destinations: [{ uri: 'go.acme.test/admin/*' }] },
    ];
    expect(findHopApp(apps, 'go.acme.test')?.id).toBe('hop');
    expect(findHopApp([{ id: 'legacy', domain: 'go.acme.test/admin' }], 'go.acme.test')?.id).toBe('legacy');
    expect(findHopApp(apps, 'links.acme.test')).toBeNull();
  });
});

describe('teamCanSignIn', () => {
  it("is false when Cloudflare's own account login is the only method", () => {
    expect(teamCanSignIn([])).toBe(false);
    expect(teamCanSignIn([{ type: 'cloudflare', name: 'Cloudflare' }])).toBe(false);
  });

  it('is true once One-time PIN or another provider exists', () => {
    expect(teamCanSignIn([{ type: 'cloudflare' }, { type: 'onetimepin', name: 'One-time PIN' }])).toBe(true);
    expect(teamCanSignIn([{ type: 'github' }])).toBe(true);
  });
});

describe('getWorkersSubdomain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const reply = (status: number, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  it("reads the account's subdomain with the token", async () => {
    const fetchSpy = reply(200, { success: true, result: { subdomain: 'acme' } });
    expect(await createApi('t0ken').getWorkersSubdomain('acct')).toBe('acme');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct/workers/subdomain',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer t0ken' }) }),
    );
  });

  it('returns null when the account has not registered a subdomain', async () => {
    reply(404, { success: false, errors: [{ code: 10007, message: 'workers.api.error.subdomain_not_found' }] });
    expect(await createApi('t0ken').getWorkersSubdomain('acct')).toBeNull();
  });

  it('reports a token without Workers permission as an error', async () => {
    reply(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
    await expect(createApi('t0ken').getWorkersSubdomain('acct')).rejects.toThrow(/403.*Authentication error/);
  });
});
