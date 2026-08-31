import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('responds ok on /health', async () => {
  const res = await SELF.fetch('https://go.example.com/health');
  expect(res.status).toBe(200);
  expect(await res.text()).toBe('ok');
});
