import {
  decodeRatchetState,
  disposeRatchetState,
  encodeRatchetState,
  type DoubleRatchetState,
} from '@patches/crypto';

import type { VaultAccount } from './vault-key-providers.js';
import {
  createVaultKeyProvider,
  deleteVaultKeyringEntry,
  vaultDatabaseFilePath,
  vaultKeyFilePath,
  type KeyringModuleLike,
} from './vault-key-providers.js';
import type { NO_KEYRING } from './vault-key-providers.js';
import type { VaultFileOperations } from './vault-file-operations.js';
import { defaultVaultFileOperations } from './vault-file-operations.js';
import { basename, dirname, join } from 'node:path';
import type { RatchetVaultStore, VaultOpenInfo } from './vault-store.js';
import { FileVaultStore, MemoryVaultStore } from './vault-store.js';
import { VaultCorruptionError } from './vault-errors.js';

/**
 * Typed facade over the encrypted vault store (P13-006): callers hand around
 * `DoubleRatchetState` values, and only the opaque, vault-bound byte form from
 * `encodeRatchetState` ever crosses the store boundary (ADR 0020 §4).
 *
 * **Send path contract.** `ratchetEncrypt` produces the next state and the outgoing
 * ciphertext; pass the next state to `stageSend` — which commits it durably BEFORE the
 * bytes may go out — then send, then `confirmSend` once the send resolves. A crash at
 * any point after `stageSend` resolves can never cause key/nonce reuse: recovery
 * adopts the staged successor.
 *
 * States passed to `stageSend`/`confirmSend`/`applyUpdate` are considered consumed:
 * the facade zeroizes them (best-effort, ADR 0020 §4) once the commit succeeds.
 */
export interface RatchetSessionVault {
  open(): Promise<VaultOpenInfo>;
  listSessions(): Promise<string[]>;
  getSession(sessionId: string): Promise<DoubleRatchetState | undefined>;
  /** Durable pre-send advance of one session's ratchet. */
  stageSend(sessionId: string, next: DoubleRatchetState): Promise<void>;
  /** Promotes the staged send (optionally through a successor derived from it). */
  confirmSend(sessionId: string, successor?: DoubleRatchetState): Promise<void>;
  /** Session creation or receive-side advance; forbidden while a send is staged. */
  applyUpdate(sessionId: string, next: DoubleRatchetState): Promise<void>;
  /** Drops one session's state — the local half of the resync/recovery path. */
  deleteSession(sessionId: string): Promise<void>;
  wipe(): Promise<void>;
  close(): void;
}

export class TypedRatchetVault implements RatchetSessionVault {
  constructor(private readonly store: RatchetVaultStore) {}

  open(): Promise<VaultOpenInfo> {
    return this.store.open();
  }

  listSessions(): Promise<string[]> {
    return this.store.listSessions();
  }

  async getSession(sessionId: string): Promise<DoubleRatchetState | undefined> {
    const record = await this.store.getRecord(sessionId);
    if (record === undefined) return undefined;
    try {
      return decodeRatchetState(record);
    } catch {
      // Stored bytes only fail decode if the vault itself is corrupt — fail closed.
      throw new VaultCorruptionError();
    }
  }

  async stageSend(sessionId: string, next: DoubleRatchetState): Promise<void> {
    const encoded = encodeRatchetState(next);
    await this.store.stageRecord(sessionId, encoded);
    // Consumed only on success: a failed commit leaves the caller's state valid.
    disposeRatchetState(next);
  }

  async confirmSend(sessionId: string, successor?: DoubleRatchetState): Promise<void> {
    const encoded = successor === undefined ? undefined : encodeRatchetState(successor);
    await this.store.confirmRecord(sessionId, encoded);
    if (successor !== undefined) disposeRatchetState(successor);
  }

  async applyUpdate(sessionId: string, next: DoubleRatchetState): Promise<void> {
    const encoded = encodeRatchetState(next);
    await this.store.updateRecord(sessionId, encoded);
    disposeRatchetState(next);
  }

  deleteSession(sessionId: string): Promise<void> {
    return this.store.deleteRecord(sessionId);
  }

  wipe(): Promise<void> {
    return this.store.wipe();
  }

  close(): void {
    this.store.close();
  }
}

// ---------------------------------------------------------------------------
// Factory — same tiering as the credential store (spec §37, ADR 0020 §4)
// ---------------------------------------------------------------------------

export interface CreateRatchetSessionVaultOptions {
  readonly account: VaultAccount;
  readonly allowInsecureKeyFile: boolean;
  readonly vaultPath?: string;
  readonly fileOperations?: VaultFileOperations;
  readonly keyring?: KeyringModuleLike | typeof NO_KEYRING | undefined;
  readonly keyFilePath?: string;
  readonly warn?: (message: string) => void;
}

/**
 * OS keyring → real encrypted file vault; explicitly opted-in guarded key file → real
 * file vault with a loud warning; otherwise an in-memory vault that persists nothing,
 * so the default on a keyring-less box never silently stores secrets.
 */
export async function createRatchetSessionVault(
  options: CreateRatchetSessionVaultOptions,
): Promise<RatchetSessionVault> {
  const keyProvider = await createVaultKeyProvider({
    account: options.account,
    allowInsecureFile: options.allowInsecureKeyFile,
    ...(options.keyring === undefined ? {} : { keyring: options.keyring }),
    ...(options.keyFilePath === undefined ? {} : { keyFilePath: options.keyFilePath }),
    ...(options.fileOperations === undefined ? {} : { fileOperations: options.fileOperations }),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  if (!keyProvider.persistent) {
    return new TypedRatchetVault(new MemoryVaultStore());
  }
  const operations = options.fileOperations ?? defaultVaultFileOperations();
  return new TypedRatchetVault(
    new FileVaultStore({
      provider: keyProvider,
      account: options.account,
      path: options.vaultPath ?? vaultDatabaseFilePath(options.account),
      fileOperations: operations,
    }),
  );
}

// ---------------------------------------------------------------------------
// Explicit logout / device-wipe seam (P13-010 wires this into `patches logout`
// and the device-revocation flow)
// ---------------------------------------------------------------------------

export interface WipeE2eeStateOptions {
  readonly account: VaultAccount;
  readonly vaultPath?: string;
  readonly keyFilePath?: string;
  readonly fileOperations?: VaultFileOperations;
  readonly keyring?: KeyringModuleLike | typeof NO_KEYRING | undefined;
}

/**
 * Destroys one account's local E2EE state without needing the wrapping key: the vault
 * database, any temp/lock files, the guarded key file if present, and the keyring
 * entry (wrapping key + generation anchor). Idempotent — wiping an absent state is a
 * no-op, and logout/device-revocation flows should call this on every path.
 */
export async function wipeE2eeState(options: WipeE2eeStateOptions): Promise<void> {
  const operations = options.fileOperations ?? defaultVaultFileOperations();
  const vaultPath = options.vaultPath ?? vaultDatabaseFilePath(options.account);
  const directory = dirname(vaultPath);
  const base = basename(vaultPath);
  try {
    const names = await operations.readdir(directory);
    for (const name of names) {
      if (!name.startsWith(`${base}.`) || (!name.endsWith('.tmp') && !name.endsWith('.lock'))) {
        continue;
      }
      await operations.rm(join(directory, name), { force: true });
    }
  } catch {
    // No directory to sweep (never created / already removed) — the goal state.
  }
  await operations.rm(vaultPath, { force: true });
  await operations.rm(options.keyFilePath ?? vaultKeyFilePath(options.account), { force: true });
  await deleteVaultKeyringEntry(options.account, options.keyring);
}
