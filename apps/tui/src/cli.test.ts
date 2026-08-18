import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * These drive the real `patches` entrypoint (`cli.tsx`) as a subprocess rather than
 * importing it: the module runs `main()` at the top level as a side effect of import
 * (spec of a CLI entrypoint), so importing it in-process would execute the real
 * program against `process.argv`/stdio instead of letting the test control them. A
 * subprocess is the only way to observe its actual stdout/stderr/exit code contract
 * without also driving a full Ink render (see `docs/agents/HARNESS.md` non-TTY note).
 *
 * Piped stdio is never a TTY, so these also exercise the `!process.stdout.isTTY` guard
 * in `runTui()` for free — no `ping`/TUI case needs a real server for this file.
 */
function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('pnpm', ['exec', 'tsx', 'src/cli.tsx', ...args], {
    encoding: 'utf8',
    cwd: TUI_ROOT,
    timeout: 15_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const TUI_ROOT = fileURLToPath(new URL('..', import.meta.url));

function packageVersion(): string {
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  if (typeof raw === 'object' && raw !== null && 'version' in raw) {
    const { version } = raw;
    if (typeof version === 'string') return version;
  }
  throw new Error('apps/tui/package.json has no "version"');
}

const SPAWN_TIMEOUT = 15_000;

describe('patches CLI entrypoint (cli.tsx)', () => {
  it(
    '--version prints the package version and exits 0',
    () => {
      const result = runCli(['--version']);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(packageVersion());
    },
    SPAWN_TIMEOUT,
  );

  it(
    '--help prints usage and exits 0',
    () => {
      const result = runCli(['--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('patches ping');
    },
    SPAWN_TIMEOUT,
  );

  it(
    'an unknown flag explains itself on stderr, prints usage, and exits 1',
    () => {
      const result = runCli(['--wat']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--wat');
      expect(result.stderr).toContain('Usage:');
    },
    SPAWN_TIMEOUT,
  );

  it(
    'opening the TUI with no TTY fails cleanly and points at `ping` instead',
    () => {
      const result = runCli([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('interactive terminal');
      expect(result.stderr).toContain('patches ping');
      expect(result.stdout).toBe('');
    },
    SPAWN_TIMEOUT,
  );

  it(
    '`keys --help` prints usage for the SSH-credential subcommands (P1-013)',
    () => {
      const result = runCli(['keys', '--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('patches keys add');
      expect(result.stdout).toContain('patches keys list');
      expect(result.stdout).toContain('patches keys remove');
    },
    SPAWN_TIMEOUT,
  );

  it(
    '`keys` with no subcommand explains itself and exits 1',
    () => {
      const result = runCli(['keys']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('subcommand is required');
    },
    SPAWN_TIMEOUT,
  );
});
