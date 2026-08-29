import {
  ByteReader,
  ByteWriter,
  decodeRatchetState,
  disposeRatchetState,
  encodeRatchetState,
  KEY_BYTES,
  SIGNATURE_BYTES,
  type DoubleRatchetState,
} from '@patches/crypto';

import type { VaultAccount } from './vault-key-providers.js';
import {
  createVaultKeyProvider,
  deleteVaultKeyringEntry,
  vaultDatabaseFilePath,
  vaultKeyFilePath,
  vaultPassphraseFilePath,
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
  /**
   * Opaque non-ratchet record access (B-107's enrollment record). The bytes are stored
   * exactly as handed over, under a key that must never collide with a session id.
   */
  getOpaqueRecord(key: string): Promise<Uint8Array | undefined>;
  putOpaqueRecord(key: string, value: Uint8Array): Promise<void>;
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

  getOpaqueRecord(key: string): Promise<Uint8Array | undefined> {
    return this.store.getRecord(key);
  }

  putOpaqueRecord(key: string, value: Uint8Array): Promise<void> {
    return this.store.updateRecord(key, value);
  }

  wipe(): Promise<void> {
    return this.store.wipe();
  }

  close(): void {
    this.store.close();
  }
}

// ---------------------------------------------------------------------------
// Peer identity pin store (security findings C1/C2, ADR 0033 §2/§3): TOFU-pins a
// peer's messaging root and last-observed roster sequence so the node can never serve
// a genuinely root-signed but stale/rolled-back roster (a revoked device would look
// active again), nor substitute a brand-new self-signed root without a countersigned
// rotation proof. Stored under one reserved opaque record, mirroring the web client's
// vault (ADR 0034 Stage 1: the two copies must stay in lockstep) and the pattern
// `enrollment.ts` already uses for `ENROLLMENT_RECORD_KEY` (a leading NUL cannot occur
// in a real session id).
// ---------------------------------------------------------------------------

/** SHA-256 digest length (`identityTranscriptDigest`'s output) — numerically equal to
 * `KEY_BYTES` but named separately since the two are unrelated facts. */
const DIGEST_BYTES = KEY_BYTES;
const PEER_PIN_RECORD_VERSION = 1;

/** One peer's pinned identity. `rootBytes`/`selfSignature` (not just the public key)
 * are stored because proving a later rotation requires re-deriving a real
 * `VerifiedMessagingRoot` for the previously pinned root via `verifyMessagingRoot` —
 * `@patches/crypto`'s branded `Verified*` values cannot be constructed from a bare
 * public key (ADR 0033 §3: no caller-supplied decoding). */
export interface PeerIdentityPin {
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
  readonly rosterSequence: number;
  readonly rosterDigest: Uint8Array;
}

/** The reserved vault record key peer pins are stored under. */
export const PEER_PIN_RECORD_KEY = '\0patches-e2ee-peer-pins';

/** The slice of the vault this store needs — satisfied structurally by
 * `RatchetSessionVault` (and by a minimal test double). */
export interface PeerPinVaultAccess {
  getOpaqueRecord(key: string): Promise<Uint8Array | undefined>;
  putOpaqueRecord(key: string, value: Uint8Array): Promise<void>;
}

function encodePeerPins(pins: ReadonlyMap<string, PeerIdentityPin>): Uint8Array {
  const writer = new ByteWriter().u8(PEER_PIN_RECORD_VERSION).u32(pins.size);
  for (const [actorId, pin] of pins) {
    writer
      .string(actorId)
      .bytes(pin.rootBytes)
      .fixed(pin.selfSignature, SIGNATURE_BYTES)
      .u64(pin.rosterSequence)
      .fixed(pin.rosterDigest, DIGEST_BYTES);
  }
  return writer.finish();
}

function decodePeerPins(bytes: Uint8Array): Map<string, PeerIdentityPin> {
  const reader = new ByteReader(bytes);
  if (reader.u8() !== PEER_PIN_RECORD_VERSION) {
    throw new VaultCorruptionError();
  }
  const count = reader.u32();
  const pins = new Map<string, PeerIdentityPin>();
  for (let index = 0; index < count; index += 1) {
    const actorId = reader.string();
    const rootBytes = reader.bytes();
    const selfSignature = reader.fixed(SIGNATURE_BYTES);
    const rosterSequence = reader.u64();
    const rosterDigest = reader.fixed(DIGEST_BYTES);
    pins.set(actorId, { rootBytes, selfSignature, rosterSequence, rosterDigest });
  }
  reader.end();
  return pins;
}

async function loadAllPeerPins(vault: PeerPinVaultAccess): Promise<Map<string, PeerIdentityPin>> {
  const bytes = await vault.getOpaqueRecord(PEER_PIN_RECORD_KEY);
  if (bytes === undefined) return new Map();
  try {
    return decodePeerPins(bytes);
  } catch {
    // A corrupted pin record must never be silently treated as "no pins" — that would
    // discard every rollback/rotation check it exists to enforce. Fail closed.
    throw new VaultCorruptionError();
  }
}

/** Reads one peer's pinned identity, or `undefined` on first contact (TOFU). */
export async function loadPeerIdentityPin(
  vault: PeerPinVaultAccess,
  actorId: string,
): Promise<PeerIdentityPin | undefined> {
  const pins = await loadAllPeerPins(vault);
  return pins.get(actorId);
}

/** Pins (or re-pins, on a proven rotation) one peer's identity. */
export async function savePeerIdentityPin(
  vault: PeerPinVaultAccess,
  actorId: string,
  pin: PeerIdentityPin,
): Promise<void> {
  const pins = await loadAllPeerPins(vault);
  pins.set(actorId, pin);
  await vault.putOpaqueRecord(PEER_PIN_RECORD_KEY, encodePeerPins(pins));
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
  /** Opts into the passphrase-KDF fallback tier (issue #212) instead of the guarded
   * plaintext-file tier when no OS keyring is available. */
  readonly passphrase?: {
    readonly getPassphrase: () => Promise<string>;
    readonly path?: string;
  };
}

/**
 * OS keyring → real encrypted file vault; explicitly opted-in passphrase-KDF tier or
 * guarded key file → real file vault (loud warning either way); otherwise an in-memory
 * vault that persists nothing, so the default on a keyring-less box never silently
 * stores secrets.
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
    ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
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
  readonly passphraseFilePath?: string;
  readonly fileOperations?: VaultFileOperations;
  readonly keyring?: KeyringModuleLike | typeof NO_KEYRING | undefined;
}

/**
 * Destroys one account's local E2EE state without needing the wrapping key: the vault
 * database, any temp/lock files, the guarded key file if present, the passphrase-tier
 * wrapped-key file if present, the keyring entry (wrapping key + generation anchor), and
 * both file tiers' own torn temp writes beside their key files (audit P2-1:
 * `GuardedFileVaultKeyProvider` commits its key record through a
 * `${path}.{pid}.{uuid}.tmp` sibling, so a wipe that removed only the vault-side temps
 * could still leave wrapping-key material on disk — the same applies to
 * `PassphraseVaultKeyProvider`'s wrapped record). Idempotent — wiping an absent state is
 * a no-op, and logout/device-revocation flows should call this on every path.
 */
export async function wipeE2eeState(options: WipeE2eeStateOptions): Promise<void> {
  const operations = options.fileOperations ?? defaultVaultFileOperations();
  const vaultPath = options.vaultPath ?? vaultDatabaseFilePath(options.account);
  const keyFilePath = options.keyFilePath ?? vaultKeyFilePath(options.account);
  const passphraseFilePath = options.passphraseFilePath ?? vaultPassphraseFilePath(options.account);
  await sweepTempSiblings(operations, vaultPath);
  await operations.rm(vaultPath, { force: true });
  await sweepTempSiblings(operations, keyFilePath);
  await operations.rm(keyFilePath, { force: true });
  await sweepTempSiblings(operations, passphraseFilePath);
  await operations.rm(passphraseFilePath, { force: true });
  await deleteVaultKeyringEntry(options.account, options.keyring);
}

/** Removes every `.{pid}.{uuid}.tmp` / `.lock` sibling of `path` (best-effort). */
async function sweepTempSiblings(operations: VaultFileOperations, path: string): Promise<void> {
  const directory = dirname(path);
  const base = basename(path);
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
}
