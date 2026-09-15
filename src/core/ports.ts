import type { Config, Geo, Identity, Link, LinkStats, NewVisit, Overview, Range, RoutingRule, Visit } from './types';

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Slug already in use: ${slug}`);
    this.name = 'SlugTakenError';
  }
}

export interface LinkPatch {
  url?: string;
  title?: string | null;
  rules?: RoutingRule[];
}

export interface LinkStore {
  getBySlug(slug: string): Promise<Link | null>;
  list(q: { search?: string; cursor?: string; limit: number }): Promise<{ items: Link[]; nextCursor: string | null }>;
  /** @throws SlugTakenError */
  create(input: { slug: string; url: string; title: string | null; by: string }): Promise<Link>;
  update(slug: string, patch: LinkPatch, by: string): Promise<Link | null>;
  /** Also deletes the link's visits. */
  delete(slug: string): Promise<boolean>;
  setTitleIfEmpty(slug: string, title: string): Promise<void>;
}

export interface VisitStore {
  /** Bumps the link's visit_count only for non-bot visits. */
  record(visit: NewVisit): Promise<void>;
  linkStats(slug: string, range: Range, includeBots: boolean): Promise<LinkStats>;
  recentVisits(slug: string, limit: number, includeBots: boolean): Promise<Visit[]>;
  overview(range: Range, includeBots: boolean): Promise<Overview>;
}

export interface GeoLookup {
  lookup(req: Request): Promise<Geo>;
}

export interface IdentityProvider {
  /** Returns null when the request is unauthenticated. */
  identify(req: Request): Promise<Identity | null>;
}

export interface AssetServer {
  fetch(req: Request): Promise<Response>;
}

export interface Services {
  links: LinkStore;
  visits: VisitStore;
  geo: GeoLookup;
  identity: IdentityProvider;
  defer(p: Promise<unknown>): void;
  assets: AssetServer;
  config: Config;
}
