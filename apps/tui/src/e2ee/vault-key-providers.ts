import { randomBytes } from '@patches/crypto';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { VaultFileOperations } from './vault-file-operations.js';
import { defaultVaultFileOperations } from './vault-file-operations.js';
import { VaultCorruptionError } from './vault-errors.js';

/**
 * Wrapping-key providers for the E2EE vault (P13-006), mirroring the credential
 * store's tiering (spec §37, ADR 0020 §4): OS keyring first, an explicitly opted-into
 * guarded file second, and an in-memory key that persists nothing otherwise.
 *
 * The provider also owns the **generation anchor**: the highest vault generation this
 * device has ever committed, stored next to the wrapping key where a restored vault
 * file backup cannot roll it back. `FileVaultStore` compares it on open to refuse
 * silent downgrades (P13-006 rollback detection).
 */

export interface VaultAccount {
  readonly nodeOrigin: string;
  readonly userId: string;
}

/** Same string shape as the credential store's keyring account, so one account maps to
 * exactly one keyring entry in each service. */
export function vaultAccountKey(account: VaultAccount): string {
  return `${account.nodeOrigin}:${account.userId}`;
}

const KEY_RECORD_VERSION = 1;

interface StoredKeyRecord {
  readonly v: 1;
  readonly k: string;
  readonly g: number;
}

export interface VaultKeyState {
  readonly wrappingKey: Uint8Array;
  /** High-water generation mark; 0 for a brand-new vault. */
  readonly generation: number;
}

export interface VaultKeyProvider {
  /** Whether commits under this provider can be read back after the process exits. */
  readonly persistent: boolean;
  loadOrCreate(): Promise<VaultKeyState>;
  /** Raises the high-water mark. Never decreases it; values below the current mark are ignored. */
  advanceGeneration(generation: number): Promise<void>;
  /** Removes the wrapping key and generation anchor entirely (logout/device wipe). */
  delete(): Promise<void>;
}

function encodeKeyRecord(wrappingKey: Uint8Array, generation: number): string {
  return JSON.stringify({
    v: KEY_RECORD_VERSION,
    k: Buffer.from(wrappingKey).toString('base64'),
    g: generation,
  } satisfies StoredKeyRecord);
}

function decodeKeyRecord(raw: string): VaultKeyState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new VaultCorruptionError();
  }
  const record = parsed as Partial<StoredKeyRecord> | null;
  if (
    record === null ||
    typeof record !== 'object' ||
    record.v !== KEY_RECORD_VERSION ||
    typeof record.k !== 'string' ||
    typeof record.g !== 'number' ||
    !Number.isSafeInteger(record.g) ||
    record.g < 0
  ) {
    // Fail closed rather than regenerating: a malformed record might be tampering or a
    // rollback attempt, and a fresh key would silently orphan the old vault's secrets.
    throw new VaultCorruptionError();
  }
  const wrappingKey = new Uint8Array(Buffer.from(record.k, 'base64'));
  if (wrappingKey.length !== 32) throw new VaultCorruptionError();
  return { wrappingKey, generation: record.g };
}

function zeroizeKey(key: Uint8Array): void {
  key.fill(0);
}

// ---------------------------------------------------------------------------
// Keyring provider (preferred)
// ---------------------------------------------------------------------------

/** The slice of `@napi-rs/keyring`'s `Entry` this module uses (same as credential-store). */
export interface KeyringEntryLike {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

export interface KeyringModuleLike {
  Entry: new (service: string, account: string) => KeyringEntryLike;
}

/** Separate service from the credential store's `patches`: wiping credentials must not
 * silently destroy (or orphan) vault keys — each has its own explicit wipe path. */
export const VAULT_KEYRING_SERVICE = 'patches-e2ee-vault';

let keyringModulePromise: Promise<KeyringModuleLike | undefined> | undefined;

/** Dynamic + defensive, exactly like the credential store: a headless box with no
 * D-Bus secret-service must never crash the client. */
async function loadKeyring(): Promise<KeyringModuleLike | undefined> {
  keyringModulePromise ??= import('@napi-rs/keyring').then(
    (module_) => module_ as unknown as KeyringModuleLike,
    () => undefined,
  );
  return keyringModulePromise;
}

export async function isKeyringAvailable(): Promise<boolean> {
  return (await loadKeyring()) !== undefined;
}

/** Deletes the account's vault keyring entry (wrapping key + generation anchor) if a
 * keyring is reachable — used by the wipe paths, which run without an open vault. */
export async function deleteVaultKeyringEntry(
  account: VaultAccount,
  keyring?: KeyringModuleLike | typeof NO_KEYRING,
): Promise<void> {
  if (keyring === NO_KEYRING) return;
  const module = keyring ?? (await loadKeyring());
  if (module === undefined) return;
  new module.Entry(VAULT_KEYRING_SERVICE, vaultAccountKey(account)).deletePassword();
}

export class KeyringVaultKeyProvider implements VaultKeyProvider {
  readonly persistent = true;
  private readonly entry: KeyringEntryLike | undefined;
  private readonly fallbackAccount: string | undefined;

  constructor(options: { account: VaultAccount; keyring?: KeyringModuleLike }) {
    if (options.keyring !== undefined) {
      this.entry = new options.keyring.Entry(
        VAULT_KEYRING_SERVICE,
        vaultAccountKey(options.account),
      );
    } else {
      this.fallbackAccount = vaultAccountKey(options.account);
    }
  }

  private async resolveEntry(): Promise<KeyringEntryLike | undefined> {
    if (this.entry !== undefined) return this.entry;
    const keyring = await loadKeyring();
    return keyring === undefined || this.fallbackAccount === undefined
      ? undefined
      : new keyring.Entry(VAULT_KEYRING_SERVICE, this.fallbackAccount);
  }

  async loadOrCreate(): Promise<VaultKeyState> {
    const entry = await this.resolveEntry();
    if (entry === undefined) throw new Error('No OS keyring is available on this system.');
    const raw = entry.getPassword();
    if (raw === null) {
      const wrappingKey = randomBytes(32);
      entry.setPassword(encodeKeyRecord(wrappingKey, 0));
      return { wrappingKey, generation: 0 };
    }
    return decodeKeyRecord(raw);
  }

  async advanceGeneration(generation: number): Promise<void> {
    const entry = await this.resolveEntry();
    if (entry === undefined) throw new Error('No OS keyring is available on this system.');
    const raw = entry.getPassword();
    if (raw === null) return;
    const state = decodeKeyRecord(raw);
    if (generation <= state.generation) {
      zeroizeKey(state.wrappingKey);
      return;
    }
    entry.setPassword(encodeKeyRecord(state.wrappingKey, generation));
    zeroizeKey(state.wrappingKey);
  }

  async delete(): Promise<void> {
    const entry = await this.resolveEntry();
    entry?.deletePassword();
  }
}

// ---------------------------------------------------------------------------
// Guarded-file provider (explicit opt-in fallback)
// ---------------------------------------------------------------------------

function e2eeConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg !== undefined && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'patches', 'e2ee');
}

/** The guarded fallback's key file. The vault database itself lives beside it. */
export function vaultKeyFilePath(account: VaultAccount): string {
  return join(e2eeConfigDir(), 'keys', `${vaultAccountKey(account)}.key`);
}

/** The encrypted vault database file for one (node, user) account. */
export function vaultDatabaseFilePath(account: VaultAccount): string {
  return join(e2eeConfigDir(), `${vaultAccountKey(account)}.vault`);
}

export interface GuardedFileVaultKeyProviderOptions {
  readonly account: VaultAccount;
  /** Must be true — the caller gates this on the same flag as the credential store. */
  readonly allowInsecure: boolean;
  readonly path?: string;
  readonly fileOperations?: VaultFileOperations;
  readonly warn?: (message: string) => void;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * The fallback when no OS keyring exists: the wrapping key in a 0600 file behind the
 * same explicit opt-in as `FileCredentialStore`. Weaker than the keyring (the key sits
 * next to the vault it encrypts) and says so loudly on construction.
 */
export class GuardedFileVaultKeyProvider implements VaultKeyProvider {
  readonly persistent = true;
  private readonly path: string;
  private readonly operations: VaultFileOperations;
  private readonly warn: (message: string) => void;

  constructor(options: GuardedFileVaultKeyProviderOptions) {
    if (!options.allowInsecure) {
      throw new Error(
        'Storing the E2EE vault key in a file requires --allow-insecure-credential-file ' +
          'or PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1.',
      );
    }
    this.path = options.path ?? vaultKeyFilePath(options.account);
    this.operations = options.fileOperations ?? defaultVaultFileOperations();
    this.warn = options.warn ?? ((message) => process.stderr.write(`${message}\n`));
    this.warn(
      `patches: no OS keyring is available — storing the E2EE vault key in plaintext at ${this.path} ` +
        '(mode 0600). This is less secure than the system keyring.',
    );
  }

  /**
   * Removes orphaned temporaries left in the key directory by a process that died
   * between `openWriteExclusive` and `rename`. Each one holds a *plaintext wrapping
   * key*, so an interrupted rotation must not leave copies of it lying around
   * indefinitely — the in-process `catch` below only covers crashes this process
   * survives. Called on every read and write path; failures are non-fatal because a
   * key that cannot be swept must still not block opening the vault.
   */
  private async sweepTemporaries(): Promise<void> {
    const directory = dirname(this.path);
    let names: string[];
    try {
      names = await this.operations.readdir(directory);
    } catch {
      // Directory missing or unreadable: nothing to sweep, and the caller's own
      // mkdir/read handles the real error.
      return;
    }
    const prefix = `${basename(this.path)}.`;
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
      try {
        await this.operations.rm(join(directory, name), { force: true });
      } catch {
        // Best effort: a stubborn temp is swept on the next open rather than
        // failing an otherwise healthy vault.
      }
    }
  }

  private async writeRecord(state: VaultKeyState): Promise<void> {
    const directory = dirname(this.path);
    await this.operations.mkdir(directory, { recursive: true, mode: 0o700 });
    await this.sweepTemporaries();
    const temporary = `${this.path}.${String(process.pid)}.${globalThis.crypto.randomUUID()}.tmp`;
    try {
      const handle = await this.operations.openWriteExclusive(temporary, 0o600);
      await handle.writeFile(
        new TextEncoder().encode(`${encodeKeyRecord(state.wrappingKey, state.generation)}\n`),
      );
      await handle.sync();
      await handle.close();
      await this.operations.chmod(temporary, 0o600);
      await this.operations.rename(temporary, this.path);
      await this.operations.syncDirectory(directory);
    } catch (error) {
      await this.operations.rm(temporary, { force: true });
      throw error;
    }
  }

  private async readRecord(): Promise<VaultKeyState | undefined> {
    let raw: Uint8Array;
    try {
      raw = await this.operations.readFile(this.path);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
    return decodeKeyRecord(new TextDecoder().decode(raw).trim());
  }

  async loadOrCreate(): Promise<VaultKeyState> {
    const existing = await this.readRecord();
    if (existing !== undefined) {
      // The common path never writes, so this is the only place an orphan from a
      // previously crashed rotation gets cleaned up.
      await this.sweepTemporaries();
      return existing;
    }
    const state = { wrappingKey: randomBytes(32), generation: 0 };
    await this.writeRecord(state);
    return state;
  }

  async advanceGeneration(generation: number): Promise<void> {
    const state = await this.readRecord();
    if (state === undefined) return;
    if (generation <= state.generation) {
      zeroizeKey(state.wrappingKey);
      return;
    }
    await this.writeRecord({ wrappingKey: state.wrappingKey, generation });
    zeroizeKey(state.wrappingKey);
  }

  async delete(): Promise<void> {
    await this.operations.rm(this.path, { force: true });
    // A wipe that left a temp behind would leave the wrapping key recoverable.
    await this.sweepTemporaries();
  }
}

// ---------------------------------------------------------------------------
// Ephemeral provider (no persistence at all)
// ---------------------------------------------------------------------------

/** Random key per process, generation tracked in memory only: the vault works for this
 * run and nothing survives it. The default when no keyring exists and the insecure
 * fallback was not opted into — mirroring `MemoryCredentialStore`'s fail-safe. */
export class EphemeralVaultKeyProvider implements VaultKeyProvider {
  readonly persistent = false;
  private generation = 0;
  private readonly wrappingKey = randomBytes(32);

  loadOrCreate(): Promise<VaultKeyState> {
    return Promise.resolve({ wrappingKey: this.wrappingKey.slice(), generation: this.generation });
  }

  advanceGeneration(generation: number): Promise<void> {
    return Promise.resolve().then(() => {
      if (generation > this.generation) this.generation = generation;
    });
  }

  delete(): Promise<void> {
    return Promise.resolve().then(() => zeroizeKey(this.wrappingKey));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * DI sentinel meaning "behave as if no OS keyring exists", so tests (and embedders)
 * can pin the fallback tier without touching the host's real keyring. Never constructed
 * into a provider — only compared.
 */
export const NO_KEYRING = Symbol('NO_KEYRING');

export interface CreateVaultKeyProviderOptions {
  readonly account: VaultAccount;
  readonly allowInsecureFile: boolean;
  readonly keyring?: KeyringModuleLike | typeof NO_KEYRING | undefined;
  readonly keyFilePath?: string;
  readonly fileOperations?: VaultFileOperations;
  readonly warn?: (message: string) => void;
}

export async function createVaultKeyProvider(
  options: CreateVaultKeyProviderOptions,
): Promise<VaultKeyProvider> {
  const injected = options.keyring;
  if (injected !== NO_KEYRING && (injected !== undefined || (await isKeyringAvailable()))) {
    return new KeyringVaultKeyProvider({
      account: options.account,
      ...(injected === undefined ? {} : { keyring: injected }),
    });
  }
  const warn = options.warn ?? ((message) => process.stderr.write(`${message}\n`));
  if (options.allowInsecureFile) {
    return new GuardedFileVaultKeyProvider({
      account: options.account,
      allowInsecure: true,
      ...(options.keyFilePath === undefined ? {} : { path: options.keyFilePath }),
      ...(options.fileOperations === undefined ? {} : { fileOperations: options.fileOperations }),
      warn,
    });
  }
  warn(
    'patches: no OS keyring is available and --allow-insecure-credential-file was not given — ' +
      'encrypted sessions will not survive after this command exits.',
  );
  return new EphemeralVaultKeyProvider();
}
