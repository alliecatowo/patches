import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { UpgradeInfo } from './check.js';

export type InstallMethod = 'npm-global' | 'pnpm-global' | 'source-checkout' | 'unknown';

export interface InstallResult {
  ok: boolean;
  /** Success summary, or the tail of the installer's own output on failure. */
  message: string;
  /** Present whenever the caller should be told the exact command to run by hand — always set
   * on failure, and on the `source-checkout` "don't attempt it" outcome. */
  manualCommand?: string;
}

/**
 * Detects how the running `patches` binary got onto this machine, from `process.argv[1]`'s
 * path — the only reliable signal at runtime (there is no installed-via metadata file).
 * `exists` is injectable so tests can simulate a repo checkout without touching real disk.
 */
export function detectInstallMethod(
  argv1: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean = existsSync,
): InstallMethod {
  const normalized = argv1.replace(/\\/g, '/');

  if (isRunningFromSourceCheckout(normalized, exists)) return 'source-checkout';
  if (normalized.includes('/pnpm/global/')) return 'pnpm-global';
  if (
    normalized.includes('/lib/node_modules/patches-social/') ||
    normalized.includes('/node_modules/patches-social/') ||
    (env.npm_config_user_agent ?? '').startsWith('npm/')
  ) {
    return 'npm-global';
  }
  return 'unknown';
}

/** Walks up from the running file looking for `pnpm-workspace.yaml` — a repo checkout's
 * `dist/cli.js` (or `src/cli.tsx` under `tsx`) always has one a few directories up; a real
 * global install never does (its `node_modules` ancestor tree has no workspace file at all). */
function isRunningFromSourceCheckout(path: string, exists: (path: string) => boolean): boolean {
  let dir = dirname(path);
  for (let depth = 0; depth < 8; depth += 1) {
    if (exists(join(dir, 'pnpm-workspace.yaml'))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return false;
}

export interface InstallOptions {
  argv1?: string;
  env?: NodeJS.ProcessEnv;
  /** Injectable source-checkout probe so install behavior tests never depend on the machine's
   * real checkout path. Production uses `existsSync`. */
  exists?: (path: string) => boolean;
  /** Called with each trimmed, non-empty line of the installer's stdout/stderr as it runs. */
  onOutput?: (line: string) => void;
  /** Injectable for tests — must never be called with anything but an argument array (no
   * shell string interpolation, so a malicious/odd asset URL can't inject shell syntax). */
  spawnFn?: typeof spawn;
}

/** Upgrades the running install in place. Never shells out through a string — always an
 * argv array — so `upgrade.assetUrl` (attacker-controlled in principle, since it comes from a
 * GitHub API response) can't be interpreted as shell syntax. */
export async function installUpgrade(
  upgrade: Pick<UpgradeInfo, 'assetUrl'>,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const argv1 = options.argv1 ?? process.argv[1] ?? '';
  const env = options.env ?? process.env;
  const spawnFn = options.spawnFn ?? spawn;
  const onOutput = options.onOutput ?? ((): void => {});

  const method = detectInstallMethod(argv1, env, options.exists);

  if (method === 'source-checkout') {
    const manualCommand = 'git pull && pnpm build';
    return {
      ok: false,
      message: 'Running from a repo checkout — upgrade with `git pull && pnpm build` instead.',
      manualCommand,
    };
  }

  if (method === 'pnpm-global') {
    const manualCommand = `pnpm add -g ${upgrade.assetUrl}`;
    const result = await runCommand('pnpm', ['add', '-g', upgrade.assetUrl], spawnFn, onOutput);
    return toInstallResult(result, manualCommand);
  }

  // npm-global and unknown both default to npm: it's the documented, always-available install
  // path (docs/operations/try-it.md), and the safest general fallback when detection is unsure.
  const withFlagCommand = `npm install --global --allow-remote=all ${upgrade.assetUrl}`;
  const withFlag = await runCommand(
    'npm',
    ['install', '--global', '--allow-remote=all', upgrade.assetUrl],
    spawnFn,
    onOutput,
  );
  if (withFlag.ok) return toInstallResult(withFlag, withFlagCommand);
  if (!withFlag.rejectedFlag) return toInstallResult(withFlag, withFlagCommand);

  // Older npm (<12) doesn't understand --allow-remote=all at all and exits nonzero on the
  // unrecognized flag itself — retry without it rather than reporting a false failure.
  const withoutFlagCommand = `npm install --global ${upgrade.assetUrl}`;
  const withoutFlag = await runCommand(
    'npm',
    ['install', '--global', upgrade.assetUrl],
    spawnFn,
    onOutput,
  );
  return toInstallResult(withoutFlag, withoutFlagCommand);
}

interface CommandResult {
  ok: boolean;
  output: string;
  rejectedFlag: boolean;
}

function runCommand(
  command: string,
  args: readonly string[],
  spawnFn: typeof spawn,
  onOutput: (line: string) => void,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    const handleChunk = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed !== '') onOutput(trimmed);
      }
    };
    child.stdout?.on('data', handleChunk);
    child.stderr?.on('data', handleChunk);

    child.on('error', (error) => {
      resolve({ ok: false, output: `${output}\n${error.message}`.trim(), rejectedFlag: false });
    });
    child.on('close', (code) => {
      const ok = code === 0;
      const rejectedFlag = !ok && /allow-remote|unknown option|unrecognized/i.test(output);
      resolve({ ok, output, rejectedFlag });
    });
  });
}

function toInstallResult(result: CommandResult, manualCommand: string): InstallResult {
  if (result.ok) return { ok: true, message: 'Upgrade installed.' };
  const tail = result.output.trim().split('\n').slice(-5).join('\n').trim();
  return {
    ok: false,
    message: tail !== '' ? tail : 'The installer exited with an error.',
    manualCommand,
  };
}
