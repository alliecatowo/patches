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
import { getMailpitMessage, latestMailpitMessage, listMailpitMessages } from './mailpit.js';

import {
  DEFAULT_DATABASE_NAME,
  DEFAULT_GRPC_PORT,
  DEFAULT_HTTP_PORT,
  MAILPIT_HTTP_ORIGIN,
  allowlistedRuntimeEnvironment,
  allocateNodePorts,
  atomicPersistLeaf,
  assertLinuxHarness,
  canonicalRepoRoot,
  clearState,
  cleanupProcessesAndState,
  databaseUrl,
  findForeignHarnessOwner,
  generateFederationKeyEncryptionKey,
  harnessProcessEnvironment,
  inspectRecordedProcess,
  isHarnessDatabaseName,
  newRunId,
  nodeDatabaseName,
  nodeDatabaseUrl,
  nodeDomain,
  nodeId,
  openAppendOnlyLog,
  pathsFor,
  prepareRunDirectory,
  readState,
  stateDatabaseNames,
  stateProcessEntries,
  stopForeignProcess,
  stopRecordedProcess,
  waitForProcessSurvival,
  writeState,
  type HarnessMultiState,
  type HarnessNodeState,
  type HarnessProcess,
  type HarnessSecrets,
  type HarnessState,
  type NamedHarnessProcess,
} from './lab.js';

const COMMANDS = new Set([
  'up',
  'status',
  'logs',
  'down',
  'reset',
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
  'mailpit-list',
  'mailpit-latest',
  'mailpit-get',
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
    'Usage: patches-harness <up|status|logs|down|reset|register|login|logout|post|delete-post|follow|unfollow|notifications|wait-unread|world-ensure|mailpit-list|mailpit-latest|mailpit-get> [options]',
    '',
    'up       build and start one disposable local server + worker lab; --nodes N provisions',
    '         N isolated nodes (each own DB/ports/ephemeral keys); --federation provisions two',
    '         federating nodes with FEDERATION_ENABLED=true and a shared federation key',
    "status   print JSON state for the local lab; reports another worktree's lab if this",
    '         one is idle but the port is held',
    'logs     print a bounded, redacted JSON snapshot; --request-id and --limit are optional',
    'down     stop only processes recorded by this lab; --any finds and stops whichever',
    '         worktree currently holds the harness ports instead',
    'reset    idempotent, lab-only: stop this lab, clear its state, and drop every harness',
    '         database it created (refuses any non-harness database name)',
    'register/login/logout/post/delete-post/follow/unfollow use direct local gRPC actions',
    '  against node selected by --node <index> (default: the single-node lab)',
    'auth actions require --password-stdin; notifications/wait-unread observe non-DM notifications',
    'world-ensure reapplies an unchanged stable-key world and refuses declarative drift',
    'mailpit-list/mailpit-latest/mailpit-get read verification-code email from the shared',
    '  Mailpit instance (`mise run compose`); --address filters, --id selects one message',
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
  return stateProcessEntries(state);
}

async function up(root: string, args: readonly string[]): Promise<void> {
  const nodesFlag = flag(args, 'nodes');
  const federation = hasFlag(args, 'federation');
  if (federation) {
    if (nodesFlag !== undefined)
      throw new Error('--federation provisions exactly two nodes; drop --nodes');
    await upMultiNode(root, 2, 'federation');
    return;
  }
  if (nodesFlag === undefined) {
    await upSingleNode(root);
    return;
  }
  const count = Number(nodesFlag);
  if (!Number.isSafeInteger(count) || count < 2)
    throw new Error('--nodes requires an integer >= 2');
  await upMultiNode(root, count, 'multi');
}

async function upSingleNode(root: string): Promise<void> {
  const paths = pathsFor(root);
  const previous = await readState(paths);
  if (previous !== undefined) {
    if (previous.version === 2)
      throw new Error('a multi-node lab is running; run `mise run lab:down` first');
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
  await requireCommand('mise', ['run', 'compose', '--', 'up', '-d', 'postgres', 'mailpit'], root);
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

interface UpMultiDeps {
  readonly build: (root: string) => Promise<void>;
  readonly ensurePostgres: (root: string) => Promise<void>;
  readonly migrateDatabase: (root: string, name: string) => Promise<void>;
}

const upMultiDeps: UpMultiDeps = {
  async build(root) {
    await requireCommand('pnpm', ['--filter', '@patches/server', 'build'], root);
    await requireCommand('pnpm', ['--filter', '@patches/worker', 'build'], root);
    await requireCommand('pnpm', ['--filter', '@patches/tui', 'build'], root);
  },
  async ensurePostgres(root) {
    await requireCommand('mise', ['run', 'compose', '--', 'up', '-d', 'postgres'], root);
  },
  async migrateDatabase(root, name) {
    await requireCommand('pnpm', ['db:migrate'], root, {
      ...allowlistedRuntimeEnvironment(process.env),
      DATABASE_URL: databaseUrl(name),
      DATABASE_SSL: 'false',
    });
  },
};

async function createDatabaseIfMissing(root: string, name: string): Promise<void> {
  const checked = await command(
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
      `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
    ],
    root,
  );
  if (checked.code !== 0) throw new Error(`could not inspect harness database:\n${checked.stderr}`);
  if (checked.stdout.trim() !== '1') {
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
        `CREATE DATABASE ${name} OWNER patches`,
      ],
      root,
    );
  }
}

async function startNodeProcesses(
  root: string,
  paths: ReturnType<typeof pathsFor>,
  environment: NodeJS.ProcessEnv,
  node: Pick<HarnessNodeState, 'id' | 'grpcPort' | 'httpPort'>,
  runId: string,
): Promise<HarnessNodeState> {
  const server = startProcess(
    'apps/server/dist/main.js',
    root,
    environment,
    `${paths.logDirectory}/${node.id}.server.log`,
  );
  let worker: ChildProcess | undefined;
  try {
    await waitForReady(`http://127.0.0.1:${String(node.httpPort)}`, server);
    worker = startProcess(
      'apps/worker/dist/main.js',
      root,
      environment,
      `${paths.logDirectory}/${node.id}.worker.log`,
    );
    await waitForProcessSurvival(worker);
    return {
      id: node.id,
      nodeDomain: String(environment.NODE_DOMAIN),
      databaseName: nodeDatabaseName(Number(node.id.replace('node-', ''))),
      databaseUrl: nodeDatabaseUrl(Number(node.id.replace('node-', ''))),
      httpPort: node.httpPort,
      grpcPort: node.grpcPort,
      server: toHarnessProcess(server),
      worker: toHarnessProcess(worker),
    };
  } catch (error) {
    const rollbackEntries: NamedHarnessProcess[] = [
      {
        name: `${node.id}:server`,
        process: toHarnessProcess(server),
        expectedScript: 'apps/server/dist/main.js',
      },
    ];
    if (worker !== undefined) {
      rollbackEntries.unshift({
        name: `${node.id}:worker`,
        process: toHarnessProcess(worker),
        expectedScript: 'apps/worker/dist/main.js',
      });
    }
    try {
      await cleanupProcessesAndState(
        rollbackEntries,
        (entry) => stopRecordedProcess(entry.process, entry.expectedScript, runId),
        () => Promise.resolve(),
      );
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${node.id} startup failed and rollback is incomplete`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

async function upMultiNode(
  root: string,
  nodeCount: number,
  mode: HarnessMultiState['mode'],
): Promise<void> {
  const paths = pathsFor(root);
  const previous = await readState(paths);
  if (previous !== undefined) {
    for (const entry of processEntries(previous)) {
      if (
        (await inspectRecordedProcess(entry.process, entry.expectedScript, previous.runId)) ===
        'owned-running'
      )
        throw new Error('harness lab is already running; run `mise run lab:down` first');
    }
    await clearState(paths);
  }
  await prepareRunDirectory(paths);
  await chmod(paths.runDirectory, 0o700);
  await upMultiDeps.build(root);
  await upMultiDeps.ensurePostgres(root);

  const runId = newRunId();
  const federationKey = mode === 'federation' ? generateFederationKeyEncryptionKey() : undefined;
  const started: HarnessNodeState[] = [];
  try {
    for (let index = 0; index < nodeCount; index += 1) {
      const dbName = nodeDatabaseName(index);
      await createDatabaseIfMissing(root, dbName);
      await upMultiDeps.migrateDatabase(root, dbName);
    }
    for (let index = 0; index < nodeCount; index += 1) {
      const { grpcPort, httpPort } = allocateNodePorts(index);
      const domain = nodeDomain(index, mode);
      const nodeIdLabel = nodeId(index);
      const base = { runId, databaseUrl: nodeDatabaseUrl(index), httpPort, grpcPort };
      const environment: NodeJS.ProcessEnv = {
        ...harnessProcessEnvironment(process.env, base, generatedKeys()),
        NODE_DOMAIN: domain,
        FEDERATION_ENABLED: mode === 'federation' ? 'true' : 'false',
        FEDERATION_STANCE: mode === 'federation' ? 'allowlist' : 'disabled',
      };
      if (federationKey !== undefined) environment.FEDERATION_KEY_ENCRYPTION_KEY = federationKey;
      started.push(
        await startNodeProcesses(
          root,
          paths,
          environment,
          {
            id: nodeIdLabel,
            grpcPort,
            httpPort,
          },
          runId,
        ),
      );
    }
    const multiState: HarnessMultiState = {
      version: 2,
      runId,
      mode,
      nodeCount,
      ...(federationKey !== undefined ? { federationKey } : {}),
      nodes: started,
    };
    await writeState(paths, multiState);
  } catch (error) {
    const recorded: NamedHarnessProcess[] = [];
    for (const node of started) {
      recorded.push({
        name: `${node.id}:server`,
        process: node.server,
        expectedScript: 'apps/server/dist/main.js',
      });
      recorded.push({
        name: `${node.id}:worker`,
        process: node.worker,
        expectedScript: 'apps/worker/dist/main.js',
      });
    }
    try {
      await cleanupProcessesAndState(
        recorded,
        (entry) => stopRecordedProcess(entry.process, entry.expectedScript, runId),
        () => clearState(paths),
      );
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'multi-node startup failed and rollback is incomplete',
        { cause: cleanupError },
      );
    }
    throw error;
  }
  print({
    status: 'ready',
    mode,
    nodeCount,
    runId,
    nodes: started.map((node) => ({
      id: node.id,
      nodeDomain: node.nodeDomain,
      grpcTarget: `127.0.0.1:${String(node.grpcPort)}`,
      httpOrigin: `http://127.0.0.1:${String(node.httpPort)}`,
      database: node.databaseName,
    })),
    logs: paths.logDirectory,
  });
}

async function reset(root: string): Promise<void> {
  const paths = pathsFor(root);
  const state = await readState(paths);
  if (state === undefined) {
    const foreign = await findForeignHarnessOwner();
    if (foreign === undefined) {
      print({ status: 'already-clean', detail: 'no harness state or held port in this worktree' });
      return;
    }
    throw new Error(
      `harness lab is held by another worktree (pid=${String(foreign.pid)}, root=${foreign.root ?? 'unknown'}); run \`mise run lab:down\` from it`,
    );
  }
  await cleanupProcessesAndState(
    processEntries(state),
    (entry) => stopRecordedProcess(entry.process, entry.expectedScript, state.runId),
    () => clearState(paths),
  );
  let dropped = 0;
  for (const name of stateDatabaseNames(state)) {
    const dbName = name;
    if (!isHarnessDatabaseName(dbName))
      throw new Error(`refusing to drop non-harness database: ${dbName}`);
    const droppedResult = await command(
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
        `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`,
      ],
      root,
    );
    if (droppedResult.code === 0) dropped += 1;
  }
  print({
    status: 'reset',
    stoppedProcesses: processEntries(state).length,
    droppedDatabases: dropped,
  });
}

async function status(root: string): Promise<void> {
  const paths = pathsFor(root);
  const state = await readState(paths);
  if (state === undefined) {
    const foreign = await findForeignHarnessOwner();
    if (foreign === undefined) {
      print({ status: 'down' });
      return;
    }
    print({
      status: 'held-by-other-worktree',
      pid: foreign.pid,
      root: foreign.root,
    });
    return;
  }
  if (state.version === 1) {
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
    return;
  }
  const nodeStatuses = [];
  for (const node of state.nodes) {
    const serverStatus = await inspectRecordedProcess(
      node.server,
      'apps/server/dist/main.js',
      state.runId,
    );
    const workerStatus = await inspectRecordedProcess(
      node.worker,
      'apps/worker/dist/main.js',
      state.runId,
    );
    nodeStatuses.push({
      id: node.id,
      status:
        serverStatus === 'owned-running' && workerStatus === 'owned-running'
          ? 'running'
          : serverStatus === 'unowned' || workerStatus === 'unowned'
            ? 'unowned'
            : 'degraded',
      grpcTarget: `127.0.0.1:${String(node.grpcPort)}`,
      httpOrigin: `http://127.0.0.1:${String(node.httpPort)}`,
      database: node.databaseName,
    });
  }
  const allRunning =
    state.nodes.length > 0 && nodeStatuses.every((node) => node.status === 'running');
  const anyUnowned = nodeStatuses.some((node) => node.status === 'unowned');
  print({
    status: allRunning ? 'running' : anyUnowned ? 'unowned' : 'degraded',
    mode: state.mode,
    nodeCount: state.nodeCount,
    runId: state.runId,
    nodes: nodeStatuses,
    logs: paths.logDirectory,
  });
}

async function logs(root: string, args: readonly string[]): Promise<void> {
  const paths = pathsFor(root);
  if (args.includes('--follow'))
    throw new Error('safe follow mode is not implemented; use bounded log snapshots');
  const sources: BoundedLogSource[] = [];
  const state = await readState(paths);
  const logNames: string[] =
    state !== undefined && state.version === 2
      ? state.nodes.flatMap((node) => [`${node.id}.server`, `${node.id}.worker`])
      : ['server', 'worker'];
  for (const service of logNames) {
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

async function down(root: string, args: readonly string[]): Promise<void> {
  if (args.includes('--any')) {
    await downAny();
    return;
  }
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

/**
 * Stops whichever worktree currently holds the harness gRPC port, regardless of this
 * worktree's own (possibly empty) `state.json` — the per-worktree-state/global-port mismatch
 * from `docs/agents/LEARNINGS.md` 2026-08-28. Prefers the owning worktree's own recorded
 * state (stops server *and* worker, cleanly clears its state file); falls back to stopping
 * only the discovered process if that state can't be read.
 */
async function downAny(): Promise<void> {
  const owner = await findForeignHarnessOwner();
  if (owner === undefined) {
    print({ status: 'down', stopped: [] });
    return;
  }
  if (owner.root !== undefined) {
    const foreignPaths = pathsFor(owner.root);
    const state = await readState(foreignPaths);
    if (state !== undefined) {
      const stopped = await cleanupProcessesAndState(
        processEntries(state),
        (entry) => stopRecordedProcess(entry.process, entry.expectedScript, state.runId),
        () => clearState(foreignPaths),
      );
      print({ status: 'down', stopped, root: owner.root });
      return;
    }
  }
  const stopped = await stopForeignProcess(owner.pid, 'apps/server/dist/main.js');
  print({
    status: 'down',
    stopped: stopped ? ['server'] : [],
    pid: owner.pid,
    root: owner.root,
  });
}

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

async function register(root: string, args: readonly string[]): Promise<void> {
  const target = await runningState(root, args);
  const handle = flag(args, '--handle') ?? `agent${newRunId().slice(0, 10)}`;
  const password = await passwordFromStdin(args);
  const email = flag(args, '--email') ?? `${handle}@harness.local`;
  const api = createHarnessApi(`127.0.0.1:${String(target.grpcPort)}`).api;
  const result = await registerRpc(api, { handle, email, password, clientRequestId: randomUUID() });
  const cleanup = await logoutAll(api, result.session);
  print({
    ...result.result,
    email,
    webUrl: `http://127.0.0.1:${String(target.httpPort)}`,
    cleanupRequestId: cleanup.requestId,
  });
}

interface HarnessTarget {
  readonly grpcPort: number;
  readonly httpPort: number;
  readonly nodeDomain: string;
}

function targetForNode(state: HarnessState, nodeIndex: number): HarnessTarget {
  if (state.version === 1) {
    if (nodeIndex !== 0) throw new Error('--node is only valid for a multi-node lab');
    return { grpcPort: state.grpcPort, httpPort: state.httpPort, nodeDomain: 'harness.localhost' };
  }
  if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= state.nodeCount)
    throw new Error(`--node must be an integer in 0..${String(state.nodeCount - 1)}`);
  const node = state.nodes[nodeIndex];
  if (node === undefined)
    throw new Error(`--node must be an integer in 0..${String(state.nodeCount - 1)}`);
  return { grpcPort: node.grpcPort, httpPort: node.httpPort, nodeDomain: node.nodeDomain };
}

async function runningState(root: string, args: readonly string[]): Promise<HarnessTarget> {
  const state = await readState(pathsFor(root));
  if (state === undefined) throw new Error('harness lab is not running; run `mise run lab` first');
  const nodeIndex = Number(flag(args, '--node') ?? '0');
  const target = targetForNode(state, nodeIndex);
  if (state.version === 1) {
    const [server, worker] = await Promise.all([
      inspectRecordedProcess(state.server, 'apps/server/dist/main.js', state.runId),
      inspectRecordedProcess(state.worker, 'apps/worker/dist/main.js', state.runId),
    ]);
    assertActionProcessStatuses(server, worker);
    return target;
  }
  const node = state.nodes[nodeIndex];
  if (node === undefined)
    throw new Error(`--node must be an integer in 0..${String(state.nodeCount - 1)}`);
  const [server, worker] = await Promise.all([
    inspectRecordedProcess(node.server, 'apps/server/dist/main.js', state.runId),
    inspectRecordedProcess(node.worker, 'apps/worker/dist/main.js', state.runId),
  ]);
  assertActionProcessStatuses(server, worker);
  return target;
}

function required(args: readonly string[], name: string): string {
  return flag(args, name) ?? fail(`${name} is required`);
}

export const MAX_PASSWORD_STDIN_BYTES = 1024;

export async function readPasswordStdin(
  inputStream: AsyncIterable<Uint8Array | string>,
): Promise<string> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of inputStream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    bytes += buffer.length;
    // Keep the CLI's password input bounded before retaining another chunk in memory.
    if (bytes > MAX_PASSWORD_STDIN_BYTES) throw new Error('password stdin is too large');
    chunks.push(buffer);
  }
  const password = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
  if (password.length === 0 || password.includes('\n') || password.includes('\r'))
    throw new Error('password stdin must contain exactly one non-empty line');
  return password;
}

async function passwordFromStdin(args: readonly string[]): Promise<string> {
  assertPasswordStdinArgs(args);
  return readPasswordStdin(process.stdin);
}

async function authenticatedAction(
  root: string,
  args: readonly string[],
  action: (
    api: ReturnType<typeof createHarnessApi>['api'],
    session: Awaited<ReturnType<typeof login>>['session'],
  ) => Promise<unknown>,
): Promise<void> {
  const target = await runningState(root, args);
  const api = createHarnessApi(`127.0.0.1:${String(target.grpcPort)}`).api;
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
  target: HarnessTarget,
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
    createHarnessApi(`127.0.0.1:${String(target.grpcPort)}`).api,
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
    const target = await runningState(root, args);
    const api = createHarnessApi(`127.0.0.1:${String(target.grpcPort)}`).api;
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
    const target = await runningState(root, args);
    await ensureDeclaredWorld(root, target, args);
  }
}

async function mailpitCommand(subcommand: string, args: readonly string[]): Promise<void> {
  const origin = flag(args, '--origin') ?? MAILPIT_HTTP_ORIGIN;
  if (subcommand === 'mailpit-list') {
    const address = flag(args, '--address');
    const limitFlag = flag(args, '--limit');
    print(
      await listMailpitMessages(origin, {
        ...(address === undefined ? {} : { address }),
        ...(limitFlag === undefined ? {} : { limit: Number(limitFlag) }),
      }),
    );
  } else if (subcommand === 'mailpit-latest') {
    print((await latestMailpitMessage(origin, required(args, '--address'))) ?? null);
  } else if (subcommand === 'mailpit-get') {
    print(await getMailpitMessage(origin, required(args, '--id')));
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
  if (subcommand === 'up') await up(root, args);
  else if (subcommand === 'status') await status(root);
  else if (subcommand === 'logs') await logs(root, args);
  else if (subcommand === 'down') await down(root, args);
  else if (subcommand === 'reset') await reset(root);
  else if (subcommand === 'register') await register(root, args);
  else if (subcommand.startsWith('mailpit-')) await mailpitCommand(subcommand, args);
  else await action(root, subcommand, args);
}

void main().catch((error: unknown) => {
  writeCliError(error);
  process.exitCode = 1;
});
