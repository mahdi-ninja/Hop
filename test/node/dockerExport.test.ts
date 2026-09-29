import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeImages, withSecrets } from '../../scripts/lib/docker-config.mjs';
import { deploySteps, quotedKeys, renderCaddyfile, renderStack, stackEnv } from '../../scripts/lib/docker-export.mjs';

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const images = composeImages(repoFile('compose.yaml'));

function files(provider: string, geo = 'none') {
  return {
    caddyfile: repoFile('docker/caddy/Caddyfile'),
    authSnippet: provider === 'access' ? '' : repoFile(`docker/caddy/auth-${provider}.caddy`),
    geoSnippet: repoFile(`docker/caddy/geo-${geo}.caddy`),
    autheliaConfig: repoFile('docker/authelia/configuration.yml'),
    autheliaUsers: "users:\n  'ann@acme.test':\n    email: 'ann@acme.test'\n    password: '$argon2id$v=19$m=65536,t=3,p=4$abc$def'\n",
    emails: 'ann@acme.test\n',
  };
}

const env = (provider: string) => withSecrets({ SHORT_DOMAIN: 'go.acme.test', GEO_SOURCE: 'none', AUTH_PROVIDER: provider });

describe('renderCaddyfile', () => {
  it('inlines the chosen snippets and fills in the domain, keeping the secret a placeholder', () => {
    const out = renderCaddyfile({ ...files('authelia'), shortDomain: 'go.acme.test' });
    expect(out).toContain('go.acme.test {');
    expect(out).toContain('forward_auth authelia:9091');
    expect(out).toContain('request_header -CF-IPCountry');
    expect(out).toContain('{$PROXY_SECRET}');
    expect(out).not.toMatch(/import (geo|auth)-/);
    expect(out).not.toContain('{$SHORT_DOMAIN}');
  });

  it('drops a comment-only geo snippet', () => {
    const out = renderCaddyfile({ ...files('oauth2-proxy', 'cloudflare'), shortDomain: 'go.acme.test' });
    expect(out).not.toContain('CF-IPCountry');
    expect(out).toContain('uri /oauth2/auth');
  });
});

describe('renderStack', () => {
  it('uses the published image and only the chosen provider, with no profiles or bind mounts', () => {
    const stack = renderStack({ images, env: env('authelia'), files: files('authelia') });
    expect(stack).toContain('image: ghcr.io/mahdi-ninja/hop:latest');
    expect(stack).toContain('authelia:\n    image: authelia/authelia:4.39');
    expect(stack).not.toMatch(/oauth2-proxy:|cloudflared:|profiles:|build:|\.\/docker/);
    // Portainer names the project after the stack; the CLI after the folder, so it can't clash
    // with the repo's own `hop` project on the same host.
    expect(stack).not.toMatch(/^name:/m);
  });

  it('escapes dollars in inlined files so Compose leaves password hashes alone', () => {
    const stack = renderStack({ images, env: env('authelia'), files: files('authelia') });
    expect(stack).toContain("password: '$$argon2id$$v=19$$m=65536,t=3,p=4$$abc$$def'");
    expect(stack).toContain('header_up X-Hop-Proxy-Secret {$$PROXY_SECRET}');
    expect(stack).toContain("authelia_url: 'https://go.acme.test/authelia'");
  });

  it('keeps secrets out of the stack file and in the env file', () => {
    const values = env('oauth2-proxy');
    const stack = renderStack({ images, env: values, files: files('oauth2-proxy'), image: 'registry.test/hop:1.2.3' });
    expect(stack).toContain('image: registry.test/hop:1.2.3');
    expect(stack).toContain('OAUTH2_PROXY_REDIRECT_URL: https://go.acme.test/oauth2/callback');
    expect(stack).not.toContain(values.PROXY_SECRET!);
    expect(stack).not.toContain(values.OAUTH2_PROXY_COOKIE_SECRET!);
    const envFile = stackEnv(values);
    expect(envFile).toContain(`PROXY_SECRET=${values.PROXY_SECRET}`);
    expect(envFile).toContain('AUTH_MODE=proxy');
    expect(envFile).not.toContain('AUTHELIA_');
  });

  it('runs cloudflared instead of Caddy for Access', () => {
    const stack = renderStack({
      images,
      env: { ...env('access'), ACCESS_TEAM_DOMAIN: 'https://acme.cloudflareaccess.com', ACCESS_AUD: 'a'.repeat(64), TUNNEL_TOKEN: 't' },
      files: files('access'),
    });
    expect(stack).toContain('cloudflared:');
    expect(stack).not.toMatch(/caddy|configs:|PROXY_SECRET/);
    expect(stackEnv({ ...env('access'), TUNNEL_TOKEN: 't' })).toContain('TUNNEL_TOKEN=t');
  });
});

describe('deploySteps', () => {
  const access = {
    ...env('access'),
    GEO_SOURCE: 'cloudflare',
    ACCESS_TEAM_DOMAIN: 'https://acme.cloudflareaccess.com',
    ACCESS_AUD: 'a'.repeat(64),
    TUNNEL_TOKEN: 't',
  };

  it('tells an Access deployment how to route the tunnel and protect the dashboard', () => {
    const steps = deploySteps(access).join('\n');
    expect(steps).toContain('go.acme.test, service HTTP, URL hop:8787');
    expect(steps).toContain('go.acme.test/admin and go.acme.test/api');
    expect(steps).toContain('Add visitor location headers');
    expect(steps).toContain('one place only');
    expect(deploySteps({ ...access, GEO_SOURCE: 'none' }).join('\n')).not.toContain('Managed Transforms');
  });

  it('gives oauth2-proxy the callback URL and Authelia the sign-in emails', () => {
    expect(deploySteps(env('oauth2-proxy')).join('\n')).toContain('https://go.acme.test/oauth2/callback');
    const authelia = deploySteps(env('authelia'), { autheliaUsers: files('authelia').autheliaUsers }).join('\n');
    expect(authelia).toContain('ports 80 and 443');
    expect(authelia).toContain('with your email (ann@acme.test)');
  });

  it('writes the steps at the top of the exported stack', () => {
    const stack = renderStack({ images, env: access, files: files('access') });
    const header = stack.slice(0, stack.indexOf('services:'));
    expect(header).toContain('# Outside this stack, before it works:');
    expect(header).toMatch(/^#   1\. In Zero Trust, add a public hostname/m);
    expect(header.split('\n').filter(Boolean).every((line) => line.startsWith('#'))).toBe(true);
  });
});

describe('pinned images', () => {
  it('reads every service image from compose.yaml, and the export uses those pins', () => {
    expect(Object.keys(images).sort()).toEqual(['authelia', 'caddy', 'cloudflared', 'hop', 'oauth2-proxy']);
    const stack = renderStack({ images, env: env('oauth2-proxy'), files: files('oauth2-proxy') });
    expect(stack).toContain(`image: ${images.caddy}`);
    expect(stack).toContain(`image: ${images['oauth2-proxy']}`);
  });

  it('refuses to export when compose.yaml lacks an image the option needs', () => {
    expect(() => renderStack({ images: { caddy: 'caddy:2' }, env: env('authelia'), files: files('authelia') })).toThrow(/authelia/);
  });
});

describe('stack.env quoting', () => {
  it('quotes pasted values Compose would otherwise interpolate or cut, and reports them', () => {
    const values = { ...env('oauth2-proxy'), OAUTH2_PROXY_CLIENT_SECRET: 'a$b c#d' };
    expect(stackEnv(values)).toContain("OAUTH2_PROXY_CLIENT_SECRET='a$b c#d'");
    expect(quotedKeys(values)).toEqual(['OAUTH2_PROXY_CLIENT_SECRET']);
    expect(quotedKeys(env('oauth2-proxy'))).toEqual([]);
  });
});
