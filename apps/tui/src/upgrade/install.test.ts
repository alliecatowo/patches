import { EventEmitter } from 'node:events';
import type { ChildProcess, spawn } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import { detectInstallMethod, installUpgrade } from './install.js';

describe('detectInstallMethod', () => {
  const noWorkspaceFile = (): boolean => false;

  it('recognizes a global npm install layout', () => {
    expect(
      detectInstallMethod('/usr/lib/node_modules/patches-social/dist/cli.js', {}, noWorkspaceFile),
    ).toBe('npm-global');
  });

  it('recognizes npm via npm_config_user_agent even under an unusual path', () => {
    expect(
      detectInstallMethod(
        '/opt/weird/cli.js',
        { npm_config_user_agent: 'npm/10.8.2 node/v24 linux x64' },
        noWorkspaceFile,
      ),
    ).toBe('npm-global');
  });

  it('recognizes a pnpm global install layout', () => {
    expect(
      detectInstallMethod(
        '/home/allie/.local/share/pnpm/global/5/node_modules/patches-social/dist/cli.js',
        {},
        noWorkspaceFile,
      ),
    ).toBe('pnpm-global');
  });

  it('recognizes a repo checkout by walking up to pnpm-workspace.yaml', () => {
    const exists = (path: string): boolean =>
      path === '/home/allie/develop/patches/pnpm-workspace.yaml';
    expect(
      detectInstallMethod('/home/allie/develop/patches/apps/tui/dist/cli.js', {}, exists),
    ).toBe('source-checkout');
  });

  it('falls back to unknown when nothing matches', () => {
    expect(detectInstallMethod('/tmp/scratch/cli.js', {}, noWorkspaceFile)).toBe('unknown');
  });
});

function fakeSpawn(behavior: {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  emitError?: Error;
}): () => ChildProcess {
  return () => {
    const child = new EventEmitter() as unknown as ChildProcess & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter() as unknown as ChildProcess['stdout'] & EventEmitter;
    child.stderr = new EventEmitter() as unknown as ChildProcess['stderr'] & EventEmitter;
    queueMicrotask(() => {
      if (behavior.emitError !== undefined) {
        child.emit('error', behavior.emitError);
        return;
      }
      if (behavior.stdout !== undefined) child.stdout.emit('data', behavior.stdout);
      if (behavior.stderr !== undefined) child.stderr.emit('data', behavior.stderr);
      child.emit('close', behavior.exitCode ?? 0);
    });
    return child;
  };
}

const upgrade = { assetUrl: 'https://example.test/releases/patches-social-0.1.0-alpha.3.tgz' };

describe('installUpgrade', () => {
  it('refuses to attempt an upgrade from a repo checkout', async () => {
    const spawnFn = vi.fn(fakeSpawn({ exitCode: 0 }));
    const exists = (path: string): boolean =>
      path === '/home/allie/develop/patches/pnpm-workspace.yaml';
    const result = await installUpgrade(upgrade, {
      argv1: '/home/allie/develop/patches/apps/tui/dist/cli.js',
      env: {},
      exists,
      spawnFn: spawnFn as unknown as typeof spawn,
    });
    expect(result.ok).toBe(false);
    expect(result.manualCommand).toBe('git pull && pnpm build');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('runs npm install --global --allow-remote=all for a detected npm-global install', async () => {
    const spawnFn = vi.fn(fakeSpawn({ exitCode: 0, stdout: 'added 1 package\n' }));
    const onOutput = vi.fn();
    const result = await installUpgrade(upgrade, {
      argv1: '/usr/lib/node_modules/patches-social/dist/cli.js',
      env: {},
      spawnFn: spawnFn as unknown as typeof spawn,
      onOutput,
    });
    expect(result.ok).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith(
      'npm',
      ['install', '--global', '--allow-remote=all', upgrade.assetUrl],
      expect.anything(),
    );
    expect(onOutput).toHaveBeenCalledWith('added 1 package');
  });

  it('runs pnpm add -g for a detected pnpm-global install', async () => {
    const spawnFn = vi.fn(fakeSpawn({ exitCode: 0 }));
    const result = await installUpgrade(upgrade, {
      argv1: '/home/allie/.local/share/pnpm/global/5/node_modules/patches-social/dist/cli.js',
      env: {},
      spawnFn: spawnFn as unknown as typeof spawn,
    });
    expect(result.ok).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith(
      'pnpm',
      ['add', '-g', upgrade.assetUrl],
      expect.anything(),
    );
  });

  it('retries without --allow-remote=all when an older npm rejects the flag', async () => {
    let call = 0;
    const spawnFn = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return fakeSpawn({ exitCode: 1, stderr: "npm error Unknown flag 'allow-remote'\n" })();
      }
      return fakeSpawn({ exitCode: 0 })();
    });
    const result = await installUpgrade(upgrade, {
      argv1: '/usr/lib/node_modules/patches-social/dist/cli.js',
      env: {},
      spawnFn: spawnFn as unknown as typeof spawn,
    });
    expect(result.ok).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(spawnFn).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['install', '--global', upgrade.assetUrl],
      expect.anything(),
    );
  });

  it('reports failure with a manual command when npm exits nonzero for an unrelated reason', async () => {
    const spawnFn = vi.fn(fakeSpawn({ exitCode: 1, stderr: 'npm error 404 Not Found\n' }));
    const result = await installUpgrade(upgrade, {
      argv1: '/usr/lib/node_modules/patches-social/dist/cli.js',
      env: {},
      spawnFn: spawnFn as unknown as typeof spawn,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('404 Not Found');
    expect(result.manualCommand).toContain('npm install --global --allow-remote=all');
  });

  it('reports failure when the child process itself fails to spawn', async () => {
    const spawnFn = vi.fn(fakeSpawn({ emitError: new Error('spawn npm ENOENT') }));
    const result = await installUpgrade(upgrade, {
      argv1: '/usr/lib/node_modules/patches-social/dist/cli.js',
      env: {},
      spawnFn: spawnFn as unknown as typeof spawn,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ENOENT');
  });
});
