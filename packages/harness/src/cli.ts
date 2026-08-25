#!/usr/bin/env node
import { createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { once } from 'node:events';

import {
  assertActionProcessStatuses,
  assertPasswordStdinArgs,
  createHarnessApi,
  createPost,
  deletePost,
  ensureWorld,
  follow,
  login,
  logoutAll,
  notifications,
  readWorld,
  register as registerRpc,
  unknownCommandFailure,
  writeCliError,
  unfollow,
  waitForUnread,
} from './actions.js';
import {
  assertWorldCompatible,
  declaredWorldManifest,
  readWorldManifest,
  readWorldSeed,
  type WorldManifest,
} from './world-state.js';
import { readBoundedLogTail, writeSafeLogOutput, type BoundedLogSource } from './log-redaction.js';

import {
  DEFAULT_DATABASE_NAME,
  DEFAULT_GRPC_PORT,
  DEFAULT_HTTP_PORT,
  allowlistedRuntimeEnvironment,
  atomicPersistLeaf,
  assertLinuxHarness,
  canonicalRepoRoot,
  clearState,
  cleanupProcessesAndState,
  databaseUrl,
  harnessProcessEnvironment,
  inspectRecordedProcess,
  newRunId,
  openAppendOnlyLog,
  pathsFor,
  prepareRunDirectory,
  readState,
  stopRecordedProcess,
  waitForProcessSurvival,
  type HarnessProcess,
  type HarnessSecrets,
  type HarnessState,
  type NamedHarnessProcess,
  writeState,
} from './lab.js';

const COMMANDS = new Set([
  'up',
  'status',
  'logs',
  'down',
  'register',
  'login',
  'logout',
  'post',
  'delete-post',
  'follow',
  'unfollow',
  'notifications',
  'wait-unread',
  'world-ensure',
]);

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
    'Usage: patches-harness <up|status|logs|down|register|login|logout|post|delete-post|follow|unfollow|notifications|wait-unread|world-ensure> [options]',
    '',
    'up       build and start one disposable local server + worker lab',
    'status   print JSON state for the local lab',
    'logs     print a bounded, redacted JSON snapshot; --request-id and --limit are optional',
    'down     stop only processes recorded by this lab',
    'register/login/logout/post/delete-post/follow/unfollow use direct local gRPC actions',
    'auth actions require --password-stdin; notifications/wait-unread observe non-DM notifications',
    'world-ensure reapplies an unchanged stable-key world and refuses declarative drift',
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

async function logs(root: string, args: readonly string[]): Promise<void> {
  const paths = pathsFor(root);
  if (args.includes('--follow'))
    throw new Error('safe follow mode is not implemented; use bounded log snapshots');
  const sources: BoundedLogSource[] = [];
  for (const service of ['server', 'worker']) {
    try {
      const source = await readBoundedLogTail(`${paths.logDirectory}/${service}.log`);
      sources.push({ ...source, service });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
  const requestId = flag(args, '--request-id');
  writeSafeLogOutput(sources, {
    ...(requestId === undefined ? {} : { requestId }),
    limit: Number(flag(args, '--limit') ?? '200'),
  });
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
  const state = await runningState(root);
  const handle = flag(args, '--handle') ?? `agent${newRunId().slice(0, 10)}`;
  const password = await passwordFromStdin(args);
  const email = flag(args, '--email') ?? `${handle}@harness.local`;
  const api = createHarnessApi(`127.0.0.1:${String(state.grpcPort)}`).api;
  const result = await registerRpc(api, { handle, email, password, clientRequestId: randomUUID() });
  const cleanup = await logoutAll(api, result.session);
  print({
    ...result.result,
    email,
    webUrl: `http://127.0.0.1:${String(state.httpPort)}`,
    cleanupRequestId: cleanup.requestId,
  });
}

async function runningState(root: string): Promise<HarnessState> {
  const state = await readState(pathsFor(root));
  if (state === undefined) throw new Error('harness lab is not running; run `mise run lab` first');
  const [server, worker] = await Promise.all([
    inspectRecordedProcess(state.server, 'apps/server/dist/main.js', state.runId),
    inspectRecordedProcess(state.worker, 'apps/worker/dist/main.js', state.runId),
  ]);
  assertActionProcessStatuses(server, worker);
  return state;
}

function required(args: readonly string[], name: string): string {
  return flag(args, name) ?? fail(`${name} is required`);
}

async function passwordFromStdin(args: readonly string[]): Promise<string> {
  assertPasswordStdinArgs(args);
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const password = input.replace(/\r?\n$/, '');
  if (password.length === 0 || password.includes('\n') || password.includes('\r'))
    throw new Error('password stdin must contain exactly one non-empty line');
  return password;
}

async function authenticatedAction(
  root: string,
  args: readonly string[],
  action: (
    api: ReturnType<typeof createHarnessApi>['api'],
    session: Awaited<ReturnType<typeof login>>['session'],
  ) => Promise<unknown>,
): Promise<void> {
  const state = await runningState(root);
  const api = createHarnessApi(`127.0.0.1:${String(state.grpcPort)}`).api;
  const signedIn = await login(api, {
    emailOrHandle: required(args, '--handle'),
    password: await passwordFromStdin(args),
  });
  let result: unknown;
  try {
    result = await action(api, signedIn.session);
  } finally {
    const cleanup = await logoutAll(api, signedIn.session);
    if (result !== undefined && typeof result === 'object' && result !== null)
      result = {
        ...result,
        authRequestId: signedIn.result.requestId,
        cleanupRequestId: cleanup.requestId,
      };
  }
  print(result);
}

async function worldSeed(root: string): Promise<Buffer> {
  const paths = pathsFor(root);
  const seedPath = `${paths.runDirectory}/world-seed`;
  try {
    return await readWorldSeed(seedPath);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const seed = randomBytes(32);
  await atomicPersistLeaf(seedPath, seed.toString('base64url'), newRunId());
  return readWorldSeed(seedPath);
}

async function ensureDeclaredWorld(
  root: string,
  state: HarnessState,
  args: readonly string[],
): Promise<void> {
  const world = await readWorld(required(args, '--file'));
  const declared = declaredWorldManifest(world);
  const manifestPath = `${pathsFor(root).runDirectory}/world-manifest.json`;
  let existing: WorldManifest | undefined;
  try {
    existing = await readWorldManifest(manifestPath);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  assertWorldCompatible(declared, existing);
  let journal = existing ?? declared;
  const failAfter = flag(args, '--fail-after');
  const failAfterCount = failAfter === undefined ? undefined : Number(failAfter);
  if (failAfterCount !== undefined && (!Number.isInteger(failAfterCount) || failAfterCount < 1))
    throw new Error('--fail-after must be a positive integer');
  let mutationCount = 0;
  if (existing === undefined)
    await atomicPersistLeaf(manifestPath, `${JSON.stringify(journal)}\n`, newRunId());
  const seed = await worldSeed(root);
  const result = await ensureWorld(
    createHarnessApi(`127.0.0.1:${String(state.grpcPort)}`).api,
    world,
    (key) => `${createHmac('sha256', seed).update(key).digest('base64url')}!aA9`,
    async (key) => {
      if (journal.completedKeys.includes(key)) return;
      journal = { ...journal, completedKeys: [...journal.completedKeys, key].sort() };
      await atomicPersistLeaf(manifestPath, `${JSON.stringify(journal)}\n`, newRunId());
      mutationCount += 1;
      if (mutationCount === failAfterCount)
        throw new Error(
          `injected world failure after journaling ${String(mutationCount)} mutation`,
        );
    },
  );
  print(result);
}

async function action(root: string, subcommand: string, args: readonly string[]): Promise<void> {
  if (subcommand === 'login') {
    const state = await runningState(root);
    const api = createHarnessApi(`127.0.0.1:${String(state.grpcPort)}`).api;
    const signedIn = await login(api, {
      emailOrHandle: required(args, '--handle'),
      password: await passwordFromStdin(args),
    });
    const cleanup = await logoutAll(api, signedIn.session);
    print({ ...signedIn.result, cleanupRequestId: cleanup.requestId });
  } else if (subcommand === 'logout')
    await authenticatedAction(root, args, () =>
      Promise.resolve({ status: 'all-sessions-revoked' }),
    );
  else if (subcommand === 'post')
    await authenticatedAction(root, args, (api, session) =>
      createPost(api, session, {
        body: required(args, '--body'),
        clientRequestId: flag(args, '--client-request-id') ?? randomUUID(),
      }),
    );
  else if (subcommand === 'delete-post')
    await authenticatedAction(root, args, (api, session) =>
      deletePost(api, session, required(args, '--id')),
    );
  else if (subcommand === 'follow')
    await authenticatedAction(root, args, (api, session) =>
      follow(api, session, required(args, '--actor-id')),
    );
  else if (subcommand === 'unfollow')
    await authenticatedAction(root, args, (api, session) =>
      unfollow(api, session, required(args, '--actor-id')),
    );
  else if (subcommand === 'notifications')
    await authenticatedAction(root, args, (api, session) =>
      notifications(api, session, Number(flag(args, '--limit') ?? '30')),
    );
  else if (subcommand === 'wait-unread')
    await authenticatedAction(root, args, (api, session) =>
      waitForUnread(
        api,
        session,
        Number(required(args, '--at-least')),
        Number(flag(args, '--timeout-ms') ?? '3000'),
      ),
    );
  else if (subcommand === 'world-ensure') {
    const state = await runningState(root);
    await ensureDeclaredWorld(root, state, args);
  }
}

async function main(): Promise<void> {
  const [subcommand = 'status', ...args] = process.argv.slice(2);
  if (subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!COMMANDS.has(subcommand)) fail(`${usage()}\n\n${unknownCommandFailure()}`);
  assertLinuxHarness();
  const root = await repoRoot();
  if (subcommand === 'up') await up(root);
  else if (subcommand === 'status') await status(root);
  else if (subcommand === 'logs') await logs(root, args);
  else if (subcommand === 'down') await down(root);
  else if (subcommand === 'register') await register(root, args);
  else await action(root, subcommand, args);
}

void main().catch((error: unknown) => {
  writeCliError(error);
  process.exitCode = 1;
});
