#!/usr/bin/env node
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';

import {
  DEFAULT_DATABASE_NAME,
  DEFAULT_GRPC_PORT,
  DEFAULT_HTTP_PORT,
  allowlistedRuntimeEnvironment,
  assertLinuxHarness,
  canonicalRepoRoot,
  clearState,
  cleanupProcessesAndState,
  databaseUrl,
  harnessProcessEnvironment,
  inspectRecordedProcess,
  newRunId,
  openAppendOnlyLog,
  openReadOnlyRegularLeaf,
  pathsFor,
  prepareRunDirectory,
  readRegularLeaf,
  readState,
  stopRecordedProcess,
  waitForProcessSurvival,
  type HarnessProcess,
  type HarnessSecrets,
  type HarnessState,
  type NamedHarnessProcess,
  writeState,
} from './lab.js';

const COMMANDS = new Set(['up', 'status', 'logs', 'down', 'register']);

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function repoRoot(): Promise<string> {
  return canonicalRepoRoot(process.env['PATCHES_HARNESS_ROOT'] ?? process.cwd());
}

function usage(): string {
  return [
    'Usage: patches-harness <up|status|logs|down|register> [options]',
    '',
    'up       build and start one disposable local server + worker lab',
    'status   print JSON state for the local lab',
    'logs     print server and worker logs (use --follow to tail)',
    'down     stop only processes recorded by this lab',
    'register create a browser-login test account; --handle is optional',
    '',
    'Lifecycle commands currently require Linux because process ownership is proven via /proc.',
  ].join('\n');
}

async function command(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  input?: string,
): Promise<CommandResult> {
  const child = spawn(command, [...args], {
    cwd,
    env: env === undefined ? process.env : env,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const output = child.stdout;
  const errors = child.stderr;
  const inputStream = child.stdin;
  if (output === null || errors === null || (input !== undefined && inputStream === null)) {
    throw new Error(`could not open standard streams for ${command}`);
  }
  output.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  errors.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  if (input !== undefined && inputStream !== null) inputStream.end(input);
  const [code] = (await once(child, 'close')) as [number | null];
  return { code: code ?? 1, stdout, stderr };
}

async function requireCommand(
  commandName: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const result = await command(commandName, args, cwd, env);
  if (result.code !== 0) {
    throw new Error(`${commandName} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
}

function generatedKeys(): HarnessSecrets {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const authCodeKeyId = 'harness-1';
  return {
    JWT_PRIVATE_KEY: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString(
      'base64',
    ),
    JWT_PUBLIC_KEY: Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString(
      'base64',
    ),
    AUTH_CODE_DELIVERY_ACTIVE_KEY_ID: authCodeKeyId,
    AUTH_CODE_DELIVERY_KEYS: JSON.stringify({
      [authCodeKeyId]: randomBytes(32).toString('base64'),
    }),
  };
}

function startProcess(
  script: string,
  root: string,
  environment: NodeJS.ProcessEnv,
  logPath: string,
): ChildProcess {
  const logDescriptor = openAppendOnlyLog(logPath);
  try {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: environment,
      detached: true,
      stdio: ['ignore', logDescriptor, logDescriptor],
    });
    child.unref();
    return child;
  } finally {
    closeSync(logDescriptor);
  }
}

async function waitForReady(origin: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`server exited during startup (${String(server.exitCode)})`);
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.ok) return;
    } catch {
      // The process has not opened the listener yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`timed out waiting for ${origin}/healthz`);
}

function toHarnessProcess(child: ChildProcess): HarnessProcess {
  if (child.pid === undefined) throw new Error('child process did not receive a pid');
  return { pid: child.pid, startedAt: new Date().toISOString() };
}

function processEntries(state: HarnessState): readonly NamedHarnessProcess[] {
  return [
    { name: 'worker', process: state.worker, expectedScript: 'apps/worker/dist/main.js' },
    { name: 'server', process: state.server, expectedScript: 'apps/server/dist/main.js' },
  ];
}

async function up(root: string): Promise<void> {
  const paths = pathsFor(root);
  const previous = await readState(paths);
  if (previous !== undefined) {
    const serverStatus = await inspectRecordedProcess(
      previous.server,
      'apps/server/dist/main.js',
      previous.runId,
    );
    const workerStatus = await inspectRecordedProcess(
      previous.worker,
      'apps/worker/dist/main.js',
      previous.runId,
    );
    if (serverStatus === 'owned-running' || workerStatus === 'owned-running')
      throw new Error('harness lab is already running; run `mise run lab:down` first');
    if (serverStatus === 'unowned' || workerStatus === 'unowned') {
      throw new Error('refusing to clear state whose recorded process ownership cannot be proven');
    }
    await clearState(paths);
  }
  await prepareRunDirectory(paths);
  await chmod(paths.runDirectory, 0o700);
  await requireCommand('pnpm', ['--filter', '@patches/server', 'build'], root);
  await requireCommand('pnpm', ['--filter', '@patches/worker', 'build'], root);
  await requireCommand('pnpm', ['--filter', '@patches/tui', 'build'], root);
  await requireCommand('mise', ['run', 'compose', '--', 'up', '-d', 'postgres'], root);
  const databaseExists = await command(
    'mise',
    [
      'run',
      'compose',
      '--',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'patches',
      '-d',
      'patches',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${DEFAULT_DATABASE_NAME}'`,
    ],
    root,
  );
  if (databaseExists.code !== 0) {
    throw new Error(`could not inspect local harness database:\n${databaseExists.stderr}`);
  }
  if (databaseExists.stdout.trim() !== '1') {
    await requireCommand(
      'mise',
      [
        'run',
        'compose',
        '--',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'patches',
        '-d',
        'patches',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `CREATE DATABASE ${DEFAULT_DATABASE_NAME} OWNER patches`,
      ],
      root,
    );
  }
  const labDatabaseUrl = databaseUrl();
  await requireCommand('pnpm', ['db:migrate'], root, {
    ...allowlistedRuntimeEnvironment(process.env),
    DATABASE_URL: labDatabaseUrl,
    DATABASE_SSL: 'false',
  });
  const base = {
    runId: newRunId(),
    databaseUrl: labDatabaseUrl,
    httpPort: DEFAULT_HTTP_PORT,
    grpcPort: DEFAULT_GRPC_PORT,
  };
  const environment = harnessProcessEnvironment(process.env, base, generatedKeys());
  const server = startProcess(
    'apps/server/dist/main.js',
    root,
    environment,
    `${paths.logDirectory}/server.log`,
  );
  let worker: ChildProcess | undefined;
  try {
    await waitForReady(`http://127.0.0.1:${String(DEFAULT_HTTP_PORT)}`, server);
    worker = startProcess(
      'apps/worker/dist/main.js',
      root,
      environment,
      `${paths.logDirectory}/worker.log`,
    );
    await waitForProcessSurvival(worker);
    await writeState(paths, {
      version: 1,
      databaseName: DEFAULT_DATABASE_NAME,
      ...base,
      server: toHarnessProcess(server),
      worker: toHarnessProcess(worker),
    });
  } catch (error) {
    const rollbackEntries: NamedHarnessProcess[] = [];
    if (worker !== undefined) {
      rollbackEntries.push({
        name: 'worker',
        process: toHarnessProcess(worker),
        expectedScript: 'apps/worker/dist/main.js',
      });
    }
    rollbackEntries.push({
      name: 'server',
      process: toHarnessProcess(server),
      expectedScript: 'apps/server/dist/main.js',
    });
    try {
      await cleanupProcessesAndState(
        rollbackEntries,
        (entry) => stopRecordedProcess(entry.process, entry.expectedScript, base.runId),
        () => clearState(paths),
      );
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'harness startup failed and rollback is incomplete',
        { cause: cleanupError },
      );
    }
    throw error;
  }
  print({
    status: 'ready',
    httpOrigin: `http://127.0.0.1:${String(DEFAULT_HTTP_PORT)}`,
    grpcTarget: `127.0.0.1:${String(DEFAULT_GRPC_PORT)}`,
    database: DEFAULT_DATABASE_NAME,
    runId: base.runId,
    logs: paths.logDirectory,
  });
}

async function status(root: string): Promise<void> {
  const paths = pathsFor(root);
  const state = await readState(paths);
  if (state === undefined) {
    print({ status: 'down' });
    return;
  }
  const serverStatus = await inspectRecordedProcess(
    state.server,
    'apps/server/dist/main.js',
    state.runId,
  );
  const workerStatus = await inspectRecordedProcess(
    state.worker,
    'apps/worker/dist/main.js',
    state.runId,
  );
  print({
    status:
      serverStatus === 'owned-running' && workerStatus === 'owned-running'
        ? 'running'
        : serverStatus === 'unowned' || workerStatus === 'unowned'
          ? 'unowned'
          : 'degraded',
    processes: { server: serverStatus, worker: workerStatus },
    runId: state.runId,
    httpOrigin: `http://127.0.0.1:${String(state.httpPort)}`,
    grpcTarget: `127.0.0.1:${String(state.grpcPort)}`,
    database: state.databaseName,
    serverPid: state.server.pid,
    workerPid: state.worker.pid,
    logs: paths.logDirectory,
  });
}

async function logs(root: string, follow: boolean): Promise<void> {
  const paths = pathsFor(root);
  if (follow) {
    const serverDescriptor = openReadOnlyRegularLeaf(`${paths.logDirectory}/server.log`);
    const workerDescriptor = openReadOnlyRegularLeaf(`${paths.logDirectory}/worker.log`);
    try {
      const tail = spawn('tail', ['-n', '+1', '-f', '/proc/self/fd/3', '/proc/self/fd/4'], {
        stdio: ['inherit', 'inherit', 'inherit', serverDescriptor, workerDescriptor],
      });
      await once(tail, 'close');
    } finally {
      closeSync(serverDescriptor);
      closeSync(workerDescriptor);
    }
    return;
  }
  for (const name of ['server.log', 'worker.log']) {
    try {
      process.stdout.write(
        `==> ${name}\n${await readRegularLeaf(`${paths.logDirectory}/${name}`)}`,
      );
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
}

async function down(root: string): Promise<void> {
  const paths = pathsFor(root);
  const state = await readState(paths);
  if (state === undefined) {
    print({ status: 'down', stopped: [] });
    return;
  }
  const stopped = await cleanupProcessesAndState(
    processEntries(state),
    (entry) => stopRecordedProcess(entry.process, entry.expectedScript, state.runId),
    () => clearState(paths),
  );
  print({ status: 'down', stopped });
}

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

async function register(root: string, args: readonly string[]): Promise<void> {
  const paths = pathsFor(root);
  const state = await readState(paths);
  if (
    state === undefined ||
    (await inspectRecordedProcess(state.server, 'apps/server/dist/main.js', state.runId)) !==
      'owned-running'
  ) {
    throw new Error('harness lab is not running; run `mise run lab` first');
  }
  const handle = flag(args, '--handle') ?? `agent${newRunId().slice(0, 10)}`;
  const password = flag(args, '--password') ?? `Harness-${newRunId()}!`;
  const email = flag(args, '--email') ?? `${handle}@harness.local`;
  const credentialHome = resolve(paths.runDirectory, 'credentials', handle);
  await prepareRunDirectory(paths);
  const result = await command(
    process.execPath,
    [
      'apps/tui/dist/cli.js',
      '--insecure',
      '--server',
      `127.0.0.1:${String(state.grpcPort)}`,
      'register',
      '--handle',
      handle,
      '--display-name',
      handle,
      '--email',
      email,
      '--password-stdin',
    ],
    root,
    {
      ...allowlistedRuntimeEnvironment(process.env),
      PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE: '1',
      XDG_CONFIG_HOME: credentialHome,
    },
    `${password}\n`,
  );
  if (result.code !== 0) throw new Error(`registration failed: ${result.stderr || result.stdout}`);
  print({
    handle,
    email,
    password,
    webUrl: `http://127.0.0.1:${String(state.httpPort)}`,
    note: 'Use these credentials in the local web login form. They are scoped to this disposable harness lab.',
  });
}

async function main(): Promise<void> {
  const [subcommand = 'status', ...args] = process.argv.slice(2);
  if (subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!COMMANDS.has(subcommand)) fail(`${usage()}\n\nUnknown command: ${subcommand}`);
  assertLinuxHarness();
  const root = await repoRoot();
  if (subcommand === 'up') await up(root);
  else if (subcommand === 'status') await status(root);
  else if (subcommand === 'logs') await logs(root, args.includes('--follow'));
  else if (subcommand === 'down') await down(root);
  else await register(root, args);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`patches-harness: ${message}\n`);
  process.exitCode = 1;
});
