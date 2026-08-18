import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * A refresh session for one (node, user) pair, held on disk/in the keyring.
 *
 * Access tokens are deliberately absent — they are short-lived (spec §35) and
 * live only in memory, in `SessionManager` (spec §37).
 */
export interface StoredCredential {
  /** The Patches node this credential authenticates against (spec §163, §169). */
  nodeOrigin: string;
  userId: string;
  actorHandle: string;
  refreshToken: string;
  /** ISO-8601. */
  refreshExpiresAt: string;
}

/** What `list()` returns — no `refreshToken`, so a listing can never leak a secret. */
export type AccountSummary = Omit<StoredCredential, 'refreshToken'>;

/**
 * Where the TUI keeps proof that a person is signed in, per node (spec §37).
 *
 * `get`/`list` never fail merely because nothing is stored — they resolve to
 * `undefined`/`[]`. They fail (reject) only for a real I/O/backend problem.
 */
export interface CredentialStore {
  /**
   * `userId` omitted: resolves the single stored account for `nodeOrigin`, or
   * `undefined` if there are zero or more than one (ambiguous — callers with
   * multiple accounts on one node must pass `userId`).
   */
  get(nodeOrigin: string, userId?: string): Promise<StoredCredential | undefined>;
  set(credential: StoredCredential): Promise<void>;
  delete(nodeOrigin: string, userId: string): Promise<void>;
  list(): Promise<AccountSummary[]>;
}

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg !== undefined && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'patches');
}

/** Account metadata only, never secrets — see module doc on `KeyringCredentialStore`. */
export function accountsIndexPath(): string {
  return join(configDir(), 'accounts.json');
}

/** The insecure fallback store's file, guarded by `FileCredentialStore`'s constructor. */
export function credentialsFilePath(): string {
  return join(configDir(), 'credentials.json');
}

function accountKey(nodeOrigin: string, userId: string): string {
  return `${nodeOrigin}:${userId}`;
}

function toSummary(credential: StoredCredential): AccountSummary {
  const { nodeOrigin, userId, actorHandle, refreshExpiresAt } = credential;
  return { nodeOrigin, userId, actorHandle, refreshExpiresAt };
}

function resolveByNode<T extends { nodeOrigin: string; userId: string }>(
  entries: readonly T[],
  nodeOrigin: string,
  userId: string | undefined,
): T | undefined {
  if (userId !== undefined) {
    return entries.find((entry) => entry.nodeOrigin === nodeOrigin && entry.userId === userId);
  }
  const forNode = entries.filter((entry) => entry.nodeOrigin === nodeOrigin);
  return forNode.length === 1 ? forNode[0] : undefined;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// MemoryCredentialStore — tests, and the "no persistence" fallback when no
// secure backend exists and the insecure file has not been opted into.
// ---------------------------------------------------------------------------

// `async` with no `await` is deliberate here: `CredentialStore` is async everywhere
// (the real backends do I/O), so `MemoryCredentialStore` keeps the same shape rather
// than making callers special-case a synchronous implementation.
export class MemoryCredentialStore implements CredentialStore {
  private readonly entries = new Map<string, StoredCredential>();

  get(nodeOrigin: string, userId?: string): Promise<StoredCredential | undefined> {
    return Promise.resolve(resolveByNode([...this.entries.values()], nodeOrigin, userId));
  }

  set(credential: StoredCredential): Promise<void> {
    this.entries.set(accountKey(credential.nodeOrigin, credential.userId), credential);
    return Promise.resolve();
  }

  delete(nodeOrigin: string, userId: string): Promise<void> {
    this.entries.delete(accountKey(nodeOrigin, userId));
    return Promise.resolve();
  }

  list(): Promise<AccountSummary[]> {
    return Promise.resolve([...this.entries.values()].map(toSummary));
  }
}

// ---------------------------------------------------------------------------
// FileCredentialStore — the guarded, explicitly-opted-into fallback (spec §37).
// ---------------------------------------------------------------------------

export interface FileCredentialStoreOptions {
  /** Must be true — the caller is responsible for gating this on the flag/env var. */
  allowInsecure: boolean;
  /** Overridable for tests. */
  path?: string;
  /** Overridable for tests; defaults to `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * The plaintext-on-disk fallback. Only ever constructed when the caller has
 * already checked `--allow-insecure-credential-file` /
 * `PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1` — this class re-checks and throws
 * rather than trusting the caller, since a credential store is exactly the kind
 * of thing that must not silently downgrade its own guarantees (spec §37).
 */
export class FileCredentialStore implements CredentialStore {
  private readonly path: string;
  private readonly warn: (message: string) => void;

  constructor(options: FileCredentialStoreOptions) {
    if (!options.allowInsecure) {
      throw new Error(
        'Storing credentials in a plaintext file requires --allow-insecure-credential-file ' +
          'or PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1.',
      );
    }
    this.path = options.path ?? credentialsFilePath();
    this.warn = options.warn ?? ((message) => process.stderr.write(`${message}\n`));
    this.warn(
      `patches: no OS keyring is available — storing refresh tokens in plaintext at ${this.path} ` +
        '(mode 0600). This is less secure than the system keyring.',
    );
  }

  private async readAll(): Promise<StoredCredential[]> {
    const parsed = await readJsonFile<unknown>(this.path, []);
    return Array.isArray(parsed) ? (parsed as StoredCredential[]) : [];
  }

  private async writeAll(entries: readonly StoredCredential[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${JSON.stringify(entries, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    // Guard against umask widening the mode on creation (research note §4).
    await chmod(this.path, 0o600);
  }

  async get(nodeOrigin: string, userId?: string): Promise<StoredCredential | undefined> {
    return resolveByNode(await this.readAll(), nodeOrigin, userId);
  }

  async set(credential: StoredCredential): Promise<void> {
    const entries = await this.readAll();
    const key = accountKey(credential.nodeOrigin, credential.userId);
    const next = entries.filter((entry) => accountKey(entry.nodeOrigin, entry.userId) !== key);
    next.push(credential);
    await this.writeAll(next);
  }

  async delete(nodeOrigin: string, userId: string): Promise<void> {
    const entries = await this.readAll();
    const key = accountKey(nodeOrigin, userId);
    await this.writeAll(
      entries.filter((entry) => accountKey(entry.nodeOrigin, entry.userId) !== key),
    );
  }

  async list(): Promise<AccountSummary[]> {
    return (await this.readAll()).map(toSummary);
  }
}

// ---------------------------------------------------------------------------
// KeyringCredentialStore — the OS keyring backend (spec §37, preferred).
// ---------------------------------------------------------------------------

/** The slice of `@napi-rs/keyring`'s `Entry` this module actually uses. */
export interface KeyringEntryLike {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

interface KeyringModule {
  Entry: new (service: string, username: string) => KeyringEntryLike;
}

const KEYRING_SERVICE = 'patches';

let keyringModulePromise: Promise<KeyringModule | undefined> | undefined;

/**
 * Imported dynamically and defensively (spec §37, docs/research/infra-and-security-libs.md
 * §4): `@napi-rs/keyring` can fail to load on headless/Termux environments with no D-Bus
 * secret-service and no `keyutils`, and that must never crash the whole CLI.
 */
async function loadKeyring(): Promise<KeyringModule | undefined> {
  keyringModulePromise ??= import('@napi-rs/keyring').then(
    (module_) => module_ as unknown as KeyringModule,
    () => undefined,
  );
  return keyringModulePromise;
}

export async function isKeyringAvailable(): Promise<boolean> {
  return (await loadKeyring()) !== undefined;
}

async function readAccountsIndex(path: string): Promise<AccountSummary[]> {
  const parsed = await readJsonFile<{ accounts?: AccountSummary[] }>(path, {});
  return Array.isArray(parsed.accounts) ? parsed.accounts : [];
}

async function writeAccountsIndex(
  path: string,
  accounts: readonly AccountSummary[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ accounts }, null, 2)}\n`, 'utf8');
}

/**
 * Secrets live only in the OS keyring, one `Entry` per (node, user); the
 * keyring has no "list all entries for this service" API, so a small
 * secret-free JSON index tracks *which* (node, user) pairs exist, for
 * `list()`/`patches accounts` (spec §37: "index of accounts ... no secrets").
 */
export class KeyringCredentialStore implements CredentialStore {
  private readonly indexPath: string;

  constructor(options: { indexPath?: string } = {}) {
    this.indexPath = options.indexPath ?? accountsIndexPath();
  }

  private async resolveSummary(
    nodeOrigin: string,
    userId: string | undefined,
  ): Promise<AccountSummary | undefined> {
    return resolveByNode(await readAccountsIndex(this.indexPath), nodeOrigin, userId);
  }

  async get(nodeOrigin: string, userId?: string): Promise<StoredCredential | undefined> {
    const summary = await this.resolveSummary(nodeOrigin, userId);
    if (summary === undefined) return undefined;
    const keyring = await loadKeyring();
    if (keyring === undefined) return undefined;
    const entry = new keyring.Entry(
      KEYRING_SERVICE,
      accountKey(summary.nodeOrigin, summary.userId),
    );
    const refreshToken = entry.getPassword();
    if (refreshToken === null) return undefined;
    return { ...summary, refreshToken };
  }

  async set(credential: StoredCredential): Promise<void> {
    const keyring = await loadKeyring();
    if (keyring === undefined) {
      throw new Error('No OS keyring is available on this system.');
    }
    const entry = new keyring.Entry(
      KEYRING_SERVICE,
      accountKey(credential.nodeOrigin, credential.userId),
    );
    entry.setPassword(credential.refreshToken);

    const accounts = await readAccountsIndex(this.indexPath);
    const summary = toSummary(credential);
    const key = accountKey(summary.nodeOrigin, summary.userId);
    const next = accounts.filter((entry_) => accountKey(entry_.nodeOrigin, entry_.userId) !== key);
    next.push(summary);
    await writeAccountsIndex(this.indexPath, next);
  }

  async delete(nodeOrigin: string, userId: string): Promise<void> {
    const keyring = await loadKeyring();
    if (keyring !== undefined) {
      const entry = new keyring.Entry(KEYRING_SERVICE, accountKey(nodeOrigin, userId));
      entry.deletePassword();
    }
    const accounts = await readAccountsIndex(this.indexPath);
    const key = accountKey(nodeOrigin, userId);
    await writeAccountsIndex(
      this.indexPath,
      accounts.filter((entry) => accountKey(entry.nodeOrigin, entry.userId) !== key),
    );
  }

  async list(): Promise<AccountSummary[]> {
    return readAccountsIndex(this.indexPath);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateCredentialStoreOptions {
  allowInsecureFile: boolean;
  warn?: (message: string) => void;
}

/**
 * Picks a backend the way spec §37 requires: OS keyring first; only the
 * explicitly-acknowledged plaintext file if the caller opted in; otherwise an
 * in-memory store that never touches disk (nothing is persisted by default
 * when secure storage is unavailable).
 */
export async function createDefaultCredentialStore(
  options: CreateCredentialStoreOptions,
): Promise<CredentialStore> {
  if (await isKeyringAvailable()) return new KeyringCredentialStore();

  const warn = options.warn ?? ((message: string) => process.stderr.write(`${message}\n`));
  if (options.allowInsecureFile) {
    return new FileCredentialStore({ allowInsecure: true, warn });
  }

  warn(
    'patches: no OS keyring is available and --allow-insecure-credential-file was not given — ' +
      'your session will not be remembered after this command exits.',
  );
  return new MemoryCredentialStore();
}

/** Test/CLI helper: remove the on-disk index and file store entirely. */
export async function clearCredentialStoreFiles(): Promise<void> {
  await rm(accountsIndexPath(), { force: true });
  await rm(credentialsFilePath(), { force: true });
}
