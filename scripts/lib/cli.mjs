import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { buildDeployConfig, DEPLOY_CONFIG_FILE, HOP_CONFIG_FILE, parseJsonc } from './hop-config.mjs';

export const ROOT = new URL('../..', import.meta.url).pathname;
export const ACCEPT_DEFAULTS = process.argv.includes('--yes');

const color = (code) => (text) => (stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const bold = color('1');
export const dim = color('2');
export const green = color('32');
export const yellow = color('33');
export const red = color('31');
export const teal = color('36');

export const ok = (msg) => console.log(`${green('✓')} ${msg}`);
export const warn = (msg) => console.log(`${yellow('!')} ${msg}`);
export const fail = (msg) => console.log(`${red('✗')} ${msg}`);
export const info = (msg) => console.log(`${dim('·')} ${msg}`);

export function heading(step, title) {
  console.log(`\n${teal(bold(`${step}.`))} ${bold(title)}`);
}

// Input is read through one queue of lines, so answers piped in (or typed ahead) while a command
// is running aren't lost the way they are with readline's question().
let rl = null;
let closed = false;
let muted = false;
const pendingLines = [];
const waiters = [];

function input() {
  if (rl) return rl;
  // Readline echoes typing to its output; routing that through this stream lets secrets go unechoed.
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) return stdout.write(chunk, encoding, done);
      if (String(chunk).includes('\n')) stdout.write('\n');
      done();
    },
  });
  output.isTTY = stdout.isTTY;
  Object.defineProperty(output, 'columns', { get: () => stdout.columns });
  stdout.on('resize', () => output.emit('resize'));
  rl = createInterface({ input: stdin, output, terminal: Boolean(stdin.isTTY) });
  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else pendingLines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift().reject(new Error('Input ended before setup finished.'));
  });
  rl.on('SIGINT', () => {
    console.log('\nStopped. Nothing further was changed.');
    process.exit(130);
  });
  return rl;
}

async function readLine(promptText, { secret = false } = {}) {
  const r = input();
  if (closed) {
    stdout.write(promptText);
  } else {
    r.setPrompt(promptText);
    r.prompt();
  }
  muted = secret;
  try {
    if (pendingLines.length) {
      const line = pendingLines.shift();
      if (!stdin.isTTY) stdout.write(`${secret ? '' : line}\n`);
      return line;
    }
    if (closed) throw new Error('Input ended before setup finished.');
    return await new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  } finally {
    muted = false;
  }
}

export function closePrompts() {
  rl?.close();
  rl = null;
  closed = false;
}

/** Free-text question. `validate` returns an error message, or null when the answer is fine. */
export async function ask(question, { default: fallback = '', validate, hint } = {}) {
  if (hint) console.log(dim(`  ${hint}`));
  if (ACCEPT_DEFAULTS && fallback) {
    console.log(`${question} ${dim(`→ ${fallback}`)}`);
    return fallback;
  }
  for (;;) {
    const suffix = fallback ? ` ${dim(`[${fallback}]`)}` : '';
    const answer = (await readLine(`${question}${suffix} `)).trim() || fallback;
    const problem = validate ? validate(answer) : answer ? null : 'An answer is required.';
    if (!problem) return answer;
    console.log(red(`  ${problem}`));
  }
}

export async function confirm(question, fallback = true) {
  if (ACCEPT_DEFAULTS) {
    console.log(`${question} ${dim(`→ ${fallback ? 'yes' : 'no'}`)}`);
    return fallback;
  }
  for (;;) {
    const answer = (await readLine(`${question} ${dim(fallback ? '[Y/n]' : '[y/N]')} `)).trim().toLowerCase();
    if (!answer) return fallback;
    if (['y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    console.log(red('  Answer y or n.'));
  }
}

/** Numbered menu. `choices` are { value, label, hint? }; returns the chosen value. */
export async function choose(question, choices, defaultIndex = 0) {
  console.log(question);
  choices.forEach((c, i) => {
    const marker = i === defaultIndex ? green('›') : ' ';
    console.log(`  ${marker} ${bold(String(i + 1))}) ${c.label}${c.hint ? dim(`  ${c.hint}`) : ''}`);
  });
  if (ACCEPT_DEFAULTS) {
    console.log(dim(`  → ${defaultIndex + 1}`));
    return choices[defaultIndex].value;
  }
  for (;;) {
    const answer = (await readLine(`Choose 1-${choices.length} ${dim(`[${defaultIndex + 1}]`)} `)).trim();
    const index = answer ? Number(answer) - 1 : defaultIndex;
    if (Number.isInteger(index) && choices[index]) return choices[index].value;
    console.log(red(`  Enter a number from 1 to ${choices.length}.`));
  }
}

/** Reads a line without echoing it, for API tokens. */
export async function askSecret(question) {
  return (await readLine(`${question} `, { secret: true })).trim();
}

/** Runs a command. `capture` returns stdout; otherwise output streams to the terminal. */
export function run(cmd, args, { capture = false, env = {}, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (d) => (out += d));
    child.stderr?.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || allowFailure) resolve({ code, stdout: out, stderr: err });
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}${err ? `\n${err.trim()}` : ''}`));
    });
  });
}

export const wrangler = (args, options) => run('npx', ['wrangler', ...args], options);

export async function wranglerJson(args, options) {
  const { stdout: out } = await wrangler([...args, '--json'], { capture: true, ...options });
  return JSON.parse(out);
}

export function readTemplate() {
  return parseJsonc(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
}

export function hopConfigPath() {
  return join(ROOT, HOP_CONFIG_FILE);
}

export function readHopConfig() {
  const path = hopConfigPath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeHopConfig(config) {
  writeFileSync(hopConfigPath(), `${JSON.stringify(config, null, 2)}\n`);
}

/** Writes the merged Wrangler config for deploys and returns its path relative to the repo root. */
export function writeDeployConfig(config) {
  const path = join(ROOT, DEPLOY_CONFIG_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(buildDeployConfig(readTemplate(), config), null, 2)}\n`);
  return DEPLOY_CONFIG_FILE;
}

/** Wrangler commands that target the account in hop.config.json without prompting for it. */
export const accountEnv = (config) => ({ CLOUDFLARE_ACCOUNT_ID: config.accountId });
