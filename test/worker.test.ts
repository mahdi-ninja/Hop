import { env, SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('responds ok on /health', async () => {
  const res = await SELF.fetch('https://go.example.com/health');
  expect(res.status).toBe(200);
  expect(await res.text()).toBe('ok');
});

it('redirects a link stored in D1 through the real worker', async () => {
  await env.DB.prepare(
    "INSERT INTO links (slug, url, created_at, updated_at) VALUES ('e2e', 'https://example.com/?a=1', 0, 0)",
  ).run();
  const res = await SELF.fetch('https://go.example.com/e2e?b=2', { redirect: 'manual' });
  expect(res.status).toBe(302);
  expect(res.headers.get('Location')).toBe('https://example.com/?a=1&b=2');
});
