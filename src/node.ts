import { serve } from '@hono/node-server';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessIdentityProvider } from './adapters/cloudflare/access';
import { staticAssets } from './adapters/node/assets';
import { BackgroundTasks } from './adapters/node/background';
import { readNodeConfig, type NodeConfig } from './adapters/node/config';
import { CloudflareHeaderGeoLookup, noGeo } from './adapters/proxy/geo';
import { TrustedHeaderIdentityProvider } from './adapters/proxy/identity';
import { SqlLinkStore } from './adapters/sql/linkStore';
import { SqlVisitStore } from './adapters/sql/visitStore';
import { applyMigrations, openDatabase } from './adapters/sqlite/database';
import { SqliteRunner } from './adapters/sqlite/runner';
import { createApp } from './app';
import type { IdentityProvider, Services } from './core/ports';

const SHUTDOWN_GRACE_MS = 5000;

// Bundled to dist/node.mjs; migrations/ and public/ sit next to dist/ in the repo and the image.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createIdentity(auth: NodeConfig['auth']): IdentityProvider {
  return auth.mode === 'proxy'
    ? new TrustedHeaderIdentityProvider(auth.secret)
    : new AccessIdentityProvider({ teamDomain: auth.teamDomain, audience: auth.audience });
}

function loadConfig(): NodeConfig {
  try {
    return readNodeConfig(process.env);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

const config = loadConfig();
const db = openDatabase(config.databasePath);
for (const name of applyMigrations(db, join(root, 'migrations'))) console.log(`Applied migration ${name}`);

const tasks = new BackgroundTasks();
const runner = new SqliteRunner(db);
const services: Services = {
  links: new SqlLinkStore(runner),
  visits: new SqlVisitStore(runner),
  geo: config.geoSource === 'cloudflare' ? new CloudflareHeaderGeoLookup() : noGeo,
  identity: createIdentity(config.auth),
  defer: tasks.defer,
  assets: staticAssets(join(root, 'public')),
  config: { shortDomain: config.shortDomain, rootRedirectUrl: config.rootRedirectUrl, authConfigured: true },
};

const app = createApp();
const server = serve({ fetch: (req) => app.fetch(req, { services }), port: config.port }, (info) => {
  console.log(`Hop is listening on port ${info.port} for https://${config.shortDomain} (auth: ${config.auth.mode}, geo: ${config.geoSource})`);
});

// In-flight requests and the visits they defer both need the database, so it closes last.
async function shutdown(signal: string) {
  console.log(`${signal} received, finishing requests and background work`);
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  await Promise.race([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
  ]);
  await tasks.drain(Math.max(0, deadline - Date.now()));
  db.close();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
