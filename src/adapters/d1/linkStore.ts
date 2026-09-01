import { SlugTakenError, type LinkStore } from '../../core/ports';
import type { Link } from '../../core/types';
import { rowToLink, type LinkRow } from './rows';

export class D1LinkStore implements LinkStore {
  constructor(private readonly db: D1Database) {}

  async getBySlug(slug: string): Promise<Link | null> {
    const row = await this.db.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first<LinkRow>();
    return row ? rowToLink(row) : null;
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

  list(): Promise<{ items: Link[]; nextCursor: string | null }> {
    throw new Error('Not implemented yet');
  }

  update(): Promise<Link | null> {
    throw new Error('Not implemented yet');
  }

  delete(): Promise<boolean> {
    throw new Error('Not implemented yet');
  }

  setTitleIfEmpty(): Promise<void> {
    throw new Error('Not implemented yet');
  }
}
