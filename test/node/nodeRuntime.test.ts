import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { staticAssets } from '../../src/adapters/node/assets';
import { BackgroundTasks } from '../../src/adapters/node/background';
import { readNodeConfig } from '../../src/adapters/node/config';

const SECRET = 'x'.repeat(32);

describe('readNodeConfig', () => {
  it('reads a proxy deployment with defaults', () => {
    expect(readNodeConfig({ SHORT_DOMAIN: 'Go.Example.com', AUTH_MODE: 'proxy', PROXY_SECRET: SECRET })).toEqual({
      shortDomain: 'go.example.com',
      rootRedirectUrl: null,
      auth: { mode: 'proxy', secret: SECRET },
      geoSource: 'none',
      databasePath: '/data/hop.db',
      port: 8787,
    });
  });

  it('reads an Access deployment', () => {
    const config = readNodeConfig({
      SHORT_DOMAIN: 'go.example.com',
      AUTH_MODE: 'access',
      ACCESS_TEAM_DOMAIN: 'https://acme.cloudflareaccess.com/',
      ACCESS_AUD: 'aud-tag',
      GEO_SOURCE: 'cloudflare',
      ROOT_REDIRECT_URL: 'https://example.com/',
      PORT: '9000',
    });
    expect(config).toMatchObject({
      auth: { mode: 'access', teamDomain: 'https://acme.cloudflareaccess.com', audience: 'aud-tag' },
      geoSource: 'cloudflare',
      rootRedirectUrl: 'https://example.com/',
      port: 9000,
    });
  });

  it('lists every problem at once', () => {
    const read = () =>
      readNodeConfig({ SHORT_DOMAIN: 'https://go.example.com', AUTH_MODE: 'proxy', PROXY_SECRET: 'short', GEO_SOURCE: 'maxmind', PORT: 'x' });
    expect(read).toThrow(/SHORT_DOMAIN[\s\S]*PROXY_SECRET[\s\S]*GEO_SOURCE[\s\S]*PORT/);
  });

  it('rejects a missing auth mode and placeholder Access values', () => {
    expect(() => readNodeConfig({ SHORT_DOMAIN: 'go.example.com' })).toThrow(/AUTH_MODE/);
    expect(() =>
      readNodeConfig({
        SHORT_DOMAIN: 'go.example.com',
        AUTH_MODE: 'access',
        ACCESS_TEAM_DOMAIN: 'https://your-team.cloudflareaccess.com',
        ACCESS_AUD: 'your-access-application-aud-tag',
      }),
    ).toThrow(/ACCESS_TEAM_DOMAIN[\s\S]*ACCESS_AUD/);
  });
});

describe('staticAssets', () => {
  const root = mkdtempSync(join(tmpdir(), 'hop-public-'));
  mkdirSync(join(root, 'admin', 'assets'), { recursive: true });
  writeFileSync(join(root, 'admin', 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'admin', 'assets', 'app-abc123.js'), 'console.log(1)');
  const assets = staticAssets(root);
  const get = (path: string) => assets.fetch(new Request(`https://go.example.com${path}`));

  it('serves the SPA entry for the directory and caches only hashed assets', async () => {
    const index = await get('/admin/');
    expect(index.status).toBe(200);
    expect(index.headers.get('Content-Type')).toContain('text/html');
    expect(index.headers.get('Cache-Control')).toBe('no-cache');
    expect((await get('/admin/assets/app-abc123.js')).headers.get('Cache-Control')).toContain('immutable');
  });

  it('answers 404 for misses and path traversal', async () => {
    expect((await get('/admin/links')).status).toBe(404);
    expect((await get('/admin/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404);
  });
});

describe('BackgroundTasks', () => {
  it('logs failures instead of rejecting, and drain waits for pending work', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tasks = new BackgroundTasks();
    let finished = false;
    tasks.defer(Promise.reject(new Error('boom')));
    tasks.defer(new Promise<void>((resolve) => setTimeout(() => {
      finished = true;
      resolve();
    }, 20)));
    await tasks.drain(1000);
    expect(finished).toBe(true);
    expect(error).toHaveBeenCalledWith('Background task failed', expect.any(Error));
    error.mockRestore();
  });

  it('stops waiting after the timeout', async () => {
    const tasks = new BackgroundTasks();
    tasks.defer(new Promise(() => {}));
    const started = Date.now();
    await tasks.drain(30);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
