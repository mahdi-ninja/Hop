import { createApp } from './app';
import { CloudflareGeoLookup } from './adapters/cloudflare/geo';
import { D1LinkStore } from './adapters/d1/linkStore';
import type { Services } from './core/ports';

interface WorkerEnv extends Env {
  DEV_AUTH_EMAIL?: string;
}

const app = createApp();
const geo = new CloudflareGeoLookup();

function notImplemented(): never {
  throw new Error('Not implemented yet');
}

function buildServices(env: WorkerEnv, ctx: ExecutionContext): Services {
  return {
    links: new D1LinkStore(env.DB),
    visits: {
      record: notImplemented,
      linkStats: notImplemented,
      recentVisits: notImplemented,
      overview: notImplemented,
    },
    geo,
    identity: { identify: async () => null },
    defer: (p) => ctx.waitUntil(p),
    assets: { fetch: (req) => env.ASSETS.fetch(req) },
    config: {
      shortDomain: env.SHORT_DOMAIN,
      rootRedirectUrl: env.ROOT_REDIRECT_URL || null,
    },
  };
}

export default {
  fetch(req, env, ctx) {
    return app.fetch(req, { services: buildServices(env, ctx) }, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;
