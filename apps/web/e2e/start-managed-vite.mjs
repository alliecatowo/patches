#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HARNESS_ORIGIN = 'http://127.0.0.1:8088';
const RUNTIME_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'XDG_CACHE_HOME',
  'CI',
  'FORCE_COLOR',
  'NO_COLOR',
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (process.platform !== 'linux') {
  fail('managed browser Vite is Linux-only, matching patches-harness process ownership');
}
if (process.env['PATCHES_DEV_UPSTREAM'] !== HARNESS_ORIGIN) {
  fail('managed browser Vite requires the attested harness HTTP origin');
}

const childEnvironment = {};
for (const key of RUNTIME_KEYS) {
  const value = process.env[key];
  if (value !== undefined) childEnvironment[key] = value;
}
childEnvironment['PATCHES_DEV_UPSTREAM'] = HARNESS_ORIGIN;
childEnvironment['VITE_PATCHES_DISABLE_SERVICE_WORKER'] = '1';

if (process.argv[2] === '--print-child-env') {
  process.stdout.write(`${JSON.stringify(childEnvironment)}\n`);
  process.exit(0);
}

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(
  'pnpm',
  [
    'exec',
    'vite',
    '--config',
    'e2e/vite.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ],
  {
    cwd: webRoot,
    detached: true,
    env: childEnvironment,
    stdio: 'inherit',
  },
);

function forward(signal) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
      process.stderr.write(`could not forward ${signal} to managed Vite: ${String(error)}\n`);
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => forward(signal));
}
child.on('error', (error) => {
  process.stderr.write(`could not start managed Vite: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === null ? 0 : 1);
});
