import type { VisitStore } from '../../core/ports';
import type { LinkStats, NewVisit, Overview, Visit } from '../../core/types';

export class D1VisitStore implements VisitStore {
  constructor(private readonly db: D1Database) {}

  async record(visit: NewVisit): Promise<void> {
    const insert = this.db
      .prepare(
        `INSERT INTO visits (slug, ts, country, region, city, referrer_host, device, browser, os, is_bot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        visit.slug,
        visit.ts,
        visit.country,
        visit.region,
        visit.city,
        visit.referrerHost,
        visit.device,
        visit.browser,
        visit.os,
        visit.isBot ? 1 : 0,
      );
    if (visit.isBot) {
      await insert.run();
      return;
    }
    await this.db.batch([
      insert,
      this.db.prepare('UPDATE links SET visit_count = visit_count + 1 WHERE slug = ?').bind(visit.slug),
    ]);
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
