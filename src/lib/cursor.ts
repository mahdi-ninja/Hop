export interface LinkCursor {
  createdAt: number;
  slug: string;
}

export function encodeCursor(cursor: LinkCursor): string {
  const json = JSON.stringify([cursor.createdAt, cursor.slug]);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(raw: string): LinkCursor | null {
  try {
    const parsed: unknown = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      Number.isSafeInteger(parsed[0]) &&
      typeof parsed[1] === 'string'
    ) {
      return { createdAt: parsed[0] as number, slug: parsed[1] };
    }
  } catch {
    // Fall through: malformed cursors are reported as null.
  }
  return null;
}
