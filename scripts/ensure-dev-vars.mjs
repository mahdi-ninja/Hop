// Run by `npm run dev`: creates .dev.vars from .dev.vars.example when it's missing, so the local
// sign-in shortcut works straight after cloning. An existing .dev.vars is never touched.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const target = join(root, '.dev.vars');
const example = join(root, '.dev.vars.example');

if (!existsSync(target) && existsSync(example)) {
  copyFileSync(example, target);
  console.log('Created .dev.vars from .dev.vars.example (local sign-in as DEV_AUTH_EMAIL). Edit it to change the email.');
}
