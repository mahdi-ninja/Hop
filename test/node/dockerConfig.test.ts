import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  envLine,
  readPresetFile,
  autheliaUsersYaml,
  parseEnv,
  serializeEnv,
  validateDockerEnv,
  withSecrets,
} from '../../scripts/lib/docker-config.mjs';

const base = { SHORT_DOMAIN: 'go.acme.test', GEO_SOURCE: 'none' };

describe('.env round trip', () => {
  it('parses what it writes, quoting values Compose would otherwise interpolate', () => {
    const values = { ...base, OAUTH2_PROXY_CLIENT_SECRET: 'a$b c', CUSTOM: 'kept' };
    const text = serializeEnv(values);
    expect(text).toContain("OAUTH2_PROXY_CLIENT_SECRET='a$b c'");
    expect(text).toContain('CUSTOM=kept');
    expect(parseEnv(text)).toEqual(values);
  });

  it('ignores comments and blank lines and strips quotes', () => {
    expect(parseEnv('# c\n\nA=1\nB="two"\nC=\'three\'\nnot a line\n')).toEqual({ A: '1', B: 'two', C: 'three' });
  });
});

describe('withSecrets', () => {
  it('generates only the secrets the chosen provider needs and sets the profile', () => {
    const oauth = withSecrets({ ...base, AUTH_PROVIDER: 'oauth2-proxy' });
    expect(oauth).toMatchObject({ AUTH_MODE: 'proxy', COMPOSE_PROFILES: 'oauth2-proxy' });
    expect(oauth.PROXY_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(oauth.OAUTH2_PROXY_COOKIE_SECRET).toHaveLength(32);
    expect(oauth.AUTHELIA_SESSION_SECRET).toBeUndefined();

    const access = withSecrets({ ...base, AUTH_PROVIDER: 'access' });
    expect(access).toMatchObject({ AUTH_MODE: 'access', COMPOSE_PROFILES: 'access' });
    expect(access.PROXY_SECRET).toBeUndefined();
  });

  it('never replaces an existing secret', () => {
    const kept = withSecrets({ ...base, AUTH_PROVIDER: 'authelia', PROXY_SECRET: 'p'.repeat(40), AUTHELIA_SESSION_SECRET: 'keep' });
    expect(kept.PROXY_SECRET).toBe('p'.repeat(40));
    expect(kept.AUTHELIA_SESSION_SECRET).toBe('keep');
    expect(kept.AUTHELIA_STORAGE_ENCRYPTION_KEY!.length).toBeGreaterThanOrEqual(64);
  });
});

describe('validateDockerEnv', () => {
  const oauth = withSecrets({
    ...base,
    AUTH_PROVIDER: 'oauth2-proxy',
    OAUTH2_PROXY_CLIENT_ID: 'id',
    OAUTH2_PROXY_CLIENT_SECRET: 'secret',
  });

  it('accepts a complete oauth2-proxy setup with an allowlist', () => {
    expect(validateDockerEnv(oauth, { emails: '# people\nann@acme.test\n' })).toEqual([]);
    expect(validateDockerEnv({ ...oauth, OAUTH2_PROXY_EMAIL_DOMAINS: 'acme.test' }, { emails: '' })).toEqual([]);
  });

  it('refuses a setup nobody could sign in to', () => {
    expect(validateDockerEnv(oauth, { emails: '# empty\n' })).toEqual([expect.stringContaining('Nobody can sign in')]);
    expect(validateDockerEnv(oauth, {})).toContainEqual(expect.stringContaining('emails.txt is missing'));
  });

  it('flags mismatched profiles, short secrets and missing OIDC issuers', () => {
    const problems = validateDockerEnv(
      { ...oauth, COMPOSE_PROFILES: 'authelia', PROXY_SECRET: 'short', OAUTH2_PROXY_PROVIDER: 'oidc' },
      { emails: 'ann@acme.test' },
    );
    expect(problems).toEqual([
      expect.stringContaining('COMPOSE_PROFILES'),
      expect.stringContaining('PROXY_SECRET'),
      expect.stringContaining('OAUTH2_PROXY_OIDC_ISSUER_URL'),
    ]);
  });

  it('checks Authelia and Access setups', () => {
    const authelia = withSecrets({ ...base, AUTH_PROVIDER: 'authelia' });
    expect(validateDockerEnv(authelia, { autheliaUsers: 'users: {}' })).toEqual([]);
    expect(validateDockerEnv(authelia, {})).toEqual([expect.stringContaining('users.yml is missing')]);

    const access = withSecrets({
      ...base,
      AUTH_PROVIDER: 'access',
      ACCESS_TEAM_DOMAIN: 'https://acme.cloudflareaccess.com',
      ACCESS_AUD: 'a'.repeat(64),
      TUNNEL_TOKEN: 'token',
    });
    expect(validateDockerEnv(access)).toEqual([]);
    expect(validateDockerEnv({ ...access, ACCESS_TEAM_DOMAIN: 'acme', TUNNEL_TOKEN: '' })).toEqual([
      expect.stringContaining('ACCESS_TEAM_DOMAIN'),
      expect.stringContaining('TUNNEL_TOKEN'),
    ]);
  });

  it('rejects domains the Docker preset cannot serve', () => {
    expect(validateDockerEnv({ ...oauth, SHORT_DOMAIN: 'hop.acme.workers.dev' }, { emails: 'a@b.c' })).toEqual([
      expect.stringContaining('workers.dev'),
    ]);
    expect(validateDockerEnv({ ...oauth, SHORT_DOMAIN: 'https://go.acme.test' }, { emails: 'a@b.c' })).toEqual([
      expect.stringContaining('bare hostname'),
    ]);
  });
});

describe('Authelia users file', () => {
  it('keys the user by their lower-cased email so the email is the only sign-in name', () => {
    const yaml = autheliaUsersYaml({ email: " Ann.O'Neil@Acme.test ", hash: '$argon2id$v=19$abc' });
    expect(yaml).toContain("\n  'ann.o''neil@acme.test':\n");
    expect(yaml).toContain("    email: 'ann.o''neil@acme.test'\n");
    expect(yaml).toContain("    password: '$argon2id$v=19$abc'\n");
  });
});

describe('guards for values and files', () => {
  it("refuses a value with a single quote, which .env files can't hold", () => {
    expect(envLine('A', 'plain')).toBe('A=plain');
    expect(envLine('A', 'a b')).toBe("A='a b'");
    expect(() => envLine('A', "it's")).toThrow(/single quote/);
  });

  it('reads preset files, and explains a directory Docker created in their place', () => {
    const root = mkdtempSync(join(tmpdir(), 'hop-preset-'));
    writeFileSync(join(root, 'emails.txt'), 'a@b.c\n');
    mkdirSync(join(root, 'users.yml'));
    expect(readPresetFile(root, 'emails.txt')).toBe('a@b.c\n');
    expect(readPresetFile(root, 'missing.txt')).toBeUndefined();
    expect(() => readPresetFile(root, 'users.yml')).toThrow(/is a directory/);
  });

  it('flags Authelia users whose key is not lower case, which stops Authelia from starting', () => {
    const authelia = withSecrets({ ...base, AUTH_PROVIDER: 'authelia' });
    const users = "users:\n  'Ann@Acme.test':\n    email: 'Ann@Acme.test'\n  'bob@acme.test':\n    email: 'bob@acme.test'\n";
    expect(validateDockerEnv(authelia, { autheliaUsers: users })).toEqual([expect.stringContaining('Ann@Acme.test')]);
  });
});
