import dns from 'node:dns/promises';
import https from 'node:https';
import { accountEnv, confirm, fail, info, ok, readTemplate, warn, wrangler, wranglerJson, wranglerTokenOverrideHint } from './cli.mjs';
import { isWorkersDevHost, validateHopConfig } from './hop-config.mjs';

/** Each check logs its own result and returns 'ok' | 'warn' | 'fail'. */

export function checkHopConfig(config) {
  if (!config) {
    fail('No hop.config.json found. Run `npm run setup` first.');
    return 'fail';
  }
  const problems = validateHopConfig(config, { workerName: readTemplate().name });
  if (problems.length) {
    problems.forEach((p) => fail(`hop.config.json: ${p}`));
    return 'fail';
  }
  ok(`hop.config.json is complete (${config.shortDomain}).`);
  if (isWorkersDevHost(config.shortDomain)) {
    warn('Short links use a workers.dev address: they are tied to this account and some networks block workers.dev. See docs/deploy/cloudflare.md, "No domain? Use workers.dev".');
    return 'warn';
  }
  return 'ok';
}

export function checkTemplate(template, config) {
  let result = 'ok';
  if (template.workers_dev !== false) {
    fail('wrangler.jsonc must set "workers_dev": false, or the Worker is reachable on workers.dev without Access.');
    result = 'fail';
  }
  if (template.preview_urls !== false) {
    fail('wrangler.jsonc must set "preview_urls": false, or preview URLs bypass Access.');
    result = 'fail';
  }
  if (result === 'ok') {
    ok(
      isWorkersDevHost(config?.shortDomain)
        ? 'Preview URLs are disabled; deploys turn the workers.dev address on only for your short links.'
        : 'workers.dev and preview URLs are disabled.',
    );
  }
  return result;
}

export async function checkWranglerLogin(config) {
  try {
    const me = await wranglerJson(['whoami']);
    if (!me.loggedIn) throw new Error('not logged in');
    if (config && !me.accounts?.some((a) => a.id === config.accountId)) {
      fail(`Wrangler is logged in as ${me.email}, which can't access account ${config.accountId}.`);
      return 'fail';
    }
    ok(`Wrangler is logged in as ${me.email}.`);
    return 'ok';
  } catch {
    const hint = wranglerTokenOverrideHint();
    fail(hint ? `Wrangler couldn't use its login. ${hint}` : 'Wrangler is not logged in. Run `npx wrangler login`.');
    return 'fail';
  }
}

export async function checkTeamDomain(teamDomain) {
  try {
    const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
    const body = await res.json().catch(() => null);
    if (res.ok && Array.isArray(body?.keys) && body.keys.length > 0) {
      ok(`Access team domain ${teamDomain} publishes signing keys.`);
      return 'ok';
    }
    fail(`${teamDomain} did not return Access signing keys (HTTP ${res.status}). Check the team domain.`);
    info('Renamed your Zero Trust team? Run `npm run setup` and update the Access step (docs/CLOUDFLARE-CHECKLIST.md, "Renaming later").');
    return 'fail';
  } catch (err) {
    warn(`Couldn't reach ${teamDomain} to check it (${err.message}).`);
    return 'warn';
  }
}

export async function checkRemoteMigrations(config, deployConfigPath) {
  try {
    const { stdout } = await wrangler(['d1', 'migrations', 'list', 'DB', '--remote', '--config', deployConfigPath], {
      capture: true,
      env: accountEnv(config),
    });
    if (/No migrations to apply/i.test(stdout)) {
      ok('Remote database is up to date with all migrations.');
      return 'ok';
    }
    const pending = [...stdout.matchAll(/(\d{4}_[\w-]+\.sql)/g)].map((m) => m[1]);
    warn(`Remote database has pending migrations${pending.length ? `: ${[...new Set(pending)].join(', ')}` : ''}. \`npm run deploy\` applies them.`);
    return 'warn';
  } catch (err) {
    fail(`Couldn't read remote migrations: ${err.message.split('\n')[0]}`);
    return 'fail';
  }
}

const FRESH_DNS_SERVERS = ['1.1.1.1', '1.0.0.1', '8.8.8.8'];

/**
 * Resolves through public DNS first. The OS resolver (and so plain fetch) can cache the
 * "no such domain" answer from before the custom domain existed for several minutes.
 */
async function resolveFresh(hostname) {
  const resolver = new dns.Resolver({ timeout: 2000, tries: 1 });
  resolver.setServers(FRESH_DNS_SERVERS);
  const found = [];
  for (const [family, method] of [[4, 'resolve4'], [6, 'resolve6']]) {
    try {
      for (const address of await resolver[method](hostname)) found.push({ address, family });
    } catch {
      // Missing record types are normal; an empty result falls back below.
    }
  }
  if (found.length) return found;
  return dns.lookup(hostname, { all: true });
}

function freshLookup(hostname, options, callback) {
  resolveFresh(hostname).then(
    (addresses) => {
      if (!addresses.length) return callback(Object.assign(new Error(`${hostname} has no DNS records`), { code: 'ENOTFOUND' }));
      if (options?.all) return callback(null, addresses);
      const preferred = addresses.find((a) => a.family === (options?.family || 4)) ?? addresses[0];
      return callback(null, preferred.address, preferred.family);
    },
    (err) => callback(err),
  );
}

/** One HTTPS request without following redirects. Never throws; failures come back as `problem`. */
export function probe(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { lookup: freshLookup, timeout: 8000, headers: { 'User-Agent': 'hop-setup-check', Accept: 'text/html' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < 2048) body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location ?? '', body }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (err) => resolve({ problem: describeNetworkError(err) }));
  });
}

function describeNetworkError(err) {
  const code = String(err.code ?? '');
  if (['ENOTFOUND', 'ENODATA', 'EAI_AGAIN', 'ESERVFAIL'].includes(code)) return "its DNS record doesn't resolve yet";
  if (/CERT|TLS|SSL|EPROTO/i.test(code) || /certificate|handshake/i.test(err.message)) return "its HTTPS certificate isn't ready yet";
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code)) return 'connections are not being accepted yet';
  return err.message;
}

export function describeHealth(result) {
  if (result.problem) return result.problem;
  if (result.status === 200 && result.body.trim() === 'ok') return null;
  if (result.status >= 520 && result.status <= 530) return `Cloudflare is still attaching the domain (HTTP ${result.status})`;
  return `/health answered HTTP ${result.status} instead of "ok"`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the live site, then checks Access protection. Returns 'ok' | 'warn' | 'fail', or
 * 'pending' when the site isn't reachable yet: the deploy worked, the domain is still coming up.
 */
export async function verifyDeployment(config, { waitSeconds = 300, askToKeepWaiting = true } = {}) {
  const base = `https://${config.shortDomain}`;
  let reason = describeHealth(await probe(`${base}/health`));
  let lastReported = null;
  let deadline = Date.now() + waitSeconds * 1000;

  while (reason) {
    if (Date.now() >= deadline) {
      warn(`${base} isn't reachable yet: ${reason}.`);
      if (askToKeepWaiting && process.stdin.isTTY && (await confirm('Keep waiting another 3 minutes?', true))) {
        deadline = Date.now() + 180_000;
        continue;
      }
      return 'pending';
    }
    if (reason !== lastReported) {
      info(`Waiting for ${base}: ${reason}…`);
      lastReported = reason;
    }
    await sleep(5000);
    reason = describeHealth(await probe(`${base}/health`));
  }
  ok(`${base} is live.`);

  let result = 'ok';
  const accessHost = new URL(config.access.teamDomain).host;
  for (const path of ['/admin', '/api/me']) {
    const res = await probe(`${base}${path}`);
    if (res.problem) {
      warn(`Couldn't check ${path}: ${res.problem}.`);
      if (result === 'ok') result = 'warn';
    } else if (res.status === 200) {
      fail(`${path} is reachable without signing in. Check the Access application's paths.`);
      result = 'fail';
    } else if ([301, 302, 303, 307].includes(res.status) && res.location.includes(accessHost)) {
      ok(`${path} redirects to your Access login.`);
    } else {
      warn(`${path} returned HTTP ${res.status} without a login redirect. Access may not cover it; the Worker still blocks it.`);
      if (result === 'ok') result = 'warn';
    }
  }

  const root = await probe(`${base}/`);
  if (!root.problem && root.location.includes(accessHost)) {
    fail('The bare domain asks for a login, so short links are not public. Remove the bare domain from the Access application.');
    result = 'fail';
  } else if (!root.problem) {
    ok('Short links are public.');
  }
  return result;
}

/** One-line summary for the end of setup/deploy. */
export function describeVerification(result, config) {
  const admin = `https://${config.shortDomain}/admin`;
  switch (result) {
    case 'pending':
      return `Deployed. The site isn't reachable from here yet; new custom domains can take a few minutes.
Open ${admin} shortly, or check again with \`npm run doctor -- --live\`.`;
    case 'fail':
      return 'Deployed, but the live checks found problems (see above). Fix them, then run `npm run doctor -- --live`.';
    case 'warn':
      return `Hop is live at ${admin}, with warnings (see above).`;
    default:
      return `Hop is live at ${admin}`;
  }
}
