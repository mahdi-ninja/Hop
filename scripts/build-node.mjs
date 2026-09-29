// Bundles the Docker/Node entry point and its dependencies into one file, so the runtime image
// needs no node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/node.ts'],
  outfile: 'dist/node.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});
