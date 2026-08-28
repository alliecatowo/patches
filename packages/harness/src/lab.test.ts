import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DATABASE_NAME,
  allowlistedRuntimeEnvironment,
  assertLinuxHarness,
  atomicPersistLeaf,
  canonicalRepoRoot,
  cleanupProcessesAndState,
  databaseUrl,
  findForeignHarnessOwner,
  findPortOwnerPid,
  harnessProcessEnvironment,
  inspectForeignProcess,
  inspectRecordedProcess,
  isHarnessDatabaseName,
  isSafeHarnessRunDirectory,
  openAppendOnlyLog,
  parsePortOwnerPid,
  pathsFor,
  prepareRunDirectory,
  readState,
  stopForeignProcess,
  stopRecordedProcess,
  stopAllRecordedProcesses,
  waitForProcessSurvival,
  writeState,
  type HarnessState,
  type NamedHarnessProcess,
} from './lab.js';

const temporaryRoots: string[] = [];

const sampleProcesses: readonly NamedHarnessProcess[] = [
  {
    name: 'worker',
    process: { pid: 100, startedAt: 'now' },
    expectedScript: 'worker.js',
  },
  {
    name: 'server',
    process: { pid: 101, startedAt: 'now' },
    expectedScript: 'server.js',
  },
];

function sampleState(): HarnessState {
  return {
    version: 1,
    runId: '0123456789abcdef',
    databaseName: DEFAULT_DATABASE_NAME,
    databaseUrl: databaseUrl(),
    httpPort: 8088,
    grpcPort: 50058,
    server: { pid: 101, startedAt: 'now' },
    worker: { pid: 100, startedAt: 'now' },
  };
}

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'patches-harness-test-'));
  temporaryRoots.push(root);
  await writeFile(join(root, 'package.json'), '{"name":"patches"}\n');
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  await mkdir(join(root, '.git'));
  await mkdir(join(root, 'infra/lab'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('harness lab safety boundaries', () => {
  const root = '/work/patches';

  it('accepts exactly the dedicated local database name', () => {
    expect(isHarnessDatabaseName(DEFAULT_DATABASE_NAME)).toBe(true);
    expect(isHarnessDatabaseName('patches')).toBe(false);
    expect(isHarnessDatabaseName('patches_harness_lab_copy')).toBe(false);
    expect(databaseUrl()).toContain(`/${DEFAULT_DATABASE_NAME}`);
    expect(() => databaseUrl('patches')).toThrow('refusing non-harness database name');
  });

  it('pins runtime state to the repo-local harness directory', () => {
    const paths = pathsFor(root);
    expect(paths.runDirectory).toBe('/work/patches/infra/lab/.run/harness');
    expect(isSafeHarnessRunDirectory(root, paths.runDirectory)).toBe(true);
    expect(isSafeHarnessRunDirectory(root, '/work/patches/infra/lab/.run')).toBe(false);
    expect(isSafeHarnessRunDirectory(root, '/tmp/harness')).toBe(false);
  });

  it('copies only non-secret runtime variables into child environments', () => {
    const source = {
      PATH: '/usr/bin',
      HOME: '/home/agent',
      NODE_OPTIONS: '--require=/tmp/inject.js',
      FLY_API_TOKEN: 'production-token',
      R2_SECRET_ACCESS_KEY: 'production-r2-key',
      FEDERATION_ENABLED: 'true',
    };
    expect(allowlistedRuntimeEnvironment(source)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/agent',
    });

    const environment = harnessProcessEnvironment(
      source,
      {
        runId: 'nonce',
        databaseUrl: databaseUrl(),
        httpPort: 8088,
        grpcPort: 50058,
      },
      {
        JWT_PRIVATE_KEY: 'harness-private',
        JWT_PUBLIC_KEY: 'harness-public',
        AUTH_CODE_DELIVERY_ACTIVE_KEY_ID: 'harness-1',
        AUTH_CODE_DELIVERY_KEYS: '{"harness-1":"key"}',
      },
    );
    expect(environment['NODE_ENV']).toBe('production');
    expect(environment['DATABASE_SSL']).toBe('false');
    expect(environment['FEDERATION_ENABLED']).toBe('false');
    expect(environment['R2_SECRET_ACCESS_KEY']).toBe('');
    expect(environment['FLY_API_TOKEN']).toBeUndefined();
    expect(environment['NODE_OPTIONS']).toBeUndefined();
  });

  it('validates repository markers and rejects symlinked runtime paths', async () => {
    const root = await makeWorkspace();
    expect(await canonicalRepoRoot(root)).toBe(root);

    const outside = await mkdtemp(join(tmpdir(), 'patches-harness-outside-'));
    temporaryRoots.push(outside);
    await symlink(outside, join(root, 'infra/lab/.run'));
    await expect(prepareRunDirectory(pathsFor(root))).rejects.toThrow(
      'refusing symlinked harness runtime path',
    );
  });

  it('explicitly refuses non-Linux lifecycle execution', () => {
    expect(() => assertLinuxHarness('darwin')).toThrow('Linux-only');
    expect(() => assertLinuxHarness('linux')).not.toThrow();
  });

  it('attempts every process cleanup and rejects before state can be cleared', async () => {
    const attempted: string[] = [];
    const stop = vi.fn((entry: { name: 'server' | 'worker' }) => {
      attempted.push(entry.name);
      return Promise.resolve(entry.name === 'worker');
    });
    await expect(stopAllRecordedProcesses(sampleProcesses, stop)).rejects.toThrow(
      'server: ownership or shutdown could not be proven',
    );
    expect(attempted).toEqual(['worker', 'server']);
  });

  it('attests ownership with both the command line and run nonce', async () => {
    const processInfo = { pid: 42, startedAt: 'now' };
    const owned = await inspectRecordedProcess(processInfo, 'apps/server/dist/main.js', 'nonce', {
      probe: vi.fn(),
      readProcFile: (path) =>
        Promise.resolve(
          path.endsWith('/cmdline')
            ? 'node\0apps/server/dist/main.js\0'
            : 'PATH=/usr/bin\0PATCHES_HARNESS_RUN_ID=nonce\0',
        ),
    });
    expect(owned).toBe('owned-running');

    const wrongNonce = await inspectRecordedProcess(
      processInfo,
      'apps/server/dist/main.js',
      'different',
      {
        probe: vi.fn(),
        readProcFile: (path) =>
          Promise.resolve(
            path.endsWith('/cmdline')
              ? 'node\0apps/server/dist/main.js\0'
              : 'PATCHES_HARNESS_RUN_ID=nonce\0',
          ),
      },
    );
    expect(wrongNonce).toBe('unowned');
  });

  it('escalates TERM to KILL and requires proof of exit', async () => {
    const ownership = ['owned-running', 'owned-running', 'stopped'] as const;
    let inspection = 0;
    const signals: NodeJS.Signals[] = [];
    const stopped = await stopRecordedProcess({ pid: 42, startedAt: 'now' }, 'server.js', 'nonce', {
      inspect: () => Promise.resolve(ownership[inspection++] ?? 'stopped'),
      signalGroup: (_pid, signal) => signals.push(signal),
      delay: () => Promise.resolve(),
      termPolls: 1,
      killPolls: 1,
    });
    expect(stopped).toBe(true);
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('rejects a worker that exits during the bounded survival interval', async () => {
    const worker = { exitCode: null as number | null, signalCode: null as NodeJS.Signals | null };
    await expect(
      waitForProcessSurvival(worker, 10, () => {
        worker.exitCode = 1;
        return Promise.resolve();
      }),
    ).rejects.toThrow('worker exited during');
  });

  it('rolls back every startup process and retains state on uncertain cleanup', async () => {
    const cleared = vi.fn(() => Promise.resolve());
    const stopped = await cleanupProcessesAndState(
      sampleProcesses,
      () => Promise.resolve(true),
      cleared,
    );
    expect(stopped).toEqual(['worker', 'server']);
    expect(cleared).toHaveBeenCalledOnce();

    cleared.mockClear();
    await expect(
      cleanupProcessesAndState(sampleProcesses, () => Promise.resolve(false), cleared),
    ).rejects.toThrow('remain unresolved');
    expect(cleared).not.toHaveBeenCalled();
  });

  it('persists state atomically as mode 0600 and refuses symlinked leaves', async () => {
    const root = await makeWorkspace();
    const paths = pathsFor(root);
    await prepareRunDirectory(paths);
    await writeState(paths, sampleState());
    expect(await readState(paths)).toEqual(sampleState());
    expect((await stat(paths.stateFile)).mode & 0o777).toBe(0o600);

    await rm(paths.stateFile);
    const outside = join(root, 'outside-state');
    await writeFile(outside, 'do not replace');
    await symlink(outside, paths.stateFile);
    await expect(readState(paths)).rejects.toThrow('unsafe pre-existing file leaf');
    await expect(writeState(paths, sampleState())).rejects.toThrow(
      'unsafe pre-existing state leaf',
    );

    const logLink = join(paths.logDirectory, 'server.log');
    await symlink(outside, logLink);
    expect(() => openAppendOnlyLog(logLink)).toThrow('unsafe pre-existing log leaf');
  });

  it('cleans an exclusive temporary leaf after an atomic replace failure', async () => {
    let temporaryPath = '';
    const removed: string[] = [];
    await expect(
      atomicPersistLeaf('/safe/state.json', 'next', 'run', {
        assertTarget: () => Promise.resolve(),
        writeTemporary: (path) => {
          temporaryPath = path;
          return Promise.resolve();
        },
        replace: () => Promise.reject(new Error('injected rename failure')),
        remove: (path) => {
          removed.push(path);
          return Promise.resolve();
        },
        nonce: () => 'unique',
      }),
    ).rejects.toThrow('injected rename failure');
    expect(temporaryPath).toBe('/safe/.state.json-run-unique.tmp');
    expect(removed).toEqual([temporaryPath]);
  });

  it('preserves a pre-existing temporary leaf on an exclusive-create collision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'patches-harness-collision-'));
    temporaryRoots.push(root);
    const target = join(root, 'state.json');
    const collision = join(root, '.state.json-run-collision.tmp');
    await writeFile(collision, 'belongs to another writer');

    await expect(
      atomicPersistLeaf(target, 'new state', 'run', {
        assertTarget: () => Promise.resolve(),
        writeTemporary: (path) => {
          expect(path).toBe(collision);
          return Promise.reject(Object.assign(new Error('collision'), { code: 'EEXIST' }));
        },
        replace: () => Promise.resolve(),
        remove: (path) => rm(path),
        nonce: () => 'collision',
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(collision, 'utf8')).toBe('belongs to another writer');
  });
});

describe('cross-worktree port ownership', () => {
  it('parses a pid out of `ss -H -tlnp` output and rejects an empty/unmatched one', () => {
    expect(
      parsePortOwnerPid(
        'LISTEN 0 4096 127.0.0.1:50058 0.0.0.0:* users:(("node",pid=12345,fd=23))\n',
      ),
    ).toBe(12345);
    expect(parsePortOwnerPid('')).toBeUndefined();
  });

  it('findPortOwnerPid delegates to the injected ss runner', async () => {
    const run = vi.fn().mockResolvedValue('users:(("node",pid=999,fd=1))');
    await expect(
      findPortOwnerPid(50058, { run, readCwd: () => Promise.resolve(undefined) }),
    ).resolves.toBe(999);
    expect(run).toHaveBeenCalledWith(50058);
  });

  it('findForeignHarnessOwner resolves pid and root together, and undefined root when cwd is unreadable', async () => {
    await expect(
      findForeignHarnessOwner({
        run: () => Promise.resolve('pid=555'),
        readCwd: () => Promise.resolve('/home/other/patches-wt-2'),
      }),
    ).resolves.toEqual({ pid: 555, root: '/home/other/patches-wt-2' });
    await expect(
      findForeignHarnessOwner({
        run: () => Promise.resolve('pid=555'),
        readCwd: () => Promise.resolve(undefined),
      }),
    ).resolves.toEqual({ pid: 555, root: undefined });
    await expect(
      findForeignHarnessOwner({
        run: () => Promise.resolve(''),
        readCwd: () => Promise.resolve(undefined),
      }),
    ).resolves.toBeUndefined();
  });

  it('inspectForeignProcess proves ownership by command line alone (no run-id nonce available)', async () => {
    await expect(
      inspectForeignProcess(101, 'apps/server/dist/main.js', {
        probe: () => undefined,
        readProcFile: () => Promise.resolve('node\0apps/server/dist/main.js\0'),
      }),
    ).resolves.toBe('owned-running');
    await expect(
      inspectForeignProcess(101, 'apps/server/dist/main.js', {
        probe: () => undefined,
        readProcFile: () => Promise.resolve('node\0some-other-script.js\0'),
      }),
    ).resolves.toBe('unowned');
    await expect(
      inspectForeignProcess(101, 'apps/server/dist/main.js', {
        probe: () => {
          throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        },
        readProcFile: () => Promise.resolve(''),
      }),
    ).resolves.toBe('stopped');
  });

  it('stopForeignProcess only signals a pid whose command line matches, and reports failure otherwise', async () => {
    const signalGroup = vi.fn();
    const stopped = await stopForeignProcess(101, 'apps/server/dist/main.js', {
      inspect: () => Promise.resolve('owned-running'),
      signalGroup,
      delay: () => Promise.resolve(),
      termPolls: 1,
      killPolls: 1,
    });
    // The stub inspect always reports owned-running, so this call never observes "stopped"
    // and exhausts its poll budget — proving the signal was actually sent without needing a
    // real process to kill.
    expect(signalGroup).toHaveBeenNthCalledWith(1, 101, 'SIGTERM');
    expect(signalGroup).toHaveBeenNthCalledWith(2, 101, 'SIGKILL');
    expect(stopped).toBe(false);

    const refused = await stopForeignProcess(101, 'apps/server/dist/main.js', {
      inspect: () => Promise.resolve('unowned'),
      signalGroup,
      delay: () => Promise.resolve(),
    });
    expect(refused).toBe(false);
  });
});
