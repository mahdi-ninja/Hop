// `npm run setup`: interactive first-time (or repeat) deployment of Hop to Cloudflare.
// Every step asks before changing anything and offers a default; `--yes` accepts all defaults.
import { checkRemoteMigrations, checkTeamDomain, describeVerification } from './lib/checks.mjs';
import {
  ACCEPT_DEFAULTS,
  HOP_TOKEN_ENV,
  accountEnv,
  ask,
  askSecret,
  bold,
  choose,
  closePrompts,
  confirm,
  dim,
  fail,
  heading,
  info,
  ok,
  readHopConfig,
  readTemplate,
  warn,
  wrangler,
  wranglerJson,
  writeDeployConfig,
  writeHopConfig,
  wranglerTokenOverrideHint,
} from './lib/cli.mjs';
import { accessAppBody, createApi, findHopApp, protectedPaths, teamCanSignIn } from './lib/cloudflare-api.mjs';
import { applyMigrations, deploy } from './deploy.mjs';
import {
  HOP_CONFIG_FILE,
  isPlaceholder,
  isValidAud,
  isValidHostname,
  isWorkersDevHost,
  normalizeHostname,
  normalizeTeamDomain,
  validateHopConfig,
  workersDevHost,
} from './lib/hop-config.mjs';

const TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens';
const DASHBOARD_URL = 'https://dash.cloudflare.com/';
const CHECKLIST = 'docs/CLOUDFLARE-CHECKLIST.md';
const WORKERS_DEV_HINT = 'Cloudflare dashboard → Workers & Pages, shown as "Your subdomain"';
const IDENTITY_PROVIDERS_PATH = 'Zero Trust → Integrations → Identity providers → Add new identity provider';

const LOCATIONS = [
  { value: '', label: 'Automatic', hint: 'near where you create it' },
  { value: 'weur', label: 'Western Europe' },
  { value: 'eeur', label: 'Eastern Europe' },
  { value: 'apac', label: 'Asia Pacific' },
  { value: 'oc', label: 'Oceania' },
  { value: 'wnam', label: 'Western North America' },
  { value: 'enam', label: 'Eastern North America' },
];

const SESSIONS = [
  { value: '24h', label: '24 hours' },
  { value: '168h', label: '1 week' },
  { value: '720h', label: '30 days' },
  { value: '8h', label: '8 hours' },
];

const short = (id) => `${id.slice(0, 8)}…`;

async function stepLogin() {
  heading(1, 'Cloudflare account');
  const override = wranglerTokenOverrideHint();
  if (override) warn(override);
  let me = await wranglerJson(['whoami']).catch(() => ({ loggedIn: false }));
  if (!me.loggedIn && override) {
    throw new Error('Wrangler can\'t use the token in CLOUDFLARE_API_TOKEN. Unset it (`unset CLOUDFLARE_API_TOKEN`) and run setup again.');
  }
  if (!me.loggedIn) {
    warn('Wrangler is not logged in to Cloudflare.');
    if (!(await confirm('Log in now? This opens your browser.', true))) throw new Error('Setup needs a Cloudflare login.');
    await wrangler(['login']);
    me = await wranglerJson(['whoami']);
  }
  ok(`Logged in as ${me.email}.`);
  return me;
}

async function stepAccount(me, previous) {
  const accounts = me.accounts ?? [];
  if (accounts.length === 0) throw new Error('This login has no Cloudflare accounts.');
  const defaultIndex = Math.max(0, accounts.findIndex((a) => a.id === previous?.accountId));
  if (accounts.length === 1) {
    const [only] = accounts;
    if (await confirm(`Deploy to the account "${only.name}"?`, true)) return only.id;
    throw new Error('No other accounts are available to this login. Run `npx wrangler login` with another user.');
  }
  return choose(
    'Which account should Hop live in?',
    accounts.map((a) => ({ value: a.id, label: a.name, hint: a.id })),
    defaultIndex,
  );
}

async function stepCustomDomain(previous) {
  info('Short links will look like https://<domain>/<slug>. The domain must be active in this Cloudflare account.');
  info('Wrangler creates the DNS record and certificate on deploy. Remove any existing DNS record for that exact name first.');
  const template = readTemplate();
  const fromTemplate = isPlaceholder(template.vars?.SHORT_DOMAIN) ? '' : template.vars.SHORT_DOMAIN;
  const previousCustom = previous?.shortDomain && !isWorkersDevHost(previous.shortDomain) ? previous.shortDomain : '';
  const domain = await ask('Domain:', {
    default: previousCustom || fromTemplate,
    validate: (answer) => {
      const host = normalizeHostname(answer);
      if (isWorkersDevHost(host)) return 'That is a workers.dev address; pick the workers.dev option instead.';
      return isValidHostname(host) ? null : 'Enter a hostname like go.yourcompany.com.';
    },
  });
  return normalizeHostname(domain);
}

async function stepWorkersDev(accountId, previous) {
  const workerName = readTemplate().name;
  warn('Links on workers.dev are tied to this Cloudflare account: changing its subdomain or moving accounts breaks every');
  warn('shared link and QR code. Some email filters and company networks also block workers.dev. Fine for trying Hop;');
  warn('use your own domain for links you print or share widely.');
  info('Setup needs your API token now, to look up this account\'s workers.dev address (and later to set up Access).');

  for (;;) {
    const api = createApi(await getToken({ workersDev: true }));
    let subdomain;
    try {
      subdomain = await api.getWorkersSubdomain(accountId);
    } catch (err) {
      if (err?.status === 403) {
        fail('That token works, but it can\'t read the workers.dev subdomain.');
        info('Add Account · Workers Scripts · Read to it (or create a new one with all the permissions above).');
      } else {
        fail(`Cloudflare rejected that token (${err.message}). Check it was copied fully and is still active.`);
      }
      forgetToken();
      const next = await choose('Then:', [
        { value: 'retry', label: 'Paste a different token' },
        { value: 'custom', label: 'Use my own domain instead' },
      ]);
      if (next === 'custom') return stepCustomDomain(previous);
      continue;
    }
    if (!subdomain) {
      warn(`This account has no workers.dev subdomain yet. Pick one in the dashboard: ${WORKERS_DEV_HINT} → Change.`);
      const next = await choose('Then:', [
        { value: 'retry', label: "I've picked one, check again" },
        { value: 'custom', label: 'Use my own domain instead' },
      ]);
      if (next === 'custom') return stepCustomDomain(previous);
      continue;
    }
    const host = workersDevHost(workerName, subdomain);
    ok(`This account's workers.dev subdomain is ${subdomain}.`);
    info(`Short links will look like https://${host}/<slug>.`);
    if (await confirm('Use this address?', true)) return host;
    return stepDomain(accountId, previous);
  }
}

async function stepDomain(accountId, previous) {
  heading(2, 'Short-link domain');
  const kind = await choose(
    'Where should short links live?',
    [
      { value: 'custom', label: 'On my own domain', hint: 'recommended, e.g. go.yourcompany.com' },
      { value: 'workers-dev', label: 'On a free workers.dev address', hint: 'no domain needed; best for trying Hop' },
    ],
    isWorkersDevHost(previous?.shortDomain) ? 1 : 0,
  );
  return kind === 'custom' ? stepCustomDomain(previous) : stepWorkersDev(accountId, previous);
}

async function stepRootRedirect(previous) {
  heading(3, 'The bare domain');
  const choice = await choose(
    'Where should https://<domain>/ go?',
    [
      { value: 'admin', label: 'To the dashboard (/admin)', hint: 'visitors see the Access login' },
      { value: 'url', label: 'To another website', hint: 'e.g. your company homepage' },
    ],
    previous?.rootRedirectUrl ? 1 : 0,
  );
  if (choice === 'admin') return '';
  return ask('Redirect URL:', {
    default: previous?.rootRedirectUrl ?? '',
    validate: (answer) => {
      try {
        return ['http:', 'https:'].includes(new URL(answer).protocol) ? null : 'Use an http(s) URL.';
      } catch {
        return 'Enter a full URL, like https://yourcompany.com.';
      }
    },
  });
}

async function createDatabase(accountId, existing) {
  const taken = new Set(existing.map((d) => d.name));
  let suggested = 'hop';
  for (let n = 2; taken.has(suggested); n++) suggested = `hop-${n}`;
  const name = await ask('Name for the new database:', {
    default: suggested,
    validate: (answer) =>
      taken.has(answer) ? `A database called ${answer} already exists.` : /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(answer) ? null : 'Use letters, numbers, - and _.',
  });
  const location = await choose('Where should its primary copy live?', LOCATIONS, 0);
  const args = ['d1', 'create', name, ...(location ? ['--location', location] : [])];
  const { stdout } = await wrangler(args, { capture: true, env: { ...accountEnv({ accountId }), CI: '1' } });
  const id = stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  if (!id) throw new Error(`Created ${name}, but couldn't read its ID from Wrangler's output:\n${stdout}`);
  ok(`Created database ${name} (${id}).`);
  return { name, id };
}

async function stepDatabase(accountId, previous) {
  heading(4, 'Database (Cloudflare D1)');
  const databases = await wranglerJson(['d1', 'list'], { env: accountEnv({ accountId }) });
  const template = readTemplate();
  const templateDb = template.d1_databases?.find((d) => d.binding === 'DB');
  const knownId = previous?.database?.id || (isPlaceholder(templateDb?.database_id) ? '' : templateDb?.database_id);

  const choices = databases.map((db) => ({
    value: { kind: 'existing', db },
    label: `Use existing "${db.name}"`,
    hint: `${short(db.uuid)} · ${db.num_tables ?? '?'} tables · created ${String(db.created_at ?? '').slice(0, 10)}${db.uuid === knownId ? ' · currently configured' : ''}`,
  }));
  choices.sort((a, b) => Number(b.value.db.uuid === knownId) - Number(a.value.db.uuid === knownId) || Number(b.value.db.name === 'hop') - Number(a.value.db.name === 'hop'));
  choices.push({ value: { kind: 'create' }, label: 'Create a new database' });
  choices.push({ value: { kind: 'manual' }, label: 'Enter a database ID' });

  if (databases.length) info(`This account has ${databases.length} D1 database${databases.length === 1 ? '' : 's'}.`);
  const defaultIndex = choices[0].value.kind === 'existing' && (choices[0].value.db.uuid === knownId || choices[0].value.db.name === 'hop') ? 0 : choices.length - 2;
  const picked = await choose('Which database should Hop use?', choices, defaultIndex);

  if (picked.kind === 'create') return createDatabase(accountId, databases);
  if (picked.kind === 'manual') {
    const id = await ask('Database ID:', {
      validate: (a) => (/^[0-9a-f-]{36}$/.test(a) ? null : 'A D1 database ID is a UUID like 11111111-2222-4333-8444-555555555555.'),
    });
    const match = databases.find((d) => d.uuid === id);
    return { name: match?.name ?? (await ask('Database name:', { default: 'hop' })), id };
  }
  const { db } = picked;
  if (db.num_tables > 0 && db.uuid !== knownId) {
    warn(`"${db.name}" already has ${db.num_tables} tables. Hop only adds its own tables, and migrations it already ran are skipped.`);
    if (!(await confirm(`Use "${db.name}" anyway?`, true))) return stepDatabase(accountId, previous);
  }
  return { name: db.name, id: db.uuid };
}

// The token is asked for once per run: the workers.dev lookup and the Access step share it.
let cachedToken = null;

function forgetToken() {
  cachedToken = null;
}

async function getToken({ workersDev = false } = {}) {
  if (cachedToken) return cachedToken;
  if (process.env[HOP_TOKEN_ENV] && (await confirm(`Use the API token in $${HOP_TOKEN_ENV}?`, true))) {
    cachedToken = process.env[HOP_TOKEN_ENV];
    return cachedToken;
  }
  console.log(`\n  Create a token at ${bold(TOKEN_URL)} (My Profile → API Tokens) → Create Token → create a custom token, with:`);
  console.log('    · Permissions: Account · Access: Apps and Policies · Edit');
  console.log('    · Permissions: Account · Access: Organizations, Identity Providers, and Groups · Read');
  if (workersDev) console.log('    · Permissions: Account · Workers Scripts · Read (to look up your workers.dev address)');
  console.log('    · Account Resources: Include · this account');
  console.log(dim(`  Step by step: ${CHECKLIST}, "API token".`));
  console.log(dim(`  It is used for this run only and never written to disk. You can delete it afterwards.`));
  console.log(dim(`  Tip: set ${HOP_TOKEN_ENV} before running setup to skip this prompt (not CLOUDFLARE_API_TOKEN,`));
  console.log(dim('  which Wrangler would use instead of your login).\n'));
  if (ACCEPT_DEFAULTS) throw new Error(`Set ${HOP_TOKEN_ENV} to use automatic Access setup with --yes.`);
  cachedToken = await askSecret('Paste the token and press Enter (it stays hidden while you type):');
  return cachedToken;
}

function defaultAllowed(me, previous) {
  if (previous?.access?.allowed?.length) return previous.access.allowed.join(', ');
  const domain = me.email?.split('@')[1];
  return domain ? `@${domain}` : '';
}

async function askWhoMaySignIn(me, previous) {
  info('Enter @domain for everyone at a domain, or full email addresses. Separate several with commas.');
  const answer = await ask('Who may sign in?', {
    default: defaultAllowed(me, previous),
    validate: (a) => {
      const entries = a.split(',').map((s) => s.trim()).filter(Boolean);
      if (!entries.length) return 'Enter at least one domain or email.';
      const bad = entries.find((e) => !/^(@?[a-z0-9-]+(\.[a-z0-9-]+)+|[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+)$/i.test(e));
      return bad ? `"${bad}" isn't an email address or @domain.` : null;
    },
  });
  return answer.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function checkSignInMethods(api, accountId) {
  try {
    const providers = await api.listIdentityProviders(accountId);
    if (teamCanSignIn(providers)) {
      ok(`Login methods: ${providers.map((p) => p.name ?? p.type).join(', ')}.`);
      return;
    }
    warn('Only members of your Cloudflare account can sign in right now (Cloudflare’s own login is the only method).');
    warn(`To let teammates sign in with an emailed code, add One-time PIN: ${IDENTITY_PROVIDERS_PATH} → One-time PIN.`);
  } catch {
    info(`Couldn't read your login methods. Make sure your team can sign in: ${IDENTITY_PROVIDERS_PATH}.`);
  }
}

async function stepAccessAutomatic(me, accountId, shortDomain, previous) {
  const api = createApi(await getToken());
  await api.verifyToken().catch(() => {
    throw new Error('Cloudflare rejected that API token. Check it was copied fully and is still active.');
  });

  let org = await api.getAccessOrganization(accountId);
  while (!org) {
    warn(`Zero Trust isn't set up in this account yet. In ${DASHBOARD_URL} select Zero Trust, choose a team name and`);
    warn(`the Free plan (a payment method is required, but Free isn't charged), then come back. See ${CHECKLIST}.`);
    const next = await choose('Then:', [
      { value: 'retry', label: "I've set it up, check again" },
      { value: 'manual', label: 'Switch to guided manual setup' },
    ]);
    if (next === 'manual') return null;
    org = await api.getAccessOrganization(accountId);
  }
  const teamDomain = normalizeTeamDomain(org.auth_domain);
  ok(`Zero Trust team domain: ${teamDomain}`);
  await checkSignInMethods(api, accountId);

  const existing = findHopApp(await api.listAccessApps(accountId), shortDomain);
  let action = 'create';
  if (existing) {
    info(`Found an Access application protecting ${shortDomain}/admin: "${existing.name}".`);
    action = await choose('What should setup do with it?', [
      { value: 'keep', label: 'Use it as it is', hint: 'keeps its current sign-in rules' },
      { value: 'update', label: 'Update its paths and sign-in rule', hint: 'from the answers you give next' },
    ]);
  }
  if (action === 'keep') {
    ok(`Using "${existing.name}".`);
    return { teamDomain, aud: existing.aud, appId: existing.id, allowed: previous?.access?.allowed };
  }

  const allowed = await askWhoMaySignIn(me, previous);
  const sessionDuration = await choose('How long should a sign-in last?', SESSIONS, 0);
  const body = accessAppBody({ shortDomain, allowed, sessionDuration });
  info(`The application will protect ${protectedPaths(shortDomain).join(' and ')} only, so short links stay public.`);
  if (!(await confirm(`${action === 'update' ? 'Update' : 'Create'} the Access application now?`, true))) {
    throw new Error('Stopped before changing Access.');
  }
  const app = action === 'update' ? await api.updateAccessApp(accountId, existing.id, body) : await api.createAccessApp(accountId, body);
  ok(`${action === 'update' ? 'Updated' : 'Created'} Access application "${app.name}".`);
  info(`Add or change login methods (One-time PIN, Google, GitHub) under ${IDENTITY_PROVIDERS_PATH}.`);
  return { teamDomain, aud: app.aud, appId: app.id, allowed };
}

async function stepAccessManual(shortDomain, previous) {
  const [adminPath, apiPath] = protectedPaths(shortDomain);
  if (isWorkersDevHost(shortDomain)) {
    warn('The dashboard may only offer domains from your zones, so it may not let you pick a workers.dev address.');
    warn('If it doesn’t, run setup again and choose automatic Access setup, which works for workers.dev.');
  }
  console.log(`
  In the Cloudflare dashboard (${bold(DASHBOARD_URL)}), go to ${bold('Zero Trust')}:
    1. First time? Choose a team name and the Free plan (a payment method is required; Free isn't charged).
    2. ${bold('Integrations → Identity providers')}: make sure your team can sign in. New organizations only
       allow members of your Cloudflare account; add ${bold('One-time PIN')} (email codes), Google or GitHub.
    3. ${bold('Access controls → Applications → Create new application → Self-hosted and private')}.
    4. ${bold('Add public hostname')} twice: ${bold(adminPath)} and ${bold(apiPath)} (domain, then path).
       Do ${bold('not')} add the bare domain; short links must stay public.
    5. Under Access policies, create a policy: Action ${bold('Allow')}, include ${bold('Emails ending in')} your
       team's domain (e.g. @yourcompany.com) or ${bold('Emails')} for specific people. Then ${bold('Create')}.
    6. Open the application → ${bold('Configure')} → ${bold('Additional settings')}, and copy the ${bold('Application Audience (AUD) Tag')}.
       Under Cookie settings there, set SameSite to ${bold('Lax')} and keep HttpOnly on.
  Your team domain is under ${bold('Zero Trust → Settings')}. Screens change; ${CHECKLIST} links Cloudflare's current guides.
`);
  if (!ACCEPT_DEFAULTS) await ask('Press Enter when the application exists.', { default: 'done' });

  let teamDomain;
  for (;;) {
    teamDomain = normalizeTeamDomain(
      await ask('Team domain (e.g. yourteam or yourteam.cloudflareaccess.com):', { default: previous?.access?.teamDomain ?? '' }),
    );
    if ((await checkTeamDomain(teamDomain)) !== 'fail') break;
    if (!(await confirm('Enter it again?', true))) break;
  }
  const aud = (
    await ask('Application Audience (AUD) tag:', {
      default: isValidAud(previous?.access?.aud) ? previous.access.aud : '',
      validate: (a) => (isValidAud(a.trim().toLowerCase()) ? null : 'The AUD tag is 64 hexadecimal characters.'),
    })
  ).toLowerCase();
  return { teamDomain, aud };
}

async function stepAccess(me, accountId, shortDomain, previous) {
  heading(5, 'Sign-in with Cloudflare Access');
  info('Access protects /admin and /api at Cloudflare’s edge; the Worker also verifies every sign-in token.');
  const hasValues = isValidAud(previous?.access?.aud) && previous?.access?.teamDomain;
  const choices = [
    { value: 'auto', label: 'Set it up automatically', hint: 'needs a Cloudflare API token with Access permissions' },
    { value: 'manual', label: 'Guide me through the dashboard', hint: 'no token; you paste two values back' },
  ];
  if (hasValues) choices.unshift({ value: 'keep', label: 'Keep the current Access settings', hint: previous.access.teamDomain });
  const mode = await choose('How do you want to set up Access?', choices, 0);
  if (mode === 'keep') return previous.access;
  if (mode === 'auto') {
    const result = await stepAccessAutomatic(me, accountId, shortDomain, previous);
    if (result) return result;
  }
  return stepAccessManual(shortDomain, previous);
}

function printSummary(config) {
  console.log(`
  ${bold('Account')}        ${config.accountId}
  ${bold('Domain')}         https://${config.shortDomain}
  ${bold('Bare domain')}    ${config.rootRedirectUrl || '→ /admin'}
  ${bold('Database')}       ${config.database.name} (${config.database.id})
  ${bold('Access')}         ${config.access.teamDomain} · AUD ${short(config.access.aud)}${config.access.allowed ? ` · ${config.access.allowed.join(', ')}` : ''}`);
}

async function main() {
  console.log(`${bold('Hop setup')} ${dim('— press Ctrl+C at any time to stop. Nothing changes without asking.')}`);
  const saved = readHopConfig();
  let previous = saved;
  if (saved) {
    const complete = validateHopConfig(saved, { workerName: readTemplate().name }).length === 0;
    info(`Found ${HOP_CONFIG_FILE} for ${saved.shortDomain ?? 'an unfinished setup'}${complete ? '' : ' (incomplete)'}.`);
    const start = await choose(
      'What would you like to do?',
      [
        ...(complete ? [{ value: 'deploy', label: 'Deploy with these settings', hint: 'skips the questions' }] : []),
        { value: 'update', label: 'Go through setup, using these settings as defaults' },
        { value: 'fresh', label: 'Start from scratch' },
      ],
      0,
    );
    if (start === 'deploy') return finish(saved);
    if (start === 'fresh') previous = null;
  }

  const me = await stepLogin();
  const accountId = await stepAccount(me, previous);
  const shortDomain = await stepDomain(accountId, previous);
  const rootRedirectUrl = await stepRootRedirect(previous);
  const database = await stepDatabase(accountId, previous);
  const access = await stepAccess(me, accountId, shortDomain, previous);

  const config = { accountId, shortDomain, rootRedirectUrl, database, access };
  heading(6, 'Review');
  printSummary(config);
  const problems = validateHopConfig(config, { workerName: readTemplate().name });
  if (problems.length) {
    problems.forEach((p) => fail(p));
    throw new Error('These settings are incomplete. Run setup again to fix them.');
  }
  if (!(await confirm(`\nSave these settings to ${HOP_CONFIG_FILE}?`, true))) throw new Error('Nothing saved.');
  writeHopConfig(config);
  ok(`Saved ${HOP_CONFIG_FILE}. It's git-ignored; keep a copy somewhere safe, it identifies your deployment.`);
  return finish(config);
}

async function finish(config) {
  const deployConfig = writeDeployConfig(config);
  heading(7, 'Database migrations');
  const state = await checkRemoteMigrations(config, deployConfig);
  let migrated = state === 'ok';
  if (state !== 'ok' && (await confirm(`Apply migrations to "${config.database.name}" now?`, true))) {
    await applyMigrations(config, deployConfig);
    migrated = true;
  }

  heading(8, 'Deploy');
  if (!migrated) warn('The database has pending migrations; the deployed Worker needs them. `npm run deploy` applies them.');
  if (!(await confirm(`Build and deploy Hop to https://${config.shortDomain} now?`, true))) {
    console.log(`\nWhen you're ready, run ${bold('npm run deploy')}.`);
    return;
  }
  closePrompts();
  const result = await deploy(config, { checks: true, firstStep: 9 });
  console.log(`\n${bold(describeVerification(result, config))}`);
  if (result !== 'fail') console.log(`Next time, just run ${bold('npm run deploy')}.`);
}

try {
  await main();
} catch (err) {
  if (err?.code === 'ABORT_ERR' || err?.name === 'AbortError') console.log('\nSetup stopped.');
  else fail(err.message);
  process.exitCode = 1;
} finally {
  closePrompts();
}
