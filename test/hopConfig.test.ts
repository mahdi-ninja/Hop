import { describe, expect, it } from 'vitest';
import {
  buildDeployConfig,
  isPlaceholder,
  isWorkersDevHost,
  normalizeHostname,
  normalizeTeamDomain,
  parseJsonc,
  validateHopConfig,
  type HopConfig,
} from '../scripts/lib/hop-config.mjs';

const valid: HopConfig = {
  accountId: '0123456789abcdef0123456789abcdef',
  shortDomain: 'go.acme.test',
  rootRedirectUrl: '',
  database: { name: 'hop', id: '11111111-2222-4333-8444-555555555555' },
  access: { teamDomain: 'https://acme.cloudflareaccess.com', aud: 'a'.repeat(64) },
};

describe('parseJsonc', () => {
  it('strips comments and trailing commas but keeps strings intact', () => {
    expect(
      parseJsonc(`{
        // line comment
        "url": "https://x.test/a//b", /* block */
        "list": [1, 2,],
      }`),
    ).toEqual({ url: 'https://x.test/a//b', list: [1, 2] });
  });

  it('parses the real wrangler.jsonc shape', () => {
    expect(parseJsonc('{ "name": "hop", "vars": { "A": "\\"quoted\\"" } }')).toEqual({ name: 'hop', vars: { A: '"quoted"' } });
  });
});

describe('normalizers', () => {
  it('normalizes hostnames and team domains', () => {
    expect(normalizeHostname(' https://Go.Acme.Test/admin ')).toBe('go.acme.test');
    expect(normalizeTeamDomain('acme')).toBe('https://acme.cloudflareaccess.com');
    expect(normalizeTeamDomain('https://acme.cloudflareaccess.com/')).toBe('https://acme.cloudflareaccess.com');
  });

  it('recognizes placeholders', () => {
    expect(isPlaceholder('your-access-application-aud-tag')).toBe(true);
    expect(isPlaceholder('go.example.com')).toBe(true);
    expect(isPlaceholder('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isPlaceholder('go.localhost:4696')).toBe(true);
    expect(isPlaceholder('localhost')).toBe(true);
    expect(isPlaceholder('go.acme.test')).toBe(false);
  });
});

describe('validateHopConfig', () => {
  it('accepts a complete config', () => {
    expect(validateHopConfig(valid)).toEqual([]);
  });

  it('rejects the local dev domain as a production domain', () => {
    expect(validateHopConfig({ ...valid, shortDomain: 'go.localhost' })).toHaveLength(1);
  });

  it('reports each missing or placeholder value', () => {
    const problems = validateHopConfig({
      accountId: 'nope',
      shortDomain: 'go.example.com',
      rootRedirectUrl: 'ftp://x',
      database: { name: '', id: '00000000-0000-0000-0000-000000000000' },
      access: { teamDomain: 'https://your-team.cloudflareaccess.com', aud: 'short' },
    });
    expect(problems).toHaveLength(7);
  });
});

describe('workers.dev addresses', () => {
  it('recognizes workers.dev hosts', () => {
    expect(isWorkersDevHost('hop.acme.workers.dev')).toBe(true);
    expect(isWorkersDevHost('go.acme.test')).toBe(false);
    expect(isWorkersDevHost('workers.dev.evil.test')).toBe(false);
  });

  it("requires the Worker's own name as the first label", () => {
    expect(validateHopConfig({ ...valid, shortDomain: 'hop.acme.workers.dev' })).toEqual([]);
    expect(validateHopConfig({ ...valid, shortDomain: 'links.acme.workers.dev' })).toHaveLength(1);
    expect(validateHopConfig({ ...valid, shortDomain: 'links.acme.workers.dev' }, { workerName: 'links' })).toEqual([]);
  });
});

describe('buildDeployConfig', () => {
  const template = {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: 'hop',
    main: 'src/worker.ts',
    workers_dev: false,
    dev: { host: 'localhost' },
    routes: [{ pattern: 'go.example.com', custom_domain: true }],
    assets: { directory: './public', binding: 'ASSETS', run_worker_first: true },
    d1_databases: [{ binding: 'DB', database_name: 'hop', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: 'migrations' }],
    vars: { SHORT_DOMAIN: 'go.example.com', ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'y', ROOT_REDIRECT_URL: '' },
  };

  it('fills in deployment values and rebases paths for .wrangler/deploy/', () => {
    const out = buildDeployConfig(template, { ...valid, rootRedirectUrl: 'https://acme.test' });
    expect(out).toMatchObject({
      account_id: valid.accountId,
      main: '../../src/worker.ts',
      workers_dev: false,
      routes: [{ pattern: 'go.acme.test', custom_domain: true }],
      assets: { directory: '../../public' },
      d1_databases: [{ binding: 'DB', database_name: 'hop', database_id: valid.database.id, migrations_dir: '../../migrations' }],
      vars: {
        SHORT_DOMAIN: 'go.acme.test',
        ACCESS_TEAM_DOMAIN: 'https://acme.cloudflareaccess.com',
        ACCESS_AUD: 'a'.repeat(64),
        ROOT_REDIRECT_URL: 'https://acme.test',
      },
    });
    expect(out).not.toHaveProperty('$schema');
    expect(out).not.toHaveProperty('dev');
    expect(template.routes[0]?.pattern).toBe('go.example.com');
  });

  it('turns workers.dev on and drops the custom-domain route for a workers.dev address', () => {
    const out = buildDeployConfig(template, { ...valid, shortDomain: 'hop.acme.workers.dev' });
    expect(out.workers_dev).toBe(true);
    expect(out.preview_urls).toBe(false);
    expect(out).not.toHaveProperty('routes');
    expect(out).toMatchObject({ vars: { SHORT_DOMAIN: 'hop.acme.workers.dev' } });
  });

  it('keeps workers.dev off for a custom domain even if the template changes', () => {
    const out = buildDeployConfig({ ...template, workers_dev: true, preview_urls: true }, valid);
    expect(out.workers_dev).toBe(false);
    expect(out.preview_urls).toBe(false);
  });
});
