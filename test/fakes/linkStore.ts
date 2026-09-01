import { SlugTakenError, type LinkStore } from '../../src/core/ports';
import type { Link } from '../../src/core/types';

export class FakeLinkStore implements LinkStore {
  readonly links = new Map<string, Link>();

  async getBySlug(slug: string): Promise<Link | null> {
    return this.links.get(slug) ?? null;
  }

  async create(input: { slug: string; url: string; title: string | null; by: string }): Promise<Link> {
    if (this.links.has(input.slug)) throw new SlugTakenError(input.slug);
    const now = Date.now();
    const link: Link = {
      slug: input.slug,
      url: input.url,
      title: input.title,
      visitCount: 0,
      createdAt: now,
      createdBy: input.by,
      updatedAt: now,
      updatedBy: input.by,
    };
    this.links.set(link.slug, link);
    return { ...link };
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
