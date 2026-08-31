// Enforces the portability boundaries in docs/ARCHITECTURE.md: Cloudflare-specific APIs may
// only appear in the entry point and the Cloudflare/D1 adapters, and only app.ts may read c.env.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');

const cloudflareAllowed = ['src/worker.ts', 'src/adapters/cloudflare/', 'src/adapters/d1/'];
const cloudflarePatterns = [
  /\benv\.DB\b/,
  /\bD1Database\b/,
  /\bD1PreparedStatement\b/,
  /\.cf\b/,
  /\bIncomingRequestCfProperties\b/,
  /Cf-Access/i,
  /CF_Authorization/,
  /\bwaitUntil\b/,
  /\bExecutionContext\b/,
  /\benv\.ASSETS\b/,
  /\bHTMLRewriter\b/,
];

const cEnvAllowed = ['src/app.ts'];
const cEnvPattern = /\bc\.env\b/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const isAllowed = (file, allowed) => allowed.some((prefix) => file === prefix || file.startsWith(prefix));

const violations = [];
for (const path of walk(srcDir)) {
  const file = relative(root, path).split(sep).join('/');
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!isAllowed(file, cloudflareAllowed)) {
      for (const pattern of cloudflarePatterns) {
        if (pattern.test(line)) violations.push(`${file}:${i + 1} uses ${pattern}`);
      }
    }
    if (!isAllowed(file, cEnvAllowed) && cEnvPattern.test(line)) {
      violations.push(`${file}:${i + 1} reads c.env directly`);
    }
  });
}

if (violations.length > 0) {
  console.error('Portability boundary violations:\n' + violations.map((v) => `  ${v}`).join('\n'));
  process.exit(1);
}
console.log('Boundary check passed.');
