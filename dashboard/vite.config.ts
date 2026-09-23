import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { parseJsonc } from '../scripts/lib/hop-config.mjs';

// The Worker's dev port lives in wrangler.jsonc; reading it here keeps the /api proxy in step.
const wrangler = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')) as {
  dev?: { port?: number };
};
const workerPort = wrangler.dev?.port ?? 4696;

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
  },
  server: {
    port: 4697,
    // Fail loudly instead of moving to another port, which would break the dev URLs.
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${workerPort}`,
    },
  },
});
