import type { Services } from '../../src/core/ports';
import { FakeLinkStore } from './linkStore';

export interface FakeServices extends Services {
  links: FakeLinkStore;
  deferred: Promise<unknown>[];
  settle(): Promise<void>;
}

function notImplemented(): never {
  throw new Error('Not implemented in fake');
}

export function createFakeServices(overrides: Partial<Services> = {}): FakeServices {
  const deferred: Promise<unknown>[] = [];
  const services: FakeServices = {
    links: new FakeLinkStore(),
    visits: {
      record: notImplemented,
      linkStats: notImplemented,
      recentVisits: notImplemented,
      overview: notImplemented,
    },
    geo: { lookup: async () => ({ country: null, region: null, city: null }) },
    identity: { identify: async () => null },
    assets: { fetch: async () => new Response('asset', { status: 200 }) },
    config: { shortDomain: 'go.example.com', rootRedirectUrl: null },
    deferred,
    defer: (p) => {
      deferred.push(p);
    },
    async settle() {
      await Promise.allSettled(deferred);
    },
    ...overrides,
  } as FakeServices;
  return services;
}
