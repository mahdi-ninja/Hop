// `npm run doctor`: checks that this machine and hop.config.json are ready to deploy.
// `-- --docker` checks the Docker preset (.env, compose.yaml) instead.
import { checkHopConfig, checkRemoteMigrations, checkTeamDomain, checkTemplate, checkWranglerLogin, verifyDeployment } from './lib/checks.mjs';
import { bold, readHopConfig, readTemplate, writeDeployConfig } from './lib/cli.mjs';
import { checkDocker } from './lib/docker-checks.mjs';

const live = process.argv.includes('--live');
const docker = process.argv.includes('--docker');
const config = docker ? null : readHopConfig();
const results = docker ? await checkDocker({ live }) : [checkHopConfig(config), checkTemplate(readTemplate(), config)];

if (!docker && results[0] !== 'fail') {
  results.push(await checkWranglerLogin(config));
  results.push(await checkTeamDomain(config.access.teamDomain));
  if (results.at(-2) === 'ok') results.push(await checkRemoteMigrations(config, writeDeployConfig(config)));
  if (live) {
    const liveResult = await verifyDeployment(config, { waitSeconds: 0, askToKeepWaiting: false });
    results.push(liveResult === 'pending' ? 'warn' : liveResult);
  }
}

const failed = results.filter((r) => r === 'fail').length;
const warned = results.filter((r) => r === 'warn').length;
console.log(
  `\n${bold(failed ? 'Not ready to deploy: fix the problems marked ✗ above.' : warned ? 'Ready to deploy, with warnings.' : 'Ready to deploy.')}`,
);
if (!live && !failed) console.log(`Run \`npm run doctor -- ${docker ? '--docker ' : ''}--live\` to also check the deployed site.`);
process.exit(failed ? 1 : 0);
