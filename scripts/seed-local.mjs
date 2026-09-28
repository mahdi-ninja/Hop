// Seeds the local D1 database with demo links and a few thousand visits spread over ~120 days.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 86_400_000;
const now = Date.now();
const seedEmail = 'seed@example.com';

const links = [
  ['docs', 'https://developers.cloudflare.com/workers/', 'Cloudflare Workers docs', 90],
  ['d1', 'https://developers.cloudflare.com/d1/', 'Cloudflare D1', 60],
  ['hiring', 'https://example.com/careers?team=eng', 'We are hiring', 40],
  ['launch', 'https://example.com/blog/launch', 'Launch announcement', 25],
  ['survey', 'https://example.com/forms/q3-survey', null, 15],
  ['handbook', 'https://example.com/handbook', 'Team handbook', 10],
  ['status', 'https://www.cloudflarestatus.com/', 'Cloudflare Status', 8],
  ['gh', 'https://github.com/', 'GitHub', 6],
  ['demo-video', 'https://example.com/videos/demo', 'Product demo', 4],
  ['old-promo', 'https://example.com/promo/2026', 'Spring promo', 2],
];

const dayMs = 86_400_000;
const rulesBySlug = {
  docs: [
    { conditions: [{ field: 'language', op: 'in', values: ['ja'] }], destinations: [{ url: 'https://developers.cloudflare.com/ja-jp/workers/', weight: 100 }] },
    { conditions: [{ field: 'visitor', op: 'in', values: ['bot'] }], destinations: [{ url: 'https://developers.cloudflare.com/', weight: 100 }] },
  ],
  hiring: [
    { conditions: [{ field: 'continent', op: 'in', values: ['OC'] }], destinations: [{ url: 'https://example.com/careers?team=eng&region=apac', weight: 100 }] },
  ],
  launch: [
    {
      conditions: [],
      window: { start: Date.now() - 2 * dayMs, end: Date.now() + 5 * dayMs },
      destinations: [
        { url: 'https://example.com/blog/launch?variant=a', weight: 50 },
        { url: 'https://example.com/blog/launch?variant=b', weight: 50 },
      ],
    },
  ],
  gh: [
    { conditions: [{ field: 'os', op: 'in', values: ['iOS'] }], destinations: [{ url: 'https://apps.apple.com/app/github/id1477376905', weight: 100 }] },
    { conditions: [{ field: 'os', op: 'in', values: ['Android'] }, { field: 'device', op: 'in', values: ['mobile', 'tablet'] }], destinations: [{ url: 'https://play.google.com/store/apps/details?id=com.github.android', weight: 100 }] },
  ],
};

const countries = [['AU', 'Victoria', 'Melbourne'], ['AU', 'New South Wales', 'Sydney'], ['US', 'California', 'San Francisco'],
  ['US', 'New York', 'New York'], ['GB', 'England', 'London'], ['DE', 'Berlin', 'Berlin'], ['NZ', 'Auckland', 'Auckland'],
  ['JP', 'Tokyo', 'Tokyo'], ['CA', 'Ontario', 'Toronto'], ['IN', 'Karnataka', 'Bengaluru'], ['BR', 'São Paulo', 'São Paulo'],
  [null, null, null]];
const referrers = [null, null, null, 'twitter.com', 'linkedin.com', 'news.ycombinator.com', 'google.com', 'reddit.com', 'slack.com'];
const clients = [
  ['desktop', 'Chrome', 'macOS'], ['desktop', 'Chrome', 'Windows'], ['desktop', 'Firefox', 'Linux'], ['desktop', 'Edge', 'Windows'],
  ['desktop', 'Safari', 'macOS'], ['mobile', 'Mobile Safari', 'iOS'], ['mobile', 'Mobile Safari', 'iOS'], ['mobile', 'Chrome', 'Android'],
  ['tablet', 'Mobile Safari', 'iOS'], ['other', 'Samsung Browser', 'Tizen'],
];
const bots = [['desktop', null, null], ['desktop', 'Chrome Headless', 'Linux']];

let state = 42;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (list) => list[Math.floor(random() * list.length)];
const sql = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const statements = ['DELETE FROM visits;', 'DELETE FROM links;'];
let totalVisits = 0;

links.forEach(([slug, url, title, weight], i) => {
  const createdAt = now - (120 - i * 9) * DAY;
  const visits = [];
  const count = weight * 10 + Math.floor(random() * 50);
  for (let n = 0; n < count; n++) {
    // Skew towards recent days so the charts have a visible trend.
    const age = Math.floor((1 - Math.sqrt(random())) * ((now - createdAt) / DAY));
    const ts = now - age * DAY - Math.floor(random() * DAY);
    if (ts < createdAt) continue;
    const isBot = random() < 0.08;
    const [country, region, city] = pick(countries);
    const [device, browser, os] = isBot ? pick(bots) : pick(clients);
    visits.push([slug, ts, country, region, city, pick(referrers), device, browser, os, isBot ? 1 : 0]);
  }
  const humanCount = visits.filter((v) => v[9] === 0).length;
  statements.push(
    `INSERT INTO links (slug, url, title, visit_count, created_at, created_by, updated_at, updated_by, rules) VALUES (${[
      slug, url, title, humanCount, createdAt, seedEmail, createdAt, seedEmail, rulesBySlug[slug] ? JSON.stringify(rulesBySlug[slug]) : null,
    ].map(sql).join(', ')});`,
  );
  for (let start = 0; start < visits.length; start += 200) {
    const rows = visits.slice(start, start + 200).map((v) => `(${v.map(sql).join(', ')})`);
    statements.push(
      `INSERT INTO visits (slug, ts, country, region, city, referrer_host, device, browser, os, is_bot) VALUES ${rows.join(', ')};`,
    );
  }
  totalVisits += visits.length;
});

const dir = new URL('../.wrangler', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const file = join(dir, 'seed.sql');
writeFileSync(file, statements.join('\n') + '\n');

// Extra arguments go to Wrangler, e.g. `npm run db:seed:local -- --persist-to ./somewhere`.
execFileSync('npx', ['wrangler', 'd1', 'execute', 'hop', '--local', `--file=${file}`, ...process.argv.slice(2)], { stdio: 'inherit' });
console.log(`Seeded ${links.length} links and ${totalVisits} visits into the local D1 database.`);
