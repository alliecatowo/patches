import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';

export const DEFAULT_DATABASE_NAME = 'patches_harness_lab';
export const DEFAULT_HTTP_PORT = 8088;
export const DEFAULT_GRPC_PORT = 50058;
/** Mailpit is a single machine-wide `mise run compose` service, not per-worktree lab state. */
export const MAILPIT_HTTP_ORIGIN = 'http://127.0.0.1:8025';
export const MAILPIT_SMTP_PORT = 1025;

/**
 * Multi-node lab port ranges (`up --nodes N` / `up --federation`). Deliberately disjoint from
 * the single-node harness (:50058/:8088) and the legacy `fed-lab.sh` (:50061/:50062/:8081/:8082)
 * so an agent can hold either kind of lab without colliding on a port. Node `i` (0-based) gets
 * grpc `MULTI_GRPC_BASE_PORT + i` and http `MULTI_HTTP_BASE_PORT + i`.
 */
export const MULTI_GRPC_BASE_PORT = 50100;
export const MULTI_HTTP_BASE_PORT = 8091;
/** Per-node database suffix template; node `i` uses `patches_harness_lab_<i>`. */
export const NODE_DATABASE_NAME_TEMPLATE = 'patches_harness_lab_';

export interface HarnessProcess {
  readonly pid: number;
  readonly startedAt: string;
}

export interface SingleNodeState {
  readonly version: 1;
  readonly runId: string;
  readonly databaseName: typeof DEFAULT_DATABASE_NAME;
  readonly databaseUrl: string;
  readonly httpPort: number;
  readonly grpcPort: number;
  readonly server: HarnessProcess;
  readonly worker: HarnessProcess;
}

/** One isolated node instance within a multi-node/federation run (`up --nodes N`). */
export interface HarnessNodeState {
  readonly id: string;
  readonly nodeDomain: string;
  readonly databaseName: string;
  readonly databaseUrl: string;
  readonly httpPort: number;
  readonly grpcPort: number;
  readonly server: HarnessProcess;
  readonly worker: HarnessProcess;
}

export interface HarnessMultiState {
  readonly version: 2;
  readonly runId: string;
  readonly mode: 'multi' | 'federation';
  readonly nodeCount: number;
  /** Shared federation key-encryption key (base64, 32 bytes) — present iff `mode === 'federation'`. */
  readonly federationKey?: string;
  readonly nodes: readonly HarnessNodeState[];
}

export type HarnessState = SingleNodeState | HarnessMultiState;

export interface HarnessSecrets {
  readonly JWT_PRIVATE_KEY: string;
  readonly JWT_PUBLIC_KEY: string;
  readonly AUTH_CODE_DELIVERY_ACTIVE_KEY_ID: string;
  readonly AUTH_CODE_DELIVERY_KEYS: string;
}

export interface LabPaths {
  readonly root: string;
  readonly runDirectory: string;
  readonly logDirectory: string;
  readonly stateFile: string;
}

const RUNTIME_ENV_KEYS = [
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TEMP',
  'TMP',
  'TMPDIR',
  'TZ',
  'XDG_CACHE_HOME',
] as const;

/**
 * Copy only ordinary OS/runtime settings. Secrets, deployment flags, Node injection options,
 * cloud credentials, and application configuration are deliberately absent.
 */
export function allowlistedRuntimeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of RUNTIME_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

/** Complete, closed environment for the server and worker child processes. */
export interface HarnessProcessEnvironmentState {
  readonly runId: string;
  readonly databaseUrl: string;
  readonly httpPort: number;
  readonly grpcPort: number;
}

export function harnessProcessEnvironment(
  source: NodeJS.ProcessEnv,
  state: HarnessProcessEnvironmentState,
  secrets: HarnessSecrets,
): NodeJS.ProcessEnv {
  return {
    ...allowlistedRuntimeEnvironment(source),
    ...secrets,
    // Production mode is intentional here: both apps then refuse to read the repo's .env,
    // so an operator's real credentials cannot refill variables omitted by this allow-list.
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    DATABASE_URL: state.databaseUrl,
    DATABASE_SSL: 'false',
    NODE_DOMAIN: 'harness.localhost',
    PUBLIC_ORIGIN: `http://127.0.0.1:${String(state.httpPort)}`,
    WEB_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
    GRPC_HOST: '127.0.0.1',
    GRPC_PORT: String(state.grpcPort),
    HTTP_PORT: String(state.httpPort),
    INVITE_ONLY: 'false',
    PASSWORD_AUTH: 'optional',
    FEDERATION_ENABLED: 'false',
    FEDERATION_STANCE: 'disabled',
    CAN_CREATE_COMMUNITY: 'false',
    OIDC_PROVIDERS: '[]',
    OTEL_ENABLED: 'false',
    METRICS_ENABLED: 'false',
    // Routed at Mailpit (`infra/compose/docker-compose.yml`) rather than `console` so
    // `mailpit-*` harness actions can retrieve real verification-code emails end-to-end.
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'Patches Harness <noreply@harness.local>',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(MAILPIT_SMTP_PORT),
    // Object storage has no enable flag. A loopback-only endpoint plus deliberately empty
    // credentials/bucket makes the lazy storage provider fail closed before any request.
    R2_ENDPOINT: 'http://127.0.0.1:1',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    PATCHES_HARNESS_RUN_ID: state.runId,
  };
}

export function assertLinuxHarness(platform = process.platform): void {
  if (platform !== 'linux') {
    throw new Error(
      'patches-harness lifecycle is Linux-only: safe PID ownership verification requires /proc',
    );
  }
}

/** Resolve a real repository root and reject lookalike directories before lifecycle writes. */
export async function canonicalRepoRoot(candidate: string): Promise<string> {
  const canonical = await realpath(resolve(candidate));
  const packagePath = resolve(canonical, 'package.json');
  const workspacePath = resolve(canonical, 'pnpm-workspace.yaml');
  const gitPath = resolve(canonical, '.git');
  for (const marker of [packagePath, workspacePath, gitPath]) {
    const markerStat = await lstat(marker).catch((error: unknown) => {
      if (isNotFound(error))
        throw new Error(`not a Patches workspace: missing ${basename(marker)}`);
      throw error;
    });
    if (markerStat.isSymbolicLink()) {
      throw new Error(`refusing symlinked repository marker: ${marker}`);
    }
  }
  const packageJson: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    !('name' in packageJson) ||
    packageJson.name !== 'patches'
  ) {
    throw new Error('not a Patches workspace: package.json name must be "patches"');
  }
  return canonical;
}

export function pathsFor(root: string): LabPaths {
  const normalizedRoot = resolve(root);
  const runDirectory = resolve(normalizedRoot, 'infra/lab/.run/harness');
  if (!isSafeHarnessRunDirectory(normalizedRoot, runDirectory)) {
    throw new Error('refusing to use a harness run directory outside infra/lab/.run/harness');
  }
  return {
    root: normalizedRoot,
    runDirectory,
    logDirectory: resolve(runDirectory, 'logs'),
    stateFile: resolve(runDirectory, 'state.json'),
  };
}

/**
 * The harness may only ever create or migrate its dedicated disposable databases: the single
 * `patches_harness_lab` and the per-node `patches_harness_lab_<n>` names used by multi-node
 * runs. Anything else is refused, so a reset can never drop a non-harness database.
 */
export function isHarnessDatabaseName(name: unknown): name is HarnessDatabaseName {
  return (
    typeof name === 'string' &&
    (name === DEFAULT_DATABASE_NAME || /^patches_harness_lab_\d+$/u.test(name))
  );
}

export type HarnessDatabaseName = string & { readonly __harnessDatabase: unique symbol };

/** Reject traversal and broad directories before creating, deleting, or reading state. */
export function isSafeHarnessRunDirectory(root: string, candidate: string): boolean {
  const expected = resolve(root, 'infra/lab/.run/harness');
  return (
    resolve(candidate) === expected &&
    basename(expected) === 'harness' &&
    expected.includes(`${sep}infra${sep}lab${sep}.run${sep}`)
  );
}

export function databaseUrl(databaseName = DEFAULT_DATABASE_NAME): string {
  const candidate = databaseName;
  if (!isHarnessDatabaseName(candidate)) {
    throw new Error(`refusing non-harness database name: ${candidate}`);
  }
  return `postgres://patches:patches@127.0.0.1:5432/${candidate}`;
}

export function newRunId(): string {
  return randomBytes(16).toString('hex');
}

/** Database name for multi-node node `index` (0-based); validates against the harness allow-list. */
export function nodeDatabaseName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error(`invalid multi-node index: ${String(index)}`);
  return `${NODE_DATABASE_NAME_TEMPLATE}${String(index)}`;
}

export function nodeDatabaseUrl(index: number): string {
  return databaseUrl(nodeDatabaseName(index));
}

export function nodeId(index: number): string {
  return `node-${String(index)}`;
}

/** Per-node `NODE_DOMAIN` for federation runs; `a.localhost`, `b.localhost`, … (single letter). */
export function nodeDomain(index: number, mode: 'multi' | 'federation'): string {
  if (mode !== 'federation') return 'harness.localhost';
  const letter = String.fromCharCode('a'.charCodeAt(0) + index);
  return `${letter}.localhost`;
}

/** Isolated, deterministic ports for node `index`, disjoint from the single-node/fed-lab ranges. */
export function allocateNodePorts(index: number): {
  readonly grpcPort: number;
  readonly httpPort: number;
  readonly nodeDomain: string;
} {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('invalid multi-node index');
  return {
    grpcPort: MULTI_GRPC_BASE_PORT + index,
    httpPort: MULTI_HTTP_BASE_PORT + index,
    nodeDomain: nodeDomain(index, 'multi'),
  };
}

/**
 * Shared federation key-encryption key for a federation run: base64-encoded 32 bytes, exactly
 * what `apps/server`'s `FEDERATION_KEY_ENCRYPTION_KEY` schema requires (32 base64-decoded bytes).
 */
export function generateFederationKeyEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}

/** Every process a run owns that must be proven stopped before its state can be cleared. */
export function stateProcessEntries(state: HarnessState): readonly NamedHarnessProcess[] {
  if (state.version === 1) {
    return [
      { name: 'worker', process: state.worker, expectedScript: 'apps/worker/dist/main.js' },
      { name: 'server', process: state.server, expectedScript: 'apps/server/dist/main.js' },
    ];
  }
  const entries: NamedHarnessProcess[] = [];
  for (const node of state.nodes) {
    entries.push({
      name: `${node.id}:worker`,
      process: node.worker,
      expectedScript: 'apps/worker/dist/main.js',
    });
    entries.push({
      name: `${node.id}:server`,
      process: node.server,
      expectedScript: 'apps/server/dist/main.js',
    });
  }
  return entries;
}

/** All database names owned by a run (single-node returns just its one DB). */
export function stateDatabaseNames(state: HarnessState): readonly string[] {
  if (state.version === 1) return [state.databaseName];
  return state.nodes.map((node) => node.databaseName);
}

export async function prepareRunDirectory(paths: LabPaths): Promise<void> {
  await assertRuntimePathHasNoSymlinks(paths);
  await mkdir(paths.logDirectory, { recursive: true, mode: 0o700 });
  await assertRuntimePathHasNoSymlinks(paths);
  const canonicalRunDirectory = await realpath(paths.runDirectory);
  if (canonicalRunDirectory !== paths.runDirectory) {
    throw new Error('refusing a non-canonical harness run directory');
  }
}

export async function readState(paths: LabPaths): Promise<HarnessState | undefined> {
  await assertRuntimePathHasNoSymlinks(paths);
  try {
    const parsed: unknown = JSON.parse(await readRegularLeaf(paths.stateFile));
    if (!isHarnessState(parsed)) throw new Error('invalid harness state file');
    return parsed;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function writeState(paths: LabPaths, state: HarnessState): Promise<void> {
  await prepareRunDirectory(paths);
  await atomicPersistLeaf(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`, state.runId);
}

export interface AtomicPersistenceDependencies {
  readonly assertTarget: (path: string) => Promise<void>;
  readonly writeTemporary: (path: string, content: string) => Promise<void>;
  readonly replace: (temporaryPath: string, targetPath: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly nonce: () => string;
}

const REAL_ATOMIC_PERSISTENCE: AtomicPersistenceDependencies = {
  assertTarget: (path) => assertSafeOptionalLeaf(path, 'state'),
  writeTemporary: writeExclusiveRegularLeaf,
  replace: rename,
  remove: (path) => unlink(path).catch(ignoreNotFound),
  nonce: () => randomBytes(8).toString('hex'),
};

export async function atomicPersistLeaf(
  targetPath: string,
  content: string,
  token: string,
  dependencies: AtomicPersistenceDependencies = REAL_ATOMIC_PERSISTENCE,
): Promise<void> {
  await dependencies.assertTarget(targetPath);
  const temporaryPath = resolve(
    dirname(targetPath),
    `.${basename(targetPath)}-${token}-${dependencies.nonce()}.tmp`,
  );
  let temporaryCreated = false;
  try {
    await dependencies.writeTemporary(temporaryPath, content);
    // Ownership begins only after the exclusive creator succeeds. In particular, EEXIST
    // means another leaf already occupies this name and must never be unlinked by this call.
    temporaryCreated = true;
    // Same-directory rename is atomic. It replaces the directory entry itself and never
    // follows a target symlink; the preflight above provides a clear refusal for one already
    // present, while the private mode-0700 parent excludes an untrusted swap afterwards.
    await dependencies.replace(temporaryPath, targetPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) await dependencies.remove(temporaryPath);
  }
}

async function writeExclusiveRegularLeaf(path: string, content: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error('refusing non-regular temporary state leaf');
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    // Only a successfully opened O_EXCL leaf belongs to this call. This also handles a
    // write/fsync/close failure without ever removing an EEXIST collision.
    if (handle !== undefined) await unlink(path).catch(ignoreNotFound);
    throw error;
  }
}

export async function clearState(paths: LabPaths): Promise<void> {
  await assertRuntimePathHasNoSymlinks(paths);
  if (!isSafeHarnessRunDirectory(paths.root, paths.runDirectory)) {
    throw new Error('refusing to clear an unsafe harness run directory');
  }
  try {
    await assertSafeOptionalLeaf(paths.stateFile, 'state');
    await unlink(paths.stateFile);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

export async function readRegularLeaf(path: string): Promise<string> {
  await assertSafeOptionalLeaf(path, 'file');
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error(`refusing non-regular leaf: ${path}`);
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export function openReadOnlyRegularLeaf(path: string): number {
  try {
    const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    if (!fstatSync(descriptor).isFile()) {
      closeSync(descriptor);
      throw new Error(`refusing non-regular leaf: ${path}`);
    }
    return descriptor;
  } catch (error) {
    if (isSymlinkLoop(error)) throw new Error(`refusing symlinked leaf: ${path}`, { cause: error });
    throw error;
  }
}

/** Open a log for append without following its leaf; the returned descriptor is caller-owned. */
export function openAppendOnlyLog(path: string): number {
  try {
    const leaf = lstatSync(path, { throwIfNoEntry: false });
    if (leaf !== undefined && (!leaf.isFile() || leaf.isSymbolicLink())) {
      throw new Error(`refusing unsafe pre-existing log leaf: ${path}`);
    }
    const descriptor = openSync(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_NOFOLLOW,
      0o600,
    );
    if (!fstatSync(descriptor).isFile()) {
      closeSync(descriptor);
      throw new Error(`refusing non-regular log leaf: ${path}`);
    }
    return descriptor;
  } catch (error) {
    if (isSymlinkLoop(error))
      throw new Error(`refusing symlinked log leaf: ${path}`, { cause: error });
    throw error;
  }
}

async function assertSafeOptionalLeaf(path: string, kind: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`refusing unsafe pre-existing ${kind} leaf: ${path}`);
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

export async function assertRuntimePathHasNoSymlinks(paths: LabPaths): Promise<void> {
  if (!isSafeHarnessRunDirectory(paths.root, paths.runDirectory)) {
    throw new Error('refusing an unsafe harness run directory');
  }
  const pathParts = relative(paths.root, paths.logDirectory).split(sep);
  let current = paths.root;
  for (const part of pathParts) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`refusing symlinked harness runtime path: ${current}`);
      }
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }
}

export interface NamedHarnessProcess {
  readonly name: string;
  readonly process: HarnessProcess;
  readonly expectedScript: string;
}

export type ProcessOwnership = 'owned-running' | 'stopped' | 'unowned';

export interface ProcessInspectionDependencies {
  readonly probe: (pid: number) => void;
  readonly readProcFile: (path: string) => Promise<string>;
}

const REAL_PROCESS_INSPECTION: ProcessInspectionDependencies = {
  probe: (pid) => process.kill(pid, 0),
  readProcFile: (path) => readFile(path, 'utf8'),
};

export async function inspectRecordedProcess(
  processInfo: HarnessProcess,
  expectedScript: string,
  runId: string,
  dependencies: ProcessInspectionDependencies = REAL_PROCESS_INSPECTION,
): Promise<ProcessOwnership> {
  try {
    dependencies.probe(processInfo.pid);
  } catch (error) {
    if (isNoSuchProcess(error)) return 'stopped';
    throw error;
  }
  try {
    const commandLine = await dependencies.readProcFile(`/proc/${String(processInfo.pid)}/cmdline`);
    const environment = await dependencies.readProcFile(`/proc/${String(processInfo.pid)}/environ`);
    const ownsCommand = commandLine.includes(expectedScript) && commandLine.includes('node');
    const ownsNonce = environment.split('\0').includes(`PATCHES_HARNESS_RUN_ID=${runId}`);
    return ownsCommand && ownsNonce ? 'owned-running' : 'unowned';
  } catch {
    // A /proc read failure cannot prove ownership, so fail closed as unowned.
    return 'unowned';
  }
}

export interface ProcessStopDependencies {
  readonly inspect: (
    processInfo: HarnessProcess,
    expectedScript: string,
    runId: string,
  ) => Promise<ProcessOwnership>;
  readonly signalGroup: (pid: number, signal: NodeJS.Signals) => void;
  readonly delay: () => Promise<void>;
  readonly termPolls?: number;
  readonly killPolls?: number;
}

const REAL_PROCESS_STOP: ProcessStopDependencies = {
  inspect: inspectRecordedProcess,
  signalGroup: (pid, signal) => process.kill(-pid, signal),
  delay: () => new Promise((resolveDelay) => setTimeout(resolveDelay, 100)),
  termPolls: 60,
  killPolls: 20,
};

export async function stopRecordedProcess(
  processInfo: HarnessProcess,
  expectedScript: string,
  runId: string,
  dependencies: ProcessStopDependencies = REAL_PROCESS_STOP,
): Promise<boolean> {
  const ownership = await dependencies.inspect(processInfo, expectedScript, runId);
  if (ownership === 'stopped') return true;
  if (ownership === 'unowned') return false;
  dependencies.signalGroup(processInfo.pid, 'SIGTERM');
  for (let attempt = 0; attempt < (dependencies.termPolls ?? 60); attempt += 1) {
    await dependencies.delay();
    if ((await dependencies.inspect(processInfo, expectedScript, runId)) === 'stopped') return true;
  }
  dependencies.signalGroup(processInfo.pid, 'SIGKILL');
  for (let attempt = 0; attempt < (dependencies.killPolls ?? 20); attempt += 1) {
    await dependencies.delay();
    if ((await dependencies.inspect(processInfo, expectedScript, runId)) === 'stopped') return true;
  }
  return false;
}

export interface SurvivalTarget {
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
}

export async function waitForProcessSurvival(
  target: SurvivalTarget,
  durationMs = 750,
  delay: (durationMs: number) => Promise<void> = (duration) =>
    new Promise((resolveDelay) => setTimeout(resolveDelay, duration)),
): Promise<void> {
  if (target.exitCode !== null || target.signalCode !== null) {
    throw new Error('worker exited before its startup survival interval');
  }
  await delay(durationMs);
  if (target.exitCode !== null || target.signalCode !== null) {
    throw new Error('worker exited during its startup survival interval');
  }
}

/** Attempt every stop even when one fails; callers clear state only after this resolves. */
export async function stopAllRecordedProcesses(
  processes: readonly NamedHarnessProcess[],
  stop: (entry: NamedHarnessProcess) => Promise<boolean>,
): Promise<readonly string[]> {
  const outcomes = await Promise.allSettled(
    processes.map(async (entry) => ({ entry, stopped: await stop(entry) })),
  );
  const failures: string[] = [];
  const stopped: string[] = [];
  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];
    const entry = processes[index];
    if (outcome === undefined || entry === undefined) continue;
    if (outcome.status === 'rejected') {
      failures.push(
        `${entry.name}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`,
      );
    } else if (!outcome.value.stopped) {
      failures.push(`${entry.name}: ownership or shutdown could not be proven`);
    } else {
      stopped.push(entry.name);
    }
  }
  if (failures.length > 0)
    throw new Error(`harness processes remain unresolved (${failures.join('; ')})`);
  return stopped;
}

/** State is removed only after every process has been proven stopped. */
export async function cleanupProcessesAndState(
  processes: readonly NamedHarnessProcess[],
  stop: (entry: NamedHarnessProcess) => Promise<boolean>,
  clear: () => Promise<void>,
): Promise<readonly string[]> {
  const stopped = await stopAllRecordedProcesses(processes, stop);
  await clear();
  return stopped;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isNoSuchProcess(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH';
}

function isSymlinkLoop(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ELOOP';
}

function ignoreNotFound(error: unknown): void {
  if (!isNotFound(error)) throw error;
}

function isHarnessProcess(value: unknown): value is HarnessProcess {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 1 &&
    'startedAt' in value &&
    typeof value.startedAt === 'string'
  );
}

function isHarnessNodeState(value: unknown): value is HarnessNodeState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    /^node-\d+$/u.test(value.id) &&
    'nodeDomain' in value &&
    typeof value.nodeDomain === 'string' &&
    value.nodeDomain.length > 0 &&
    'databaseName' in value &&
    isHarnessDatabaseName(value.databaseName) &&
    'databaseUrl' in value &&
    value.databaseUrl === databaseUrl(value.databaseName) &&
    'httpPort' in value &&
    typeof value.httpPort === 'number' &&
    'grpcPort' in value &&
    typeof value.grpcPort === 'number' &&
    'server' in value &&
    isHarnessProcess(value.server) &&
    'worker' in value &&
    isHarnessProcess(value.worker)
  );
}

function isSingleNodeState(value: unknown): value is SingleNodeState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'runId' in value &&
    typeof value.runId === 'string' &&
    'databaseName' in value &&
    value.databaseName === DEFAULT_DATABASE_NAME &&
    'databaseUrl' in value &&
    value.databaseUrl === databaseUrl(value.databaseName) &&
    'httpPort' in value &&
    value.httpPort === DEFAULT_HTTP_PORT &&
    'grpcPort' in value &&
    value.grpcPort === DEFAULT_GRPC_PORT &&
    'server' in value &&
    isHarnessProcess(value.server) &&
    'worker' in value &&
    isHarnessProcess(value.worker)
  );
}

function isHarnessMultiState(value: unknown): value is HarnessMultiState {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 2 ||
    !('runId' in value) ||
    typeof value.runId !== 'string' ||
    !('mode' in value) ||
    (value.mode !== 'multi' && value.mode !== 'federation') ||
    !('nodeCount' in value) ||
    typeof value.nodeCount !== 'number' ||
    !Number.isSafeInteger(value.nodeCount) ||
    value.nodeCount < 1 ||
    !('nodes' in value) ||
    !Array.isArray(value.nodes) ||
    value.nodes.length !== value.nodeCount
  ) {
    return false;
  }
  for (const node of value.nodes) {
    if (!isHarnessNodeState(node)) return false;
  }
  if (value.mode === 'federation') {
    if (!('federationKey' in value) || typeof value.federationKey !== 'string') return false;
    if (Buffer.from(value.federationKey, 'base64').length !== 32) return false;
  }
  return true;
}

function isHarnessState(value: unknown): value is HarnessState {
  return isSingleNodeState(value) || isHarnessMultiState(value);
}

export interface PortOwnerDependencies {
  readonly run: (port: number) => Promise<string>;
  readonly readCwd: (pid: number) => Promise<string | undefined>;
}

const REAL_PORT_OWNER: PortOwnerDependencies = {
  run: async (port) => {
    const child = spawn('ss', ['-H', '-tlnp', `sport = :${String(port)}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    const output = child.stdout;
    if (output !== null) output.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    await once(child, 'close');
    return stdout;
  },
  readCwd: async (pid) => {
    try {
      return await readlink(`/proc/${String(pid)}/cwd`);
    } catch {
      // Ownership is genuinely unknown (process gone, no /proc access) — callers treat an
      // undefined root as "found a pid, but can't say which worktree started it".
      return undefined;
    }
  },
};

/** Parses `ss -H -tlnp` output for the listening process's pid; `undefined` if nothing owns the port. */
export function parsePortOwnerPid(ssOutput: string): number | undefined {
  const match = /pid=(\d+)/u.exec(ssOutput);
  if (match?.[1] === undefined) return undefined;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) && pid > 1 ? pid : undefined;
}

export async function findPortOwnerPid(
  port: number,
  dependencies: PortOwnerDependencies = REAL_PORT_OWNER,
): Promise<number | undefined> {
  return parsePortOwnerPid(await dependencies.run(port));
}

export interface ForeignHarnessOwner {
  readonly pid: number;
  /** `undefined` when the pid is known but its cwd (and so its owning worktree) could not be read. */
  readonly root: string | undefined;
}

/**
 * Resolves the pid — and, if provable via `/proc/<pid>/cwd`, the owning worktree root —
 * currently bound to a harness port, regardless of which worktree's (or no) `state.json`
 * recorded it. `mise run lab` state is per-worktree but :50058/:8088 are machine-global
 * (`docs/agents/LEARNINGS.md` 2026-08-28), so `status`/`down --any` need this to see past the
 * current worktree's own lab state.
 */
export async function findForeignHarnessOwner(
  dependencies: PortOwnerDependencies = REAL_PORT_OWNER,
  port: number = DEFAULT_GRPC_PORT,
): Promise<ForeignHarnessOwner | undefined> {
  const pid = await findPortOwnerPid(port, dependencies);
  if (pid === undefined) return undefined;
  return { pid, root: await dependencies.readCwd(pid) };
}

/** Same ownership proof as `inspectRecordedProcess`, minus the run-id nonce this worktree never recorded. */
export async function inspectForeignProcess(
  pid: number,
  expectedScript: string,
  dependencies: ProcessInspectionDependencies = REAL_PROCESS_INSPECTION,
): Promise<ProcessOwnership> {
  try {
    dependencies.probe(pid);
  } catch (error) {
    if (isNoSuchProcess(error)) return 'stopped';
    throw error;
  }
  try {
    const commandLine = await dependencies.readProcFile(`/proc/${String(pid)}/cmdline`);
    return commandLine.includes(expectedScript) && commandLine.includes('node')
      ? 'owned-running'
      : 'unowned';
  } catch {
    return 'unowned';
  }
}

/**
 * Stops a harness process this worktree's `state.json` never recorded, verifying by command
 * line (not run-id, which is unavailable here) before ever signaling — the same fail-closed
 * shape as `stopRecordedProcess`, reused via a synthetic run id that `inspectForeignProcess`
 * ignores.
 */
export async function stopForeignProcess(
  pid: number,
  expectedScript: string,
  dependencies: ProcessStopDependencies = {
    ...REAL_PROCESS_STOP,
    inspect: (processInfo, script) => inspectForeignProcess(processInfo.pid, script),
  },
): Promise<boolean> {
  return stopRecordedProcess({ pid, startedAt: '' }, expectedScript, '', dependencies);
}
