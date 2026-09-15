import UAParser from 'ua-parser-js';
import type { Services } from '../core/ports';
import type { Device, NewVisit, Visitor } from '../core/types';
import { preferredLanguage } from './routing';

const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|slackbot|discordbot|twitterbot|whatsapp|telegrambot|linkedinbot|embedly|preview|curl|wget|python-requests|headless/i;

export function isBotUserAgent(userAgent: string): boolean {
  return userAgent.trim() === '' || BOT_PATTERN.test(userAgent);
}

export function referrerHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

export function deviceType(parsedType: string | undefined): Device {
  if (!parsedType) return 'desktop';
  if (parsedType === 'mobile' || parsedType === 'tablet') return parsedType;
  return 'other';
}

// ua-parser-js v1 reports "Mac OS"; Apple's current name reads better in the stats.
const OS_NAMES: Record<string, string> = { 'Mac OS': 'macOS' };

/** Everything Hop reads about a visitor, used both for routing and for the visit record. */
export interface VisitorDetails extends Visitor {
  region: string | null;
  city: string | null;
  referrerHost: string | null;
  device: Device;
}

export async function readVisitor(req: Request, services: Pick<Services, 'geo'>): Promise<VisitorDetails> {
  const userAgent = req.headers.get('User-Agent') ?? '';
  const ua = new UAParser(userAgent).getResult();
  const geo = await services.geo.lookup(req);
  return {
    continent: geo.continent,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    referrerHost: referrerHost(req.headers.get('Referer')),
    device: deviceType(ua.device.type),
    browser: ua.browser.name ?? null,
    os: ua.os.name ? (OS_NAMES[ua.os.name] ?? ua.os.name) : null,
    language: preferredLanguage(req.headers.get('Accept-Language')),
    isBot: isBotUserAgent(userAgent),
  };
}

export function toNewVisit(slug: string, visitor: VisitorDetails, now: number): NewVisit {
  return {
    slug,
    ts: now,
    country: visitor.country,
    region: visitor.region,
    city: visitor.city,
    referrerHost: visitor.referrerHost,
    device: visitor.device,
    browser: visitor.browser,
    os: visitor.os,
    isBot: visitor.isBot,
  };
}

export async function buildVisit(
  req: Request,
  slug: string,
  services: Pick<Services, 'geo'>,
  now = Date.now(),
): Promise<NewVisit> {
  return toNewVisit(slug, await readVisitor(req, services), now);
}

/**
 * Never rejects: a logging failure must not affect the redirect. Pass `visitor` when the
 * redirect already read it for routing, to avoid parsing the request twice.
 */
export async function recordVisit(
  req: Request,
  slug: string,
  services: Pick<Services, 'geo' | 'visits'>,
  visitor?: VisitorDetails,
): Promise<void> {
  try {
    const now = Date.now();
    await services.visits.record(toNewVisit(slug, visitor ?? (await readVisitor(req, services)), now));
  } catch (err) {
    console.error('Failed to record visit', { slug, err });
  }
}
