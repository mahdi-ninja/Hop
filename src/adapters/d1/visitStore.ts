import type { VisitStore } from '../../core/ports';
import type { DayCount, Device, KeyCount, LinkStats, NewVisit, Overview, Range, TopLink, Visit } from '../../core/types';

const TOP_N = 10;
const TOP_LINKS = 5;

interface VisitRow {
  ts: number;
  country: string | null;
  city: string | null;
  referrer_host: string | null;
  device: Device | null;
  browser: string | null;
  os: string | null;
  is_bot: number;
}

interface Filter {
  sql: string;
  params: (string | number)[];
}

function visitFilter(slug: string | null, range: Range, includeBots: boolean, alias = ''): Filter {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  const clauses = [`${col('ts')} >= ?`, `${col('ts')} < ?`];
  const params: (string | number)[] = [range.from, range.to];
  if (slug !== null) {
    clauses.unshift(`${col('slug')} = ?`);
    params.unshift(slug);
  }
  if (!includeBots) clauses.push(`${col('is_bot')} = 0`);
  return { sql: clauses.join(' AND '), params };
}

// D1 batch results are untyped; each query's SELECT list defines the row shape.
function rows<T>(result: D1Result | undefined): T[] {
  return (result?.results ?? []) as T[];
}

function count(result: D1Result | undefined): number {
  return rows<{ n: number }>(result)[0]?.n ?? 0;
}

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

  private totalQuery(where: Filter) {
    return this.db.prepare(`SELECT COUNT(*) AS n FROM visits WHERE ${where.sql}`).bind(...where.params);
  }

  private perDayQuery(where: Filter) {
    return this.db
      .prepare(
        `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS visits
         FROM visits WHERE ${where.sql} GROUP BY day ORDER BY day`,
      )
      .bind(...where.params);
  }

  private topQuery(column: string, fallback: string, where: Filter) {
    return this.db
      .prepare(
        `SELECT COALESCE(${column}, ?) AS key, COUNT(*) AS visits
         FROM visits WHERE ${where.sql} GROUP BY key ORDER BY visits DESC, key ASC LIMIT ${TOP_N}`,
      )
      .bind(fallback, ...where.params);
  }

  async linkStats(slug: string, range: Range, includeBots: boolean): Promise<LinkStats> {
    const where = visitFilter(slug, range, includeBots);
    const [total, perDay, countries, referrers, devices, browsers, os] = await this.db.batch([
      this.totalQuery(where),
      this.perDayQuery(where),
      this.topQuery('country', 'Unknown', where),
      this.topQuery('referrer_host', 'Direct', where),
      this.topQuery('device', 'Unknown', where),
      this.topQuery('browser', 'Unknown', where),
      this.topQuery('os', 'Unknown', where),
    ]);
    return {
      range,
      total: count(total),
      perDay: rows<DayCount>(perDay),
      countries: rows<KeyCount>(countries),
      referrers: rows<KeyCount>(referrers),
      devices: rows<KeyCount>(devices),
      browsers: rows<KeyCount>(browsers),
      os: rows<KeyCount>(os),
    };
  }

  async recentVisits(slug: string, limit: number, includeBots: boolean): Promise<Visit[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ts, country, city, referrer_host, device, browser, os, is_bot FROM visits
         WHERE slug = ? ${includeBots ? '' : 'AND is_bot = 0'}
         ORDER BY ts DESC, id DESC LIMIT ?`,
      )
      .bind(slug, limit)
      .all<VisitRow>();
    return results.map((row) => ({
      ts: row.ts,
      country: row.country,
      city: row.city,
      referrerHost: row.referrer_host,
      device: row.device,
      browser: row.browser,
      os: row.os,
      isBot: row.is_bot === 1,
    }));
  }

  async overview(range: Range, includeBots: boolean): Promise<Overview> {
    const where = visitFilter(null, range, includeBots);
    const joined = visitFilter(null, range, includeBots, 'v');
    const [links, total, perDay, topLinks] = await this.db.batch([
      this.db.prepare('SELECT COUNT(*) AS n FROM links'),
      this.totalQuery(where),
      this.perDayQuery(where),
      this.db
        .prepare(
          `SELECT v.slug AS slug, l.title AS title, COUNT(*) AS visits
           FROM visits v JOIN links l ON l.slug = v.slug
           WHERE ${joined.sql} GROUP BY v.slug ORDER BY visits DESC, v.slug ASC LIMIT ${TOP_LINKS}`,
        )
        .bind(...joined.params),
    ]);
    return {
      range,
      totalLinks: count(links),
      totalVisits: count(total),
      perDay: rows<DayCount>(perDay),
      topLinks: rows<TopLink>(topLinks),
    };
  }
}
