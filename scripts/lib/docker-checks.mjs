// `npm run doctor -- --docker`: readiness checks for the Docker preset.
import { describeHealth, probe } from './checks.mjs';
import { fail, ok, ROOT, run, warn } from './cli.mjs';
import { AUTHELIA_USERS_FILE, ENV_FILE, OAUTH2_EMAILS_FILE, parseEnv, readPresetFile, validateDockerEnv } from './docker-config.mjs';

export async function checkDocker({ live }) {
  const problems = [];
  // A preset file that is really a directory is a problem to report, not a crash.
  const readIfExists = (file) => {
    try {
      return readPresetFile(ROOT, file);
    } catch (err) {
      problems.push(err.message);
      return undefined;
    }
  };
  const text = readIfExists(ENV_FILE);
  if (text === undefined) {
    fail(problems[0] ?? `${ENV_FILE} is missing. Run \`npm run setup:docker\`.`);
    return ['fail'];
  }
  const env = parseEnv(text);
  const results = [];

  const files = { emails: readIfExists(OAUTH2_EMAILS_FILE), autheliaUsers: readIfExists(AUTHELIA_USERS_FILE) };
  problems.push(...validateDockerEnv(env, files));
  for (const problem of problems) fail(problem);
  if (problems.length === 0) ok(`${ENV_FILE} is complete for ${env.AUTH_PROVIDER}.`);
  results.push(problems.length ? 'fail' : 'ok');

  results.push(await checkCompose());
  if (live && problems.length === 0) results.push(await checkLiveSite(env));
  return results;
}

async function checkCompose() {
  let config;
  try {
    const { stdout } = await run('docker', ['compose', 'config', '--format', 'json'], { capture: true });
    config = JSON.parse(stdout);
  } catch (err) {
    fail(`docker compose couldn't read compose.yaml: ${err.message.split('\n').at(-1)}`);
    return 'fail';
  }
  const hop = config.services?.hop;
  if (!hop) {
    fail('compose.yaml has no hop service.');
    return 'fail';
  }
  if (hop.ports?.length) {
    fail('The hop service publishes ports. Remove them: only Caddy or cloudflared may reach Hop.');
    return 'fail';
  }
  ok('compose.yaml is valid and Hop is reachable only through the proxy.');
  return 'ok';
}

function signInTarget(env) {
  if (env.AUTH_PROVIDER === 'oauth2-proxy') return { label: 'oauth2-proxy', matches: (location) => location.startsWith('/oauth2/') };
  if (env.AUTH_PROVIDER === 'authelia') return { label: 'Authelia', matches: (location) => location.includes('/authelia') };
  const accessHost = new URL(env.ACCESS_TEAM_DOMAIN).host;
  return { label: 'Cloudflare Access', matches: (location) => location.includes(accessHost) };
}

async function checkLiveSite(env) {
  const base = `https://${env.SHORT_DOMAIN}`;
  const health = describeHealth(await probe(`${base}/health`));
  if (health) {
    warn(`${base} isn't reachable yet: ${health}.`);
    return 'warn';
  }
  ok(`${base} is live.`);

  let result = 'ok';
  const target = signInTarget(env);
  const admin = await probe(`${base}/admin`);
  if (admin.status === 200) {
    fail('/admin is reachable without signing in.');
    result = 'fail';
  } else if ([301, 302, 303, 307].includes(admin.status) && target.matches(admin.location)) {
    ok(`/admin redirects to ${target.label}.`);
  } else {
    warn(`/admin returned HTTP ${admin.status ?? admin.problem} instead of redirecting to ${target.label}.`);
    result = 'warn';
  }

  const api = await probe(`${base}/api/me`);
  if (api.status === 200) {
    fail('/api/me answers without signing in.');
    result = 'fail';
  } else if ([401, 302, 303].includes(api.status)) {
    ok('/api/me requires sign-in.');
  } else {
    warn(`/api/me returned HTTP ${api.status ?? api.problem}.`);
    if (result === 'ok') result = 'warn';
  }
  return result;
}
