// `npm run doctor`: checks that this machine and hop.config.json are ready to deploy.
import { checkHopConfig, checkRemoteMigrations, checkTeamDomain, checkTemplate, checkWranglerLogin, verifyDeployment } from './lib/checks.mjs';
import { bold, readHopConfig, readTemplate, writeDeployConfig } from './lib/cli.mjs';

const config = readHopConfig();
const live = process.argv.includes('--live');
const results = [checkHopConfig(config), checkTemplate(readTemplate())];

if (results[0] === 'ok') {
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
if (!live && !failed) console.log('Run `npm run doctor -- --live` to also check the deployed site.');
process.exit(failed ? 1 : 0);
