import { describe, expect, it } from 'vitest';
import { buildVisit, deviceType, isBotUserAgent, referrerHost } from '../src/lib/visit';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  smartTv:
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36',
};

describe('isBotUserAgent', () => {
  it.each([
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'facebookexternalhit/1.1',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Twitterbot/1.0',
    'WhatsApp/2.23.20.0',
    'TelegramBot (like TwitterBot)',
    'LinkedInBot/1.0',
    'Mozilla/5.0 (compatible; Embedly/0.2)',
    'Mozilla/5.0 (Windows NT 10.0) Chrome/120 HeadlessChrome/120.0',
    'curl/8.4.0',
    'Wget/1.21',
    'python-requests/2.31.0',
    'Yahoo! Slurp',
    'Baiduspider',
    'SomeCrawler/1.0',
    'Link Preview Service',
    '',
    '   ',
  ])('flags %j as a bot', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each([UA.chromeMac, UA.safariIphone, UA.ipad])('does not flag browsers', (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
});

describe('referrerHost', () => {
  it('keeps only the host and strips www.', () => {
    expect(referrerHost('https://www.twitter.com/some/post?x=1')).toBe('twitter.com');
    expect(referrerHost('https://news.ycombinator.com/item?id=1')).toBe('news.ycombinator.com');
  });

  it('returns null for missing or invalid referrers', () => {
    expect(referrerHost(null)).toBeNull();
    expect(referrerHost('')).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
  });
});

describe('deviceType', () => {
  it('maps parser device types', () => {
    expect(deviceType(undefined)).toBe('desktop');
    expect(deviceType('mobile')).toBe('mobile');
    expect(deviceType('tablet')).toBe('tablet');
    for (const t of ['console', 'smarttv', 'wearable', 'embedded']) expect(deviceType(t)).toBe('other');
  });
});

describe('buildVisit', () => {
  const geo = { lookup: async () => ({ country: 'AU', region: 'Victoria', city: 'Melbourne' }) };

  it('combines geo, referrer and parsed user agent', async () => {
    const req = new Request('https://go.example.com/abc', {
      headers: { 'User-Agent': UA.safariIphone, Referer: 'https://www.google.com/' },
    });
    expect(await buildVisit(req, 'abc', { geo }, 1234)).toEqual({
      slug: 'abc',
      ts: 1234,
      country: 'AU',
      region: 'Victoria',
      city: 'Melbourne',
      referrerHost: 'google.com',
      device: 'mobile',
      browser: 'Mobile Safari',
      os: 'iOS',
      isBot: false,
    });
  });

  it('parses desktop, tablet and other devices', async () => {
    const device = async (ua: string) =>
      (await buildVisit(new Request('https://x/', { headers: { 'User-Agent': ua } }), 's', { geo })).device;
    expect(await device(UA.chromeMac)).toBe('desktop');
    const mac = await buildVisit(new Request('https://x/', { headers: { 'User-Agent': UA.chromeMac } }), 's', { geo });
    expect(mac).toMatchObject({ browser: 'Chrome', os: 'macOS' });
    expect(await device(UA.ipad)).toBe('tablet');
    expect(await device(UA.smartTv)).toBe('other');
  });

  it('treats a missing user agent as a bot', async () => {
    const visit = await buildVisit(new Request('https://go.example.com/abc'), 'abc', { geo });
    expect(visit.isBot).toBe(true);
    expect(visit.referrerHost).toBeNull();
  });
});
