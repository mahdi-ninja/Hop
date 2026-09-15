import { SlugTakenError, type LinkPatch, type LinkStore } from '../../src/core/ports';
import type { Link } from '../../src/core/types';
import { decodeCursor, encodeCursor } from '../../src/lib/cursor';

export class FakeLinkStore implements LinkStore {
  readonly links = new Map<string, Link>();
  onDelete: (slug: string) => void = () => {};
  private clock = 0;

  /** Strictly increasing timestamps so ordering in tests is deterministic. */
  now(): number {
    this.clock = Math.max(this.clock + 1, Date.now());
    return this.clock;
  }

  async getBySlug(slug: string): Promise<Link | null> {
    const link = this.links.get(slug);
    return link ? structuredClone(link) : null;
  }

  async list(q: { search?: string; cursor?: string; limit: number }): Promise<{ items: Link[]; nextCursor: string | null }> {
    const needle = q.search?.toLowerCase();
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const matching = [...this.links.values()]
      .filter(
        (l) =>
          !needle ||
          l.slug.toLowerCase().includes(needle) ||
          l.url.toLowerCase().includes(needle) ||
          (l.title ?? '').toLowerCase().includes(needle),
      )
      .sort((a, b) => b.createdAt - a.createdAt || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      .filter((l) => !cursor || l.createdAt < cursor.createdAt || (l.createdAt === cursor.createdAt && l.slug > cursor.slug));

    const items = matching.slice(0, q.limit).map((l) => ({ ...l }));
    const last = items[items.length - 1];
    return { items, nextCursor: matching.length > q.limit && last ? encodeCursor(last) : null };
  }

  async create(input: { slug: string; url: string; title: string | null; by: string }): Promise<Link> {
    if (this.links.has(input.slug)) throw new SlugTakenError(input.slug);
    const now = this.now();
    const link: Link = {
      slug: input.slug,
      url: input.url,
      title: input.title,
      visitCount: 0,
      createdAt: now,
      createdBy: input.by,
      updatedAt: now,
      updatedBy: input.by,
      rules: [],
    };
    this.links.set(link.slug, link);
    return { ...link };
  }

  async update(slug: string, patch: LinkPatch, by: string): Promise<Link | null> {
    const link = this.links.get(slug);
    if (!link) return null;
    if (patch.url !== undefined) link.url = patch.url;
    if (patch.title !== undefined) link.title = patch.title;
    if (patch.rules !== undefined) link.rules = structuredClone(patch.rules);
    link.updatedAt = this.now();
    link.updatedBy = by;
    return { ...link };
  }

  async delete(slug: string): Promise<boolean> {
    this.onDelete(slug);
    return this.links.delete(slug);
  }

  async setTitleIfEmpty(slug: string, title: string): Promise<void> {
    const link = this.links.get(slug);
    if (link && !link.title) link.title = title;
  }
}
