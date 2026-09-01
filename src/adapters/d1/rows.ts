import type { Link } from '../../core/types';

export interface LinkRow {
  slug: string;
  url: string;
  title: string | null;
  visit_count: number;
  created_at: number;
  created_by: string | null;
  updated_at: number;
  updated_by: string | null;
}

export function rowToLink(row: LinkRow): Link {
  return {
    slug: row.slug,
    url: row.url,
    title: row.title,
    visitCount: row.visit_count,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
