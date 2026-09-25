import { createApp } from './app';
import { AccessIdentityProvider } from './adapters/cloudflare/access';
import { CloudflareGeoLookup } from './adapters/cloudflare/geo';
import { D1LinkStore } from './adapters/d1/linkStore';
import { D1VisitStore } from './adapters/d1/visitStore';
import { DevIdentityProvider } from './adapters/dev/devIdentity';
import type { IdentityProvider, Services } from './core/ports';

// Omit keeps this valid whether or not `wrangler types` picked DEV_AUTH_EMAIL up from a local .dev.vars.
interface WorkerEnv extends Omit<Env, 'DEV_AUTH_EMAIL'> {
  DEV_AUTH_EMAIL?: string;
}

const app = createApp();

const isPlaceholder = (value: string | undefined) => !value || value.includes('your-');
const isAccessConfigured = (env: WorkerEnv) =>
  !isPlaceholder(env.ACCESS_AUD) && !isPlaceholder(env.ACCESS_TEAM_DOMAIN) && env.ACCESS_TEAM_DOMAIN.startsWith('https://');

const nobody: IdentityProvider = { identify: async () => null };
const geo = new CloudflareGeoLookup();

/**
 * A deployment with real Access values only ever verifies Access tokens. The local sign-in
 * shortcut exists only while Access is unconfigured, which is the local-dev template.
 */
export function createIdentity(env: WorkerEnv): IdentityProvider {
  if (isAccessConfigured(env)) {
    return new AccessIdentityProvider({ teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
  }
  return new DevIdentityProvider(nobody, env.DEV_AUTH_EMAIL);
}

function buildServices(env: WorkerEnv, ctx: ExecutionContext): Services {
  return {
    links: new D1LinkStore(env.DB),
    visits: new D1VisitStore(env.DB),
    geo,
    identity: createIdentity(env),
    defer: (p) => ctx.waitUntil(p),
    assets: { fetch: (req) => env.ASSETS.fetch(req) },
    config: {
      shortDomain: env.SHORT_DOMAIN,
      rootRedirectUrl: env.ROOT_REDIRECT_URL || null,
      accessConfigured: isAccessConfigured(env),
    },
  };
}

export default {
  fetch(req, env, ctx) {
    return app.fetch(req, { services: buildServices(env, ctx) }, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;
