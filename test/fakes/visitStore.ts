import type { VisitStore } from '../../src/core/ports';
import type { DayCount, KeyCount, LinkStats, NewVisit, Overview, Range, Visit } from '../../src/core/types';
import type { FakeLinkStore } from './linkStore';

function countBy(visits: NewVisit[], key: (v: NewVisit) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of visits) counts.set(key(v), (counts.get(key(v)) ?? 0) + 1);
  return counts;
}

function top(visits: NewVisit[], key: (v: NewVisit) => string, n: number): KeyCount[] {
  return [...countBy(visits, key)]
    .map(([k, visits]) => ({ key: k, visits }))
    .sort((a, b) => b.visits - a.visits || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, n);
}

function perDay(visits: NewVisit[]): DayCount[] {
  return [...countBy(visits, (v) => new Date(v.ts).toISOString().slice(0, 10))]
    .map(([day, visits]) => ({ day, visits }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

export class FakeVisitStore implements VisitStore {
  visits: NewVisit[] = [];

  constructor(private readonly links: FakeLinkStore) {
    links.onDelete = (slug) => {
      this.visits = this.visits.filter((v) => v.slug !== slug);
    };
  }

  async record(visit: NewVisit): Promise<void> {
    this.visits.push(visit);
    const link = this.links.links.get(visit.slug);
    if (link && !visit.isBot) link.visitCount += 1;
  }

  private select(slug: string | null, range: Range, includeBots: boolean): NewVisit[] {
    return this.visits.filter(
      (v) => (slug === null || v.slug === slug) && v.ts >= range.from && v.ts < range.to && (includeBots || !v.isBot),
    );
  }

  async linkStats(slug: string, range: Range, includeBots: boolean): Promise<LinkStats> {
    const visits = this.select(slug, range, includeBots);
    return {
      range,
      total: visits.length,
      perDay: perDay(visits),
      countries: top(visits, (v) => v.country ?? 'Unknown', 10),
      referrers: top(visits, (v) => v.referrerHost ?? 'Direct', 10),
      devices: top(visits, (v) => v.device, 10),
      browsers: top(visits, (v) => v.browser ?? 'Unknown', 10),
      os: top(visits, (v) => v.os ?? 'Unknown', 10),
    };
  }

  async recentVisits(slug: string, limit: number, includeBots: boolean): Promise<Visit[]> {
    return this.visits
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.slug === slug && (includeBots || !v.isBot))
      .sort((a, b) => b.v.ts - a.v.ts || b.i - a.i)
      .slice(0, limit)
      .map(({ v }) => ({
        ts: v.ts,
        country: v.country,
        city: v.city,
        referrerHost: v.referrerHost,
        device: v.device,
        browser: v.browser,
        os: v.os,
        isBot: v.isBot,
      }));
  }

  async overview(range: Range, includeBots: boolean): Promise<Overview> {
    const visits = this.select(null, range, includeBots);
    return {
      range,
      totalLinks: this.links.links.size,
      totalVisits: visits.length,
      perDay: perDay(visits),
      topLinks: top(visits, (v) => v.slug, 5).map(({ key, visits }) => ({
        slug: key,
        title: this.links.links.get(key)?.title ?? null,
        visits,
      })),
    };
  }
}
