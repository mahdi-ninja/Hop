import type { VisitStore } from '../../src/core/ports';
import type { LinkStats, NewVisit, Overview, Visit } from '../../src/core/types';
import type { FakeLinkStore } from './linkStore';

export class FakeVisitStore implements VisitStore {
  readonly visits: NewVisit[] = [];

  constructor(private readonly links: FakeLinkStore) {}

  async record(visit: NewVisit): Promise<void> {
    this.visits.push(visit);
    const link = this.links.links.get(visit.slug);
    if (link && !visit.isBot) link.visitCount += 1;
  }

  linkStats(): Promise<LinkStats> {
    throw new Error('Not implemented yet');
  }

  recentVisits(): Promise<Visit[]> {
    throw new Error('Not implemented yet');
  }

  overview(): Promise<Overview> {
    throw new Error('Not implemented yet');
  }
}
