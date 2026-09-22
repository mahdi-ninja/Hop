// `npm run setup`: interactive first-time (or repeat) deployment of Hop to Cloudflare.
// Every step asks before changing anything and offers a default; `--yes` accepts all defaults.
import { checkRemoteMigrations, checkTeamDomain, describeVerification } from './lib/checks.mjs';
import {
  ACCEPT_DEFAULTS,
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
} from './lib/cli.mjs';
import { accessAppBody, createApi, findHopApp, protectedPaths } from './lib/cloudflare-api.mjs';
import { applyMigrations, deploy } from './deploy.mjs';
import {
  HOP_CONFIG_FILE,
  isPlaceholder,
  isValidAud,
  isValidHostname,
  normalizeHostname,
  normalizeTeamDomain,
  validateHopConfig,
} from './lib/hop-config.mjs';

const TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens';
const ZERO_TRUST_URL = 'https://one.dash.cloudflare.com/';

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
  let me = await wranglerJson(['whoami']).catch(() => ({ loggedIn: false }));
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

async function stepDomain(previous) {
  heading(2, 'Short-link domain');
  info('Short links will look like https://<domain>/<slug>. The domain must be a zone in this Cloudflare account.');
  info('Wrangler creates the DNS record and certificate on deploy. Remove any existing DNS record for that exact name first.');
  const template = readTemplate();
  const fromTemplate = isPlaceholder(template.vars?.SHORT_DOMAIN) ? '' : template.vars.SHORT_DOMAIN;
  const domain = await ask('Domain:', {
    default: previous?.shortDomain || fromTemplate,
    validate: (answer) => (isValidHostname(normalizeHostname(answer)) ? null : 'Enter a hostname like go.yourcompany.com.'),
  });
  return normalizeHostname(domain);
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

async function getToken() {
  if (process.env.CLOUDFLARE_API_TOKEN && (await confirm('Use the API token in $CLOUDFLARE_API_TOKEN?', true))) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }
  console.log(`\n  Create a token at ${bold(TOKEN_URL)} → Create Token → Custom token, with:`);
  console.log('    · Account › Access: Apps and Policies › Edit');
  console.log('    · Account › Access: Organizations, Identity Providers, and Groups › Read');
  console.log(dim('  It is used for this run only and never written to disk. You can delete it afterwards.\n'));
  if (ACCEPT_DEFAULTS) throw new Error('Set CLOUDFLARE_API_TOKEN to use automatic Access setup with --yes.');
  return askSecret('Paste the token (input is hidden):');
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

async function stepAccessAutomatic(me, accountId, shortDomain, previous) {
  const api = createApi(await getToken());
  await api.verifyToken().catch(() => {
    throw new Error('Cloudflare rejected that API token. Check it was copied fully and is still active.');
  });

  let org = await api.getAccessOrganization(accountId);
  while (!org) {
    warn(`Zero Trust isn't set up in this account yet. Open ${ZERO_TRUST_URL}, pick a team name, and come back.`);
    const next = await choose('Then:', [
      { value: 'retry', label: "I've set it up, check again" },
      { value: 'manual', label: 'Switch to guided manual setup' },
    ]);
    if (next === 'manual') return null;
    org = await api.getAccessOrganization(accountId);
  }
  const teamDomain = normalizeTeamDomain(org.auth_domain);
  ok(`Zero Trust team domain: ${teamDomain}`);

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
  info('One-time PIN by email works out of the box. Add Google or GitHub login under Zero Trust → Settings → Authentication.');
  return { teamDomain, aud: app.aud, appId: app.id, allowed };
}

async function stepAccessManual(shortDomain, previous) {
  const [adminPath, apiPath] = protectedPaths(shortDomain);
  console.log(`
  In ${bold(ZERO_TRUST_URL)}:
    1. If this is your first time, pick a team name.
    2. Access → Applications → Add an application → Self-hosted.
    3. Add two destinations: ${bold(adminPath)} and ${bold(apiPath)}.
       Do ${bold('not')} add the bare domain; short links must stay public.
    4. Add a policy: Action ${bold('Allow')}, include the emails or email domain of your team.
    5. Save, then open the application's overview and copy the ${bold('Application Audience (AUD) tag')}.
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
    const complete = validateHopConfig(saved).length === 0;
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
  const shortDomain = await stepDomain(previous);
  const rootRedirectUrl = await stepRootRedirect(previous);
  const database = await stepDatabase(accountId, previous);
  const access = await stepAccess(me, accountId, shortDomain, previous);

  const config = { accountId, shortDomain, rootRedirectUrl, database, access };
  heading(6, 'Review');
  printSummary(config);
  const problems = validateHopConfig(config);
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
