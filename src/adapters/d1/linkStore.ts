import { SlugTakenError, type LinkPatch, type LinkStore } from '../../core/ports';
import type { Link } from '../../core/types';
import { decodeCursor, encodeCursor } from '../../lib/cursor';
import { rowToLink, type LinkRow } from './rows';

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export class D1LinkStore implements LinkStore {
  constructor(private readonly db: D1Database) {}

  async getBySlug(slug: string): Promise<Link | null> {
    const row = await this.db.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first<LinkRow>();
    return row ? rowToLink(row) : null;
  }

  async list(q: { search?: string; cursor?: string; limit: number }): Promise<{ items: Link[]; nextCursor: string | null }> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (q.search) {
      // SQLite's LIKE is case-insensitive for ASCII, which covers slugs and URLs.
      where.push(`(slug LIKE ?1 ESCAPE '\\' OR url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\')`);
      params.push(likePattern(q.search));
    }
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    if (cursor) {
      const a = params.length + 1;
      where.push(`(created_at < ?${a} OR (created_at = ?${a} AND slug > ?${a + 1}))`);
      params.push(cursor.createdAt, cursor.slug);
    }
    params.push(q.limit + 1);

    const sql = `SELECT * FROM links
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, slug ASC
      LIMIT ?${params.length}`;
    const { results } = await this.db.prepare(sql).bind(...params).all<LinkRow>();

    const items = results.slice(0, q.limit).map(rowToLink);
    const last = items[items.length - 1];
    const nextCursor = results.length > q.limit && last ? encodeCursor(last) : null;
    return { items, nextCursor };
  }

  async create(input: { slug: string; url: string; title: string | null; by: string }): Promise<Link> {
    const now = Date.now();
    const row = await this.db
      .prepare(
        `INSERT INTO links (slug, url, title, visit_count, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT (slug) DO NOTHING
         RETURNING *`,
      )
      .bind(input.slug, input.url, input.title, now, input.by, now, input.by)
      .first<LinkRow>();
    if (!row) throw new SlugTakenError(input.slug);
    return rowToLink(row);
  }

  async update(slug: string, patch: LinkPatch, by: string): Promise<Link | null> {
    const sets = ['updated_at = ?', 'updated_by = ?'];
    const params: (string | number | null)[] = [Date.now(), by];
    if (patch.url !== undefined) {
      sets.push('url = ?');
      params.push(patch.url);
    }
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.rules !== undefined) {
      sets.push('rules = ?');
      params.push(patch.rules.length ? JSON.stringify(patch.rules) : null);
    }
    const row = await this.db
      .prepare(`UPDATE links SET ${sets.join(', ')} WHERE slug = ? RETURNING *`)
      .bind(...params, slug)
      .first<LinkRow>();
    return row ? rowToLink(row) : null;
  }

  async delete(slug: string): Promise<boolean> {
    // Visits are deleted explicitly rather than relying on ON DELETE CASCADE being enabled.
    const [, deleted] = await this.db.batch([
      this.db.prepare('DELETE FROM visits WHERE slug = ?').bind(slug),
      this.db.prepare('DELETE FROM links WHERE slug = ?').bind(slug),
    ]);
    return (deleted?.meta.changes ?? 0) > 0;
  }

  async setTitleIfEmpty(slug: string, title: string): Promise<void> {
    await this.db
      .prepare("UPDATE links SET title = ? WHERE slug = ? AND (title IS NULL OR title = '')")
      .bind(title, slug)
      .run();
  }
}
