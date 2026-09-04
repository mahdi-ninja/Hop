import type { Services } from '../core/ports';

const FETCH_TIMEOUT_MS = 3000;
const MAX_BYTES = 64 * 1024;
export const MAX_TITLE_LENGTH = 200;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function normalizeTitle(raw: string): string | null {
  const title = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH).trim();
  return title || null;
}

export function extractTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return match?.[1] === undefined ? null : normalizeTitle(decodeEntities(match[1]));
}

async function readPrefix(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxBytes - bytes);
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

export async function fetchTitle(url: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const res = await fetcher(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'text/html' },
  });
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!res.ok || !res.body || !contentType.toLowerCase().startsWith('text/html')) {
    await res.body?.cancel();
    return null;
  }
  return extractTitle(await readPrefix(res.body, MAX_BYTES));
}

/** Best-effort; never rejects. */
export async function fillTitle(
  slug: string,
  url: string,
  services: Pick<Services, 'links'>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  try {
    const title = await fetchTitle(url, fetcher);
    if (title) await services.links.setTitleIfEmpty(slug, title);
  } catch (err) {
    console.error('Failed to fetch title', { slug, err });
  }
}
