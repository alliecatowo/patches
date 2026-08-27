import { randomBytes } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';

export const DEFAULT_DATABASE_NAME = 'patches_harness_lab';
export const DEFAULT_HTTP_PORT = 8088;
export const DEFAULT_GRPC_PORT = 50058;

export interface HarnessProcess {
  readonly pid: number;
  readonly startedAt: string;
}

export interface HarnessState {
  readonly version: 1;
  readonly runId: string;
  readonly databaseName: typeof DEFAULT_DATABASE_NAME;
  readonly databaseUrl: string;
  readonly httpPort: number;
  readonly grpcPort: number;
  readonly server: HarnessProcess;
  readonly worker: HarnessProcess;
}

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
export function harnessProcessEnvironment(
  source: NodeJS.ProcessEnv,
  state: Pick<HarnessState, 'runId' | 'databaseUrl' | 'httpPort' | 'grpcPort'>,
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
    EMAIL_PROVIDER: 'console',
    EMAIL_FROM: 'Patches Harness <noreply@harness.local>',
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

/** The harness may only ever create or migrate this local disposable database. */
export function isHarnessDatabaseName(name: unknown): name is typeof DEFAULT_DATABASE_NAME {
  return name === DEFAULT_DATABASE_NAME;
}

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
  if (!isHarnessDatabaseName(databaseName)) {
    throw new Error(`refusing non-harness database name: ${databaseName}`);
  }
  return `postgres://patches:patches@127.0.0.1:5432/${databaseName}`;
}

export function newRunId(): string {
  return randomBytes(16).toString('hex');
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
  readonly name: 'server' | 'worker';
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

function isHarnessState(value: unknown): value is HarnessState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'runId' in value &&
    typeof value.runId === 'string' &&
    'databaseName' in value &&
    isHarnessDatabaseName(value.databaseName) &&
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
