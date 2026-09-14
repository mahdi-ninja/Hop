import UAParser from 'ua-parser-js';
import type { Services } from '../core/ports';
import type { Device, NewVisit } from '../core/types';

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

export async function buildVisit(
  req: Request,
  slug: string,
  services: Pick<Services, 'geo'>,
  now = Date.now(),
): Promise<NewVisit> {
  const userAgent = req.headers.get('User-Agent') ?? '';
  const ua = new UAParser(userAgent).getResult();
  const geo = await services.geo.lookup(req);
  return {
    slug,
    ts: now,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    referrerHost: referrerHost(req.headers.get('Referer')),
    device: deviceType(ua.device.type),
    browser: ua.browser.name ?? null,
    os: ua.os.name ? (OS_NAMES[ua.os.name] ?? ua.os.name) : null,
    isBot: isBotUserAgent(userAgent),
  };
}

/** Never rejects: a logging failure must not affect the redirect. */
export async function recordVisit(req: Request, slug: string, services: Pick<Services, 'geo' | 'visits'>): Promise<void> {
  try {
    await services.visits.record(await buildVisit(req, slug, services));
  } catch (err) {
    console.error('Failed to record visit', { slug, err });
  }
}
