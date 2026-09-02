import { createApp } from './app';
import { CloudflareGeoLookup } from './adapters/cloudflare/geo';
import { D1LinkStore } from './adapters/d1/linkStore';
import { D1VisitStore } from './adapters/d1/visitStore';
import type { Services } from './core/ports';

interface WorkerEnv extends Env {
  DEV_AUTH_EMAIL?: string;
}

const app = createApp();
const geo = new CloudflareGeoLookup();

function buildServices(env: WorkerEnv, ctx: ExecutionContext): Services {
  return {
    links: new D1LinkStore(env.DB),
    visits: new D1VisitStore(env.DB),
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
