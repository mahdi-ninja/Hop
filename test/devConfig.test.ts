import { describe, expect, it } from 'vitest';
import wranglerSource from '../wrangler.jsonc?raw';
import { parseJsonc } from '../scripts/lib/hop-config.mjs';

const wrangler = parseJsonc(wranglerSource) as {
  dev: { host: string; port: number };
  vars: { SHORT_DOMAIN: string };
  workers_dev: boolean;
  preview_urls: boolean;
};

describe('wrangler.jsonc template', () => {
  it('keeps the local short domain, dev host and dev port in step', () => {
    expect(wrangler.dev.host).toBe(`go.localhost:${wrangler.dev.port}`);
    expect(wrangler.vars.SHORT_DOMAIN).toBe(wrangler.dev.host);
  });

  it('never exposes the Worker on workers.dev or preview URLs', () => {
    expect(wrangler.workers_dev).toBe(false);
    expect(wrangler.preview_urls).toBe(false);
  });
});
