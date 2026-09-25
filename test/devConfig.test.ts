import { describe, expect, it } from 'vitest';
import wranglerSource from '../wrangler.jsonc?raw';
import { parseJsonc } from '../scripts/lib/hop-config.mjs';

const wrangler = parseJsonc(wranglerSource) as {
  dev: { host?: string; port: number };
  routes?: unknown;
  vars: { SHORT_DOMAIN: string };
  workers_dev: boolean;
  preview_urls: boolean;
};

describe('wrangler.jsonc template', () => {
  it('keeps the local short domain and dev port in step', () => {
    expect(wrangler.vars.SHORT_DOMAIN).toBe(`go.localhost:${wrangler.dev.port}`);
  });

  it('sets no dev.host or route, so the Worker sees the real Host header locally', () => {
    expect(wrangler.dev.host).toBeUndefined();
    expect(wrangler.routes).toBeUndefined();
  });

  it('never exposes the Worker on workers.dev or preview URLs', () => {
    expect(wrangler.workers_dev).toBe(false);
    expect(wrangler.preview_urls).toBe(false);
  });
});
