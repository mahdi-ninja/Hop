import { accountEnv, fail, ok, warn, wrangler, wranglerJson } from './cli.mjs';
import { validateHopConfig } from './hop-config.mjs';

/** Each check logs its own result and returns 'ok' | 'warn' | 'fail'. */

export function checkHopConfig(config) {
  if (!config) {
    fail('No hop.config.json found. Run `npm run setup` first.');
    return 'fail';
  }
  const problems = validateHopConfig(config);
  if (problems.length) {
    problems.forEach((p) => fail(`hop.config.json: ${p}`));
    return 'fail';
  }
  ok(`hop.config.json is complete (${config.shortDomain}).`);
  return 'ok';
}

export function checkTemplate(template) {
  let result = 'ok';
  if (template.workers_dev !== false) {
    fail('wrangler.jsonc must set "workers_dev": false, or the Worker is reachable on workers.dev without Access.');
    result = 'fail';
  }
  if (template.preview_urls !== false) {
    fail('wrangler.jsonc must set "preview_urls": false, or preview URLs bypass Access.');
    result = 'fail';
  }
  if (result === 'ok') ok('workers.dev and preview URLs are disabled.');
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
    fail('Wrangler is not logged in. Run `npx wrangler login`.');
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

async function fetchNoRedirect(url) {
  return fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'hop-setup-check' } });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Checks the live deployment. Custom-domain certificates can take a minute, so /health is retried. */
export async function verifyDeployment(config, { waitSeconds = 120 } = {}) {
  const base = `https://${config.shortDomain}`;
  let healthy = false;
  for (let waited = 0; waited <= waitSeconds; waited += 10) {
    try {
      const res = await fetchNoRedirect(`${base}/health`);
      if (res.status === 200 && (await res.text()).trim() === 'ok') {
        healthy = true;
        break;
      }
    } catch {
      // DNS or TLS may not be ready yet; retry below.
    }
    if (waited === 0) warn(`Waiting for ${base} to come up (new custom domains can take a minute)…`);
    await sleep(10_000);
  }
  if (!healthy) {
    fail(`${base}/health did not respond with "ok". Check the Worker's custom domain in the Cloudflare dashboard.`);
    return 'fail';
  }
  ok(`${base} is live.`);

  let result = 'ok';
  const accessHost = new URL(config.access.teamDomain).host;
  for (const path of ['/admin', '/api/me']) {
    const res = await fetchNoRedirect(`${base}${path}`);
    const location = res.headers.get('Location') ?? '';
    if (res.status === 200) {
      fail(`${path} is reachable without signing in. Check the Access application's paths.`);
      result = 'fail';
    } else if ([301, 302, 303, 307].includes(res.status) && location.includes(accessHost)) {
      ok(`${path} redirects to your Access login.`);
    } else {
      warn(`${path} returned HTTP ${res.status} without a login redirect. Access may not cover it; the Worker still blocks it.`);
      if (result === 'ok') result = 'warn';
    }
  }

  const root = await fetchNoRedirect(`${base}/`);
  if ((root.headers.get('Location') ?? '').includes(accessHost)) {
    fail('The bare domain asks for a login, so short links are not public. Remove the bare domain from the Access application.');
    result = 'fail';
  } else {
    ok('Short links are public.');
  }
  return result;
}
