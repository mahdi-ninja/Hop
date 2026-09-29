import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
            },
          })),
        ],
        test: {
          name: 'workers',
          include: ['test/**/*.test.ts'],
          exclude: ['test/node/**'],
          setupFiles: ['./test/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          include: ['test/node/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
