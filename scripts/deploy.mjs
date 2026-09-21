// `npm run deploy`: preflight checks, dashboard build, remote migrations, then `wrangler deploy`,
// all against the config merged from wrangler.jsonc and hop.config.json.
// `node scripts/deploy.mjs migrate` only applies remote migrations.
import { checkHopConfig, checkTeamDomain, checkTemplate, checkWranglerLogin, verifyDeployment } from './lib/checks.mjs';
import { accountEnv, bold, fail, heading, readHopConfig, readTemplate, run, wrangler, writeDeployConfig } from './lib/cli.mjs';

const migrateOnly = process.argv[2] === 'migrate';
const config = readHopConfig();

export async function applyMigrations(cfg, deployConfig) {
  // CI=1 skips Wrangler's own confirmation prompt; the caller has already decided to migrate.
  await wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', deployConfig], { env: { ...accountEnv(cfg), CI: '1' } });
}

export async function deploy(cfg, { checks = true, firstStep = 1 } = {}) {
  let step = firstStep;
  if (checks) {
    heading(step++, 'Preflight checks');
    const results = [checkHopConfig(cfg), checkTemplate(readTemplate())];
    if (results[0] === 'ok') results.push(await checkWranglerLogin(cfg), await checkTeamDomain(cfg.access.teamDomain));
    if (results.includes('fail')) {
      fail('Fix the problems above, or run `npm run setup` again.');
      process.exit(1);
    }
  }
  const deployConfig = writeDeployConfig(cfg);

  heading(step++, 'Build the dashboard');
  await run('npm', ['run', 'build:dashboard']);

  heading(step++, 'Apply database migrations');
  await applyMigrations(cfg, deployConfig);

  heading(step++, `Deploy to ${cfg.shortDomain}`);
  await wrangler(['deploy', '--config', deployConfig], { env: accountEnv(cfg) });

  heading(step++, 'Check the live site');
  return verifyDeployment(cfg);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!config) {
    fail('No hop.config.json found. Run `npm run setup` first.');
    process.exit(1);
  }
  try {
    if (migrateOnly) {
      if (checkHopConfig(config) === 'fail') process.exit(1);
      await applyMigrations(config, writeDeployConfig(config));
    } else {
      const result = await deploy(config);
      console.log(`\n${bold(result === 'fail' ? 'Deployed, but the live checks found problems (see above).' : `Hop is live at https://${config.shortDomain}/admin`)}`);
      process.exit(result === 'fail' ? 1 : 0);
    }
  } catch (err) {
    fail(err.message);
    process.exit(1);
  }
}
