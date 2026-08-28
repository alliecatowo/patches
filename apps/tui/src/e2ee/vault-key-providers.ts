import {
  aeadDecrypt,
  aeadEncrypt,
  HEADER_NONCE_BYTES,
  KEY_BYTES,
  randomBytes,
} from '@patches/crypto';
import { hashRaw, type Algorithm } from '@node-rs/argon2';
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
 * Removes orphaned `${path}.{pid}.{uuid}.tmp` temporaries left by a process that died
 * between `openWriteExclusive` and `rename` — shared by every tier that commits a key
 * record through the same durable-write pattern. Each temporary may hold key material
 * (plaintext for the guarded tier, an AEAD-wrapped record for the passphrase tier), so
 * an interrupted rotation must not leave copies lying around indefinitely. Best-effort:
 * a key that cannot be swept must still not block opening the vault.
 */
async function sweepKeyTemporaries(operations: VaultFileOperations, path: string): Promise<void> {
  const directory = dirname(path);
  let names: string[];
  try {
    names = await operations.readdir(directory);
  } catch {
    return;
  }
  const prefix = `${basename(path)}.`;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
    try {
      await operations.rm(join(directory, name), { force: true });
    } catch {
      // Swept on the next open instead of failing an otherwise healthy vault.
    }
  }
}

/** Atomically (write-temp, fsync, rename, fsync-directory) commits `bytes` to `path`,
 * sweeping crash-orphaned temporaries first — shared by every key-record tier. */
async function writeKeyRecordFile(
  operations: VaultFileOperations,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const directory = dirname(path);
  await operations.mkdir(directory, { recursive: true, mode: 0o700 });
  await sweepKeyTemporaries(operations, path);
  const temporary = `${path}.${String(process.pid)}.${globalThis.crypto.randomUUID()}.tmp`;
  try {
    const handle = await operations.openWriteExclusive(temporary, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    await operations.chmod(temporary, 0o600);
    await operations.rename(temporary, path);
    await operations.syncDirectory(directory);
  } catch (error) {
    await operations.rm(temporary, { force: true });
    throw error;
  }
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

  private async writeRecord(state: VaultKeyState): Promise<void> {
    await writeKeyRecordFile(
      this.operations,
      this.path,
      new TextEncoder().encode(`${encodeKeyRecord(state.wrappingKey, state.generation)}\n`),
    );
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
      await sweepKeyTemporaries(this.operations, this.path);
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
    await sweepKeyTemporaries(this.operations, this.path);
  }
}

// ---------------------------------------------------------------------------
// Passphrase-KDF provider (explicit opt-in fallback, issue #212)
// ---------------------------------------------------------------------------

/** The passphrase tier's wrapped-key file. Same directory as the guarded file tier's
 * key file, different extension — the two tiers never collide on one account. */
export function vaultPassphraseFilePath(account: VaultAccount): string {
  return join(e2eeConfigDir(), 'keys', `${vaultAccountKey(account)}.pkey`);
}

const PASSPHRASE_RECORD_VERSION = 1;
const PASSPHRASE_SALT_BYTES = 16;
// OWASP Password Storage Cheat Sheet baseline for Argon2id (m=19456 KiB, t=2, p=1),
// matching apps/server's password hasher — docs/research/infra-and-security-libs.md §5.
const ARGON2ID = 2 as Algorithm; // Algorithm.Argon2id's value; const enum can't be read under isolatedModules
const PASSPHRASE_ARGON2_MEMORY_COST = 19_456;
const PASSPHRASE_ARGON2_TIME_COST = 2;
const PASSPHRASE_ARGON2_PARALLELISM = 1;

interface StoredPassphraseRecord {
  readonly v: 1;
  /** base64, `PASSPHRASE_SALT_BYTES` — Argon2id salt. Not secret; only needs to be unique. */
  readonly salt: string;
  /** base64, `HEADER_NONCE_BYTES` — XChaCha20-Poly1305 nonce for the wrapped record. */
  readonly nonce: string;
  /** base64 AEAD ciphertext of `encodeKeyRecord(wrappingKey, generation)`. The wrapping
   * key never appears in this file except behind this seal. */
  readonly wrapped: string;
}

async function derivePassphraseKek(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const raw = await hashRaw(passphrase, {
    algorithm: ARGON2ID,
    memoryCost: PASSPHRASE_ARGON2_MEMORY_COST,
    timeCost: PASSPHRASE_ARGON2_TIME_COST,
    parallelism: PASSPHRASE_ARGON2_PARALLELISM,
    outputLen: KEY_BYTES,
    salt,
  });
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

function encodeStoredPassphraseRecord(record: StoredPassphraseRecord): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(record)}\n`);
}

function decodeStoredPassphraseRecord(raw: string): StoredPassphraseRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new VaultCorruptionError();
  }
  const record = parsed as Partial<StoredPassphraseRecord> | null;
  if (
    record === null ||
    typeof record !== 'object' ||
    record.v !== PASSPHRASE_RECORD_VERSION ||
    typeof record.salt !== 'string' ||
    typeof record.nonce !== 'string' ||
    typeof record.wrapped !== 'string'
  ) {
    throw new VaultCorruptionError();
  }
  return { v: 1, salt: record.salt, nonce: record.nonce, wrapped: record.wrapped };
}

export interface PassphraseVaultKeyProviderOptions {
  readonly account: VaultAccount;
  /** Must be true — gated the same explicit way as `GuardedFileVaultKeyProvider`. */
  readonly allowInsecure: boolean;
  /**
   * Obtains the passphrase from the user — the UI seam a real prompt (terminal or Ink)
   * binds to. Called on every `loadOrCreate()`; this provider never retains the
   * passphrase itself beyond the synchronous derivation call, and never writes it or
   * the derived key to disk in the clear (only an AEAD-wrapped key record is stored).
   */
  readonly getPassphrase: () => Promise<string>;
  readonly path?: string;
  readonly fileOperations?: VaultFileOperations;
  readonly warn?: (message: string) => void;
}

/**
 * The passphrase-KDF fallback tier (issue #212): when no OS keyring exists, this
 * derives an Argon2id key-encryption-key (KEK) from a user-supplied passphrase and uses
 * it to AEAD-wrap a randomly generated wrapping key, storing only the wrapped record —
 * never the passphrase, never the raw key. Changing the passphrase
 * (`changePassphrase`) re-wraps the same wrapping key under a new KEK/salt; it never
 * needs to touch the vault contents the wrapping key protects.
 *
 * Weaker than the OS keyring (an attacker with filesystem access and the passphrase can
 * recover the key; a weak passphrase is brute-forceable despite Argon2id), but stronger
 * than `GuardedFileVaultKeyProvider`: the file on disk alone is useless without the
 * passphrase, which this provider never persists anywhere.
 */
export class PassphraseVaultKeyProvider implements VaultKeyProvider {
  readonly persistent = true;
  private readonly path: string;
  private readonly operations: VaultFileOperations;
  private readonly getPassphrase: () => Promise<string>;
  private readonly warn: (message: string) => void;
  /** Cached from the last successful `loadOrCreate`/`advanceGeneration`, so
   * `changePassphrase` can re-wrap without re-deriving from the old passphrase. */
  private cached: VaultKeyState | undefined;

  constructor(options: PassphraseVaultKeyProviderOptions) {
    if (!options.allowInsecure) {
      throw new Error(
        'Deriving the E2EE vault key from a passphrase requires --allow-insecure-credential-file ' +
          'or PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1.',
      );
    }
    this.path = options.path ?? vaultPassphraseFilePath(options.account);
    this.operations = options.fileOperations ?? defaultVaultFileOperations();
    this.getPassphrase = options.getPassphrase;
    this.warn = options.warn ?? ((message) => process.stderr.write(`${message}\n`));
    this.warn(
      `patches: no OS keyring is available — deriving the E2EE vault key from a passphrase, ` +
        `wrapped record stored at ${this.path}. Losing the passphrase loses this device's ` +
        'encrypted history; it is never recoverable from the file alone.',
    );
  }

  private async readRecord(): Promise<StoredPassphraseRecord | undefined> {
    let raw: Uint8Array;
    try {
      raw = await this.operations.readFile(this.path);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
    return decodeStoredPassphraseRecord(new TextDecoder().decode(raw).trim());
  }

  private async writeState(state: VaultKeyState, passphrase: string): Promise<void> {
    const salt = randomBytes(PASSPHRASE_SALT_BYTES);
    const nonce = randomBytes(HEADER_NONCE_BYTES);
    const kek = await derivePassphraseKek(passphrase, salt);
    try {
      const wrapped = aeadEncrypt(
        kek,
        nonce,
        new TextEncoder().encode(encodeKeyRecord(state.wrappingKey, state.generation)),
        new TextEncoder().encode(this.path),
      );
      await writeKeyRecordFile(
        this.operations,
        this.path,
        encodeStoredPassphraseRecord({
          v: PASSPHRASE_RECORD_VERSION,
          salt: Buffer.from(salt).toString('base64'),
          nonce: Buffer.from(nonce).toString('base64'),
          wrapped: Buffer.from(wrapped).toString('base64'),
        }),
      );
    } finally {
      zeroizeKey(kek);
    }
  }

  private async unwrap(record: StoredPassphraseRecord, passphrase: string): Promise<VaultKeyState> {
    const salt = new Uint8Array(Buffer.from(record.salt, 'base64'));
    const nonce = new Uint8Array(Buffer.from(record.nonce, 'base64'));
    const wrapped = new Uint8Array(Buffer.from(record.wrapped, 'base64'));
    const kek = await derivePassphraseKek(passphrase, salt);
    try {
      const plaintext = aeadDecrypt(kek, nonce, wrapped, new TextEncoder().encode(this.path));
      return decodeKeyRecord(new TextDecoder().decode(plaintext));
    } catch {
      // A wrong passphrase and a corrupted/tampered record are indistinguishable from
      // AEAD failure alone; both fail closed the same way (never regenerate a key).
      throw new VaultCorruptionError();
    } finally {
      zeroizeKey(kek);
    }
  }

  async loadOrCreate(): Promise<VaultKeyState> {
    const existing = await this.readRecord();
    if (existing !== undefined) {
      await sweepKeyTemporaries(this.operations, this.path);
      const passphrase = await this.getPassphrase();
      const state = await this.unwrap(existing, passphrase);
      this.cached = state;
      return { wrappingKey: state.wrappingKey.slice(), generation: state.generation };
    }
    const passphrase = await this.getPassphrase();
    const state = { wrappingKey: randomBytes(32), generation: 0 };
    await this.writeState(state, passphrase);
    this.cached = state;
    return { wrappingKey: state.wrappingKey.slice(), generation: state.generation };
  }

  async advanceGeneration(generation: number): Promise<void> {
    const existing = await this.readRecord();
    if (existing === undefined) return;
    const passphrase = await this.getPassphrase();
    const state = await this.unwrap(existing, passphrase);
    if (generation <= state.generation) {
      zeroizeKey(state.wrappingKey);
      return;
    }
    const next = { wrappingKey: state.wrappingKey, generation };
    await this.writeState(next, passphrase);
    // `next` reuses `state.wrappingKey` and becomes the new cache — it must survive for
    // a later `changePassphrase`/`delete`, unlike the guarded-file tier's fire-and-forget
    // write, so it is deliberately not zeroized here.
    this.cached = next;
  }

  /**
   * Re-wraps the existing wrapping key under a newly derived KEK for `newPassphrase`.
   * Requires `loadOrCreate` (or `advanceGeneration`) to have run first in this process —
   * the rotation path never re-derives from the *old* passphrase a second time, since
   * this provider never retains it. The vault's contents are untouched: only the small
   * wrapped-key record is rewritten.
   */
  async changePassphrase(newPassphrase: string): Promise<void> {
    if (this.cached === undefined) {
      throw new Error('changePassphrase requires an already-loaded vault key.');
    }
    await this.writeState(this.cached, newPassphrase);
  }

  async delete(): Promise<void> {
    zeroizeKey(this.cached?.wrappingKey ?? new Uint8Array(0));
    this.cached = undefined;
    await this.operations.rm(this.path, { force: true });
    await sweepKeyTemporaries(this.operations, this.path);
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
  /**
   * Opts into the passphrase-KDF fallback tier (issue #212) instead of the guarded
   * plaintext-file tier when no OS keyring is available. Presence of this option is
   * itself the explicit opt-in — same rule as `allowInsecureFile`, a separate and
   * stronger persistent fallback, so when both are supplied this one wins.
   */
  readonly passphrase?: {
    readonly getPassphrase: () => Promise<string>;
    readonly path?: string;
  };
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
  if (options.passphrase !== undefined) {
    return new PassphraseVaultKeyProvider({
      account: options.account,
      allowInsecure: true,
      getPassphrase: options.passphrase.getPassphrase,
      ...(options.passphrase.path === undefined ? {} : { path: options.passphrase.path }),
      ...(options.fileOperations === undefined ? {} : { fileOperations: options.fileOperations }),
      warn,
    });
  }
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
    'patches: no OS keyring is available and neither --allow-insecure-credential-file nor a ' +
      'passphrase was given — encrypted sessions will not survive after this command exits.',
  );
  return new EphemeralVaultKeyProvider();
}
