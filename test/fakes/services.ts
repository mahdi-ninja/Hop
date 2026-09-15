import type { Services } from '../../src/core/ports';
import { FakeLinkStore } from './linkStore';
import { FakeVisitStore } from './visitStore';

export interface FakeServices extends Services {
  links: FakeLinkStore;
  visits: FakeVisitStore;
  settle(): Promise<void>;
}

export function createFakeServices(overrides: Partial<Omit<Services, 'links' | 'visits'>> = {}): FakeServices {
  const deferred: Promise<unknown>[] = [];
  const links = new FakeLinkStore();
  return {
    links,
    visits: new FakeVisitStore(links),
    geo: { lookup: async () => ({ continent: null, country: null, region: null, city: null }) },
    identity: { identify: async () => null },
    assets: { fetch: async () => new Response('asset', { status: 200 }) },
    config: { shortDomain: 'go.example.com', rootRedirectUrl: null },
    defer: (p) => {
      deferred.push(p);
    },
    async settle() {
      await Promise.allSettled(deferred);
    },
    ...overrides,
  };
}
