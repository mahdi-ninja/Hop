import type { VisitStore } from '../../core/ports';
import type { DayCount, Device, KeyCount, LinkStats, NewVisit, Overview, Range, TopLink, Visit } from '../../core/types';
import { sql, type SqlResult, type SqlRunner, type SqlStatement, type SqlValue } from './runner';

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
  params: SqlValue[];
}

function visitFilter(slug: string | null, range: Range, includeBots: boolean, alias = ''): Filter {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  const clauses = [`${col('ts')} >= ?`, `${col('ts')} < ?`];
  const params: SqlValue[] = [range.from, range.to];
  if (slug !== null) {
    clauses.unshift(`${col('slug')} = ?`);
    params.unshift(slug);
  }
  if (!includeBots) clauses.push(`${col('is_bot')} = 0`);
  return { sql: clauses.join(' AND '), params };
}

// Batch results are untyped; each query's SELECT list defines the row shape.
function rows<T>(result: SqlResult | undefined): T[] {
  return (result?.rows ?? []) as T[];
}

function count(result: SqlResult | undefined): number {
  return rows<{ n: number }>(result)[0]?.n ?? 0;
}

export class SqlVisitStore implements VisitStore {
  constructor(private readonly db: SqlRunner) {}

  async record(visit: NewVisit): Promise<void> {
    const insert = sql(
      `INSERT INTO visits (slug, ts, country, region, city, referrer_host, device, browser, os, is_bot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      await this.db.run(insert);
      return;
    }
    await this.db.batch([insert, sql('UPDATE links SET visit_count = visit_count + 1 WHERE slug = ?', visit.slug)]);
  }

  private totalQuery(where: Filter): SqlStatement {
    return { sql: `SELECT COUNT(*) AS n FROM visits WHERE ${where.sql}`, params: where.params };
  }

  private perDayQuery(where: Filter): SqlStatement {
    return {
      sql: `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS visits
         FROM visits WHERE ${where.sql} GROUP BY day ORDER BY day`,
      params: where.params,
    };
  }

  private topQuery(column: string, fallback: string, where: Filter): SqlStatement {
    return {
      sql: `SELECT COALESCE(${column}, ?) AS key, COUNT(*) AS visits
         FROM visits WHERE ${where.sql} GROUP BY key ORDER BY visits DESC, key ASC LIMIT ${TOP_N}`,
      params: [fallback, ...where.params],
    };
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
    const results = await this.db.all<VisitRow>(
      sql(
        `SELECT ts, country, city, referrer_host, device, browser, os, is_bot FROM visits
         WHERE slug = ? ${includeBots ? '' : 'AND is_bot = 0'}
         ORDER BY ts DESC, id DESC LIMIT ?`,
        slug,
        limit,
      ),
    );
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
      sql('SELECT COUNT(*) AS n FROM links'),
      this.totalQuery(where),
      this.perDayQuery(where),
      {
        sql: `SELECT v.slug AS slug, l.title AS title, COUNT(*) AS visits
           FROM visits v JOIN links l ON l.slug = v.slug
           WHERE ${joined.sql} GROUP BY v.slug ORDER BY visits DESC, v.slug ASC LIMIT ${TOP_LINKS}`,
        params: joined.params,
      },
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
