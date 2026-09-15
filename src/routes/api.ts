import { Hono, type Context } from 'hono';
import { SlugTakenError } from '../core/ports';
import type { AppEnv } from '../core/services';
import type { Link } from '../core/types';
import { decodeCursor } from '../lib/cursor';
import { apiError } from '../lib/errors';
import { parseBotsFlag, parseRangeName, resolveRange } from '../lib/range';
import { validateRules } from '../lib/routing';
import { checkCustomSlug, generateSlug, isValidSlugFormat } from '../lib/slug';
import { fillTitle, MAX_TITLE_LENGTH } from '../lib/title';
import { validateTargetUrl } from '../lib/url';
import { requireIdentity } from '../middleware/auth';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SLUG_ATTEMPTS = 5;
const DEFAULT_RECENT_VISITS = 50;
const MAX_RECENT_VISITS = 100;

type ApiContext = Context<AppEnv>;

function toApiLink(link: Link, shortDomain: string) {
  return {
    slug: link.slug,
    shortUrl: `https://${shortDomain}/${link.slug}`,
    url: link.url,
    title: link.title,
    visitCount: link.visitCount,
    createdAt: link.createdAt,
    createdBy: link.createdBy,
    updatedAt: link.updatedAt,
    updatedBy: link.updatedBy,
    rules: link.rules,
  };
}

async function readJsonObject(c: ApiContext): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type TitleResult = { ok: true; title: string | null } | { ok: false };

function parseTitle(raw: unknown): TitleResult {
  if (raw === undefined || raw === null) return { ok: true, title: null };
  if (typeof raw !== 'string') return { ok: false };
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title.length > MAX_TITLE_LENGTH) return { ok: false };
  return { ok: true, title: title || null };
}

function parseLimit(raw: string | undefined, fallback: number, max: number): number | null {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const limit = Number(raw);
  return limit < 1 ? null : Math.min(limit, max);
}

function parseStatsQuery(c: ApiContext) {
  return { rangeName: parseRangeName(c.req.query('range')), includeBots: parseBotsFlag(c.req.query('bots')) };
}

async function findLink(c: ApiContext): Promise<Link | null> {
  const slug = c.req.param('slug');
  return slug && isValidSlugFormat(slug) ? c.get('services').links.getBySlug(slug) : null;
}

export function apiRoutes(): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  api.use(requireIdentity('api'));

  api.get('/me', (c) => c.json({ email: c.get('userEmail') }));

  api.get('/links', async (c) => {
    const { links, config } = c.get('services');
    const limit = parseLimit(c.req.query('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    if (limit === null) return apiError(c, 'INVALID_INPUT', 'limit must be a positive integer.');
    const cursor = c.req.query('cursor') || undefined;
    if (cursor && !decodeCursor(cursor)) return apiError(c, 'INVALID_INPUT', 'Invalid cursor.');
    const search = c.req.query('search')?.trim() || undefined;

    const page = await links.list({ search, cursor, limit });
    return c.json({ items: page.items.map((l) => toApiLink(l, config.shortDomain)), nextCursor: page.nextCursor });
  });

  api.post('/links', async (c) => {
    const services = c.get('services');
    const body = await readJsonObject(c);
    if (!body) return apiError(c, 'INVALID_INPUT', 'Request body must be a JSON object.');

    const url = validateTargetUrl(body.url, services.config.shortDomain);
    if (!url) return apiError(c, 'INVALID_URL', 'Enter a valid http(s) URL that does not point at this shortener.');

    const title = parseTitle(body.title);
    if (!title.ok) return apiError(c, 'INVALID_INPUT', `Title must be a string of at most ${MAX_TITLE_LENGTH} characters.`);

    const customSlug = body.slug === undefined || body.slug === null || body.slug === '' ? null : body.slug;
    const by = c.get('userEmail');
    let link: Link | null = null;

    if (customSlug !== null) {
      if (typeof customSlug !== 'string') return apiError(c, 'INVALID_SLUG', 'Slug must be a string.');
      const check = checkCustomSlug(customSlug);
      if (check === 'invalid') {
        return apiError(c, 'INVALID_SLUG', 'Slugs may only contain letters, numbers, "-" and "_" (max 64).');
      }
      if (check === 'reserved') return apiError(c, 'RESERVED_SLUG', 'That slug is reserved.');
      try {
        link = await services.links.create({ slug: customSlug, url, title: title.title, by });
      } catch (err) {
        if (err instanceof SlugTakenError) return apiError(c, 'SLUG_TAKEN', 'That slug is already in use.');
        throw err;
      }
    } else {
      for (let attempt = 0; attempt < SLUG_ATTEMPTS && !link; attempt++) {
        try {
          link = await services.links.create({ slug: generateSlug(), url, title: title.title, by });
        } catch (err) {
          if (!(err instanceof SlugTakenError)) throw err;
        }
      }
      if (!link) return apiError(c, 'INTERNAL', 'Could not generate a unique slug. Please try again.');
    }

    if (!link.title) services.defer(fillTitle(link.slug, link.url, services));
    return c.json(toApiLink(link, services.config.shortDomain), 201);
  });

  api.get('/links/:slug', async (c) => {
    const link = await findLink(c);
    if (!link) return apiError(c, 'NOT_FOUND', 'Link not found.');
    return c.json(toApiLink(link, c.get('services').config.shortDomain));
  });

  api.patch('/links/:slug', async (c) => {
    const { links, config } = c.get('services');
    const slug = c.req.param('slug');
    const body = await readJsonObject(c);
    if (!body) return apiError(c, 'INVALID_INPUT', 'Request body must be a JSON object.');
    if (body.url === undefined && body.title === undefined) {
      return apiError(c, 'INVALID_INPUT', 'Provide at least one of "url" or "title".');
    }

    const patch: { url?: string; title?: string | null } = {};
    if (body.url !== undefined) {
      const url = validateTargetUrl(body.url, config.shortDomain);
      if (!url) return apiError(c, 'INVALID_URL', 'Enter a valid http(s) URL that does not point at this shortener.');
      patch.url = url;
    }
    if (body.title !== undefined) {
      const title = parseTitle(body.title);
      if (!title.ok) return apiError(c, 'INVALID_INPUT', `Title must be a string of at most ${MAX_TITLE_LENGTH} characters.`);
      patch.title = title.title;
    }

    const link = isValidSlugFormat(slug) ? await links.update(slug, patch, c.get('userEmail')) : null;
    if (!link) return apiError(c, 'NOT_FOUND', 'Link not found.');
    return c.json(toApiLink(link, config.shortDomain));
  });

  api.put('/links/:slug/rules', async (c) => {
    const { links, config } = c.get('services');
    const body = await readJsonObject(c);
    if (!body) return apiError(c, 'INVALID_INPUT', 'Request body must be a JSON object.');
    const result = validateRules(body.rules, config.shortDomain);
    if (!result.ok) return apiError(c, result.code, result.message);

    const slug = c.req.param('slug');
    const link = isValidSlugFormat(slug) ? await links.update(slug, { rules: result.rules }, c.get('userEmail')) : null;
    if (!link) return apiError(c, 'NOT_FOUND', 'Link not found.');
    return c.json(toApiLink(link, config.shortDomain));
  });

  api.delete('/links/:slug', async (c) => {
    const slug = c.req.param('slug');
    const deleted = isValidSlugFormat(slug) && (await c.get('services').links.delete(slug));
    if (!deleted) return apiError(c, 'NOT_FOUND', 'Link not found.');
    return c.body(null, 204);
  });

  api.get('/links/:slug/stats', async (c) => {
    const { rangeName, includeBots } = parseStatsQuery(c);
    if (rangeName === null) return apiError(c, 'INVALID_INPUT', 'range must be one of 7d, 30d, 90d, all.');
    if (includeBots === null) return apiError(c, 'INVALID_INPUT', 'bots must be 0 or 1.');
    const link = await findLink(c);
    if (!link) return apiError(c, 'NOT_FOUND', 'Link not found.');

    const range = resolveRange(rangeName, Date.now(), link.createdAt);
    return c.json(await c.get('services').visits.linkStats(link.slug, range, includeBots));
  });

  api.get('/links/:slug/visits', async (c) => {
    const limit = parseLimit(c.req.query('limit'), DEFAULT_RECENT_VISITS, MAX_RECENT_VISITS);
    if (limit === null) return apiError(c, 'INVALID_INPUT', 'limit must be a positive integer.');
    const includeBots = parseBotsFlag(c.req.query('bots'));
    if (includeBots === null) return apiError(c, 'INVALID_INPUT', 'bots must be 0 or 1.');
    const link = await findLink(c);
    if (!link) return apiError(c, 'NOT_FOUND', 'Link not found.');

    return c.json({ items: await c.get('services').visits.recentVisits(link.slug, limit, includeBots) });
  });

  api.get('/stats/overview', async (c) => {
    const { rangeName, includeBots } = parseStatsQuery(c);
    if (rangeName === null) return apiError(c, 'INVALID_INPUT', 'range must be one of 7d, 30d, 90d, all.');
    if (includeBots === null) return apiError(c, 'INVALID_INPUT', 'bots must be 0 or 1.');

    const range = resolveRange(rangeName, Date.now(), 0);
    return c.json(await c.get('services').visits.overview(range, includeBots));
  });

  api.all('*', (c) => apiError(c, 'NOT_FOUND', 'Not found.'));

  return api;
}
