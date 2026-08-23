import { randomBytes, zeroize } from '@patches/crypto';
import { basename, dirname, join } from 'node:path';

import type { VaultFileOperations } from './vault-file-operations.js';
import { defaultVaultFileOperations } from './vault-file-operations.js';
import {
  decodeVaultDocument,
  deriveVaultDataKey,
  encodeVaultDocument,
  openSealedVaultFile,
  parseSealedVaultFile,
  sealVaultFile,
  type VaultDocument,
  type VaultSessionRecord,
} from './vault-format.js';
import { VaultLockError, VaultRollbackError, VaultTransactionError } from './vault-errors.js';
import type { VaultAccount, VaultKeyProvider } from './vault-key-providers.js';
import { vaultAccountKey, vaultDatabaseFilePath } from './vault-key-providers.js';

/**
 * The encrypted local state store for the TUI's E2EE ratchets/sessions (P13-006,
 * ADR 0020 §4). All logic lives here as plain TypeScript; UI wiring is a thin seam.
 *
 * **Send contract — commit before bytes reach the network.** `stageRecord` durably
 * advances a session's state (write-temp + fsync + rename + dir fsync) and only then
 * returns; the caller may send afterwards and calls `confirmRecord` once the send is
 * resolved. A crash anywhere between stage and confirm leaves the staged successor on
 * disk, and the next `open()` *adopts* it: the reloaded state is always at least as
 * advanced as anything that was ever sent, so a message key/nonce can never be reused.
 * Skipping a counter (crash between stage and send) is harmless — the peer's skipped-key
 * handling covers gaps.
 *
 * **Rollback detection.** Every commit bumps a monotonic generation, and the key
 * provider anchors the highest generation ever committed next to the wrapping key
 * (keyring or guarded file) — a place a restored vault-file backup cannot roll back.
 * `open()` refuses a vault whose generation is below the anchor instead of silently
 * downgrading into key reuse.
 *
 * Callers must serialize commits (await one mutation before starting the next): each
 * commit is a read-modify-write over the whole document, which is exactly what the
 * sequential send/receive paths in the ADR do anyway.
 */

/** Result of opening a vault: what recovery did. */
export interface VaultOpenInfo {
  readonly generation: number;
  /** Sessions whose pending staged send was adopted as live after a crash/retry. */
  readonly adoptedStagedSessions: readonly string[];
  /** Torn temp writes removed during recovery. */
  readonly discardedTempFiles: readonly string[];
}

export interface RatchetVaultStore {
  open(): Promise<VaultOpenInfo>;
  listSessions(): Promise<string[]>;
  /** The committed live record (a defensive copy); undefined for unknown sessions. */
  getRecord(sessionId: string): Promise<Uint8Array | undefined>;
  /**
   * Durable pre-send advance. Throws `VaultTransactionError` if a staged send is
   * already pending for this session, or if the session does not exist (create it
   * with `updateRecord` first).
   */
  stageRecord(sessionId: string, next: Uint8Array): Promise<void>;
  /**
   * Promotes the staged record to live, optionally replacing it with a successor
   * state derived from the staged one (e.g. a receive that happened in between).
   */
  confirmRecord(sessionId: string, successor?: Uint8Array): Promise<void>;
  /** Plain durable update (session creation, receive-side advance). Throws if a
   * staged send is pending — resolve it with `confirmRecord` first. */
  updateRecord(sessionId: string, next: Uint8Array): Promise<void>;
  /** Removes a session (resync/recovery path). */
  deleteRecord(sessionId: string): Promise<void>;
  /** Explicit local wipe: destroys the key, the anchor, and every on-disk artifact. */
  wipe(): Promise<void>;
  /** Releases the lock and zeroizes in-memory secrets. Idempotent. */
  close(): void;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/** Best-effort hygiene: zeroize every buffer of `previous` that `next` did not keep
 * by reference, so replaced ratchet material does not linger in memory. */
function zeroizeEvicted(
  previous: ReadonlyMap<string, VaultSessionRecord>,
  next: ReadonlyMap<string, VaultSessionRecord>,
): void {
  const carried = new Set<Uint8Array>();
  for (const record of next.values()) {
    carried.add(record.live);
    if (record.staged !== undefined) carried.add(record.staged);
  }
  for (const record of previous.values()) {
    if (!carried.has(record.live)) zeroize(record.live);
    if (record.staged !== undefined && !carried.has(record.staged)) zeroize(record.staged);
  }
}

function zeroizeAll(sessions: ReadonlyMap<string, VaultSessionRecord>): void {
  for (const record of sessions.values()) {
    zeroize(record.live);
    if (record.staged !== undefined) zeroize(record.staged);
  }
}

/** Enforces the staged-send transaction rules shared by both stores. Returns the next
 * sessions map, or throws `VaultTransactionError` on misuse. */
function withRecord(
  sessions: ReadonlyMap<string, VaultSessionRecord>,
  sessionId: string,
  build: (record: VaultSessionRecord) => VaultSessionRecord,
): Map<string, VaultSessionRecord> {
  const record = sessions.get(sessionId);
  if (record === undefined) {
    throw new VaultTransactionError(`No vault session exists for this id.`);
  }
  const next = new Map(sessions);
  next.set(sessionId, build(record));
  return next;
}

// ---------------------------------------------------------------------------
// MemoryVaultStore — tests and the "nothing persisted" fallback tier
// ---------------------------------------------------------------------------

export class MemoryVaultStore implements RatchetVaultStore {
  private sessions = new Map<string, VaultSessionRecord>();
  private generation = 0;
  private opened = false;
  private closed = false;

  private assertUsable(): void {
    if (this.closed) throw new VaultTransactionError('The vault is closed.');
    if (!this.opened) throw new VaultTransactionError('The vault is not open yet.');
  }

  open(): Promise<VaultOpenInfo> {
    return Promise.resolve().then(() => {
      if (this.closed) throw new VaultTransactionError('The vault is closed.');
      if (this.opened) throw new VaultTransactionError('The vault is already open.');
      this.opened = true;
      return {
        generation: this.generation,
        adoptedStagedSessions: [],
        discardedTempFiles: [],
      };
    });
  }

  private commit(next: Map<string, VaultSessionRecord>): Promise<void> {
    return Promise.resolve().then(() => {
      zeroizeEvicted(this.sessions, next);
      this.sessions = next;
      this.generation += 1;
    });
  }

  listSessions(): Promise<string[]> {
    return Promise.resolve().then(() => {
      this.assertUsable();
      return [...this.sessions.keys()];
    });
  }

  getRecord(sessionId: string): Promise<Uint8Array | undefined> {
    return Promise.resolve().then(() => {
      this.assertUsable();
      return this.sessions.get(sessionId)?.live.slice();
    });
  }

  async stageRecord(sessionId: string, next: Uint8Array): Promise<void> {
    this.assertUsable();
    await this.commit(
      withRecord(this.sessions, sessionId, (record) => {
        if (record.staged !== undefined) {
          throw new VaultTransactionError('A staged send is already pending for this session.');
        }
        return { live: record.live, staged: next.slice() };
      }),
    );
  }

  async confirmRecord(sessionId: string, successor?: Uint8Array): Promise<void> {
    this.assertUsable();
    await this.commit(
      withRecord(this.sessions, sessionId, (record) => {
        if (record.staged === undefined) {
          throw new VaultTransactionError('No staged send is pending for this session.');
        }
        return { live: (successor ?? record.staged).slice(), staged: undefined };
      }),
    );
  }

  async updateRecord(sessionId: string, next: Uint8Array): Promise<void> {
    this.assertUsable();
    if (!this.sessions.has(sessionId)) {
      const created = new Map(this.sessions);
      created.set(sessionId, { live: next.slice(), staged: undefined });
      await this.commit(created);
      return;
    }
    await this.commit(
      withRecord(this.sessions, sessionId, (record) => {
        if (record.staged !== undefined) {
          throw new VaultTransactionError('Confirm the pending staged send before updating.');
        }
        return { live: next.slice(), staged: undefined };
      }),
    );
  }

  async deleteRecord(sessionId: string): Promise<void> {
    this.assertUsable();
    const next = new Map(this.sessions);
    if (!next.delete(sessionId)) return;
    await this.commit(next);
  }

  wipe(): Promise<void> {
    return Promise.resolve().then(() => {
      if (this.closed) return;
      zeroizeAll(this.sessions);
      this.sessions = new Map();
      this.generation = 0;
    });
  }

  close(): void {
    if (this.closed) return;
    zeroizeAll(this.sessions);
    this.closed = true;
  }
}

// ---------------------------------------------------------------------------
// FileVaultStore — the real encrypted, atomically committed database
// ---------------------------------------------------------------------------

export interface FileVaultStoreOptions {
  readonly provider: VaultKeyProvider;
  readonly account: VaultAccount;
  readonly path?: string;
  readonly fileOperations?: VaultFileOperations;
}

interface OpenState {
  readonly dataKey: Uint8Array;
  sessions: Map<string, VaultSessionRecord>;
  generation: number;
}

export class FileVaultStore implements RatchetVaultStore {
  private readonly provider: VaultKeyProvider;
  private readonly accountKey: string;
  private readonly path: string;
  private readonly operations: VaultFileOperations;
  private state: OpenState | undefined;
  private locked = false;
  private closed = false;
  private wiped = false;

  constructor(options: FileVaultStoreOptions) {
    this.provider = options.provider;
    this.accountKey = vaultAccountKey(options.account);
    this.path = options.path ?? vaultDatabaseFilePath(options.account);
    this.operations = options.fileOperations ?? defaultVaultFileOperations();
  }

  private get lockPath(): string {
    return `${this.path}.lock`;
  }

  private tempPath(): string {
    return `${this.path}.${String(process.pid)}.${globalThis.crypto.randomUUID()}.tmp`;
  }

  private assertUsable(): OpenState {
    if (this.wiped) {
      throw new VaultTransactionError('The vault was wiped; reopen to create a fresh one.');
    }
    if (this.closed || this.state === undefined) {
      throw new VaultTransactionError('The vault is not open.');
    }
    return this.state;
  }

  private async acquireLock(): Promise<void> {
    try {
      await this.writeLockFile();
      this.locked = true;
      return;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'EEXIST') throw error;
    }
    // Someone holds the lock: steal it only if that owner is provably dead.
    let pid: number | undefined;
    try {
      const raw = new TextDecoder().decode(await this.operations.readFile(this.lockPath));
      const parsed = Number.parseInt(raw.split('\n', 1)[0] ?? '', 10);
      if (Number.isInteger(parsed)) pid = parsed;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'ENOENT') throw error;
    }
    if (pid !== undefined && this.operations.isProcessAlive(pid)) {
      throw new VaultLockError();
    }
    await this.operations.rm(this.lockPath, { force: true });
    try {
      await this.writeLockFile();
    } catch (error) {
      // Lost a steal race with a live process — surface the single-owner rule.
      if (isErrnoException(error) && error.code === 'EEXIST') throw new VaultLockError();
      throw error;
    }
    this.locked = true;
  }

  private async writeLockFile(): Promise<void> {
    const handle = await this.operations.openWriteExclusive(this.lockPath, 0o600);
    try {
      await handle.writeFile(new TextEncoder().encode(`${process.pid}\n`));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async releaseLock(): Promise<void> {
    if (!this.locked) return;
    this.locked = false;
    await this.operations.rm(this.lockPath, { force: true });
  }

  private async discardTempFiles(): Promise<string[]> {
    const directory = dirname(this.path);
    let names: string[];
    try {
      names = await this.operations.readdir(directory);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const prefix = `${basename(this.path)}.`;
    const discarded: string[] = [];
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
      await this.operations.rm(join(directory, name), { force: true });
      discarded.push(name);
    }
    return discarded;
  }

  async open(): Promise<VaultOpenInfo> {
    if (this.closed || this.state !== undefined) {
      throw new VaultTransactionError('The vault is already open or closed.');
    }
    await this.operations.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await this.acquireLock();
    let state: OpenState;
    let discardedTempFiles: string[];
    try {
      // Torn writes from a crashed commit land in temp files, never the vault path
      // (write-temp + rename); drop them and remember what was cleaned.
      discardedTempFiles = await this.discardTempFiles();
      state = await this.loadState();
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
    this.state = state;

    // Crash/retry recovery: adopt every pending staged send so the reloaded state can
    // never be behind anything already sent (no key/nonce reuse, P13-006).
    const adopted: string[] = [];
    for (const [sessionId, record] of state.sessions) {
      if (record.staged !== undefined) {
        state.sessions.set(sessionId, { live: record.staged, staged: undefined });
        adopted.push(sessionId);
      }
    }
    if (adopted.length > 0) {
      try {
        await this.commit(state.sessions);
      } catch (error) {
        // The adoption commit failed: the file still holds the pre-commit document, so
        // a retry re-adopts. Fail now rather than continuing with unadopted state.
        await this.releaseLock();
        this.state = undefined;
        throw error;
      }
    }
    return {
      generation: state.generation,
      adoptedStagedSessions: adopted,
      discardedTempFiles,
    };
  }

  private async loadState(): Promise<OpenState> {
    const keyState = await this.provider.loadOrCreate();
    const dataKey = deriveVaultDataKey(keyState.wrappingKey, this.accountKey);
    zeroize(keyState.wrappingKey);

    let bytes: Uint8Array;
    try {
      bytes = await this.operations.readFile(this.path);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        if (keyState.generation > 0) {
          // Files vanished while the anchor says this device committed generations —
          // a restored-to-absent or deleted-behind-our-back state. Refuse.
          zeroize(dataKey);
          throw new VaultRollbackError();
        }
        return { dataKey, sessions: new Map(), generation: 0 };
      }
      throw error;
    }

    const sealed = parseSealedVaultFile(bytes);
    if (sealed.generation < keyState.generation) {
      zeroize(dataKey);
      throw new VaultRollbackError();
    }
    const document: VaultDocument = decodeVaultDocument(openSealedVaultFile(dataKey, sealed));
    if (sealed.generation > keyState.generation) {
      // Crash between the atomic file commit and the anchor update: adopt, never flag.
      await this.provider.advanceGeneration(sealed.generation);
    }
    return { dataKey, sessions: new Map(document.sessions), generation: sealed.generation };
  }

  private async commit(sessions: Map<string, VaultSessionRecord>): Promise<void> {
    const state = this.assertUsable();
    const generation = state.generation + 1;
    const sealed = sealVaultFile(state.dataKey, generation, encodeVaultDocument({ sessions }));
    const directory = dirname(this.path);
    await this.operations.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = this.tempPath();
    try {
      const handle = await this.operations.openWriteExclusive(temporary, 0o600);
      try {
        await handle.writeFile(sealed);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.operations.chmod(temporary, 0o600);
      await this.operations.rename(temporary, this.path);
      await this.operations.syncDirectory(directory);
    } catch (error) {
      await this.operations.rm(temporary, { force: true });
      throw error;
    }
    zeroizeEvicted(state.sessions, sessions);
    state.sessions = sessions;
    state.generation = generation;
    await this.provider.advanceGeneration(generation);
  }

  listSessions(): Promise<string[]> {
    return Promise.resolve().then(() => [...this.assertUsable().sessions.keys()]);
  }

  getRecord(sessionId: string): Promise<Uint8Array | undefined> {
    return Promise.resolve().then(() => this.assertUsable().sessions.get(sessionId)?.live.slice());
  }

  async stageRecord(sessionId: string, next: Uint8Array): Promise<void> {
    const state = this.assertUsable();
    await this.commit(
      withRecord(state.sessions, sessionId, (record) => {
        if (record.staged !== undefined) {
          throw new VaultTransactionError('A staged send is already pending for this session.');
        }
        return { live: record.live, staged: next.slice() };
      }),
    );
  }

  async confirmRecord(sessionId: string, successor?: Uint8Array): Promise<void> {
    const state = this.assertUsable();
    await this.commit(
      withRecord(state.sessions, sessionId, (record) => {
        if (record.staged === undefined) {
          throw new VaultTransactionError('No staged send is pending for this session.');
        }
        return { live: (successor ?? record.staged).slice(), staged: undefined };
      }),
    );
  }

  async updateRecord(sessionId: string, next: Uint8Array): Promise<void> {
    const state = this.assertUsable();
    if (!state.sessions.has(sessionId)) {
      const created = new Map(state.sessions);
      created.set(sessionId, { live: next.slice(), staged: undefined });
      await this.commit(created);
      return;
    }
    await this.commit(
      withRecord(state.sessions, sessionId, (record) => {
        if (record.staged !== undefined) {
          throw new VaultTransactionError('Confirm the pending staged send before updating.');
        }
        return { live: next.slice(), staged: undefined };
      }),
    );
  }

  async deleteRecord(sessionId: string): Promise<void> {
    const state = this.assertUsable();
    const next = new Map(state.sessions);
    if (!next.delete(sessionId)) return;
    await this.commit(next);
  }

  async wipe(): Promise<void> {
    if (this.closed || this.wiped) return;
    await this.provider.delete();
    // Best-effort overwrite before unlink (ADR 0020 §4: JS wiping is hygiene, not a
    // claimed control — the OS may retain the blocks regardless). Any failure here
    // must not block the actual removal below.
    try {
      const bytes = await this.operations.readFile(this.path);
      const overwrite = this.tempPath();
      const handle = await this.operations.openWriteExclusive(overwrite, 0o600);
      try {
        await handle.writeFile(randomBytes(bytes.length));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.operations.rename(overwrite, this.path);
    } catch {
      // Overwrite hygiene failed (or the vault file is already gone); the forced
      // unlink below still performs the wipe.
    }
    await this.discardTempFiles();
    await this.operations.rm(this.path, { force: true });
    await this.releaseLock();
    if (this.state !== undefined) {
      zeroize(this.state.dataKey);
      zeroizeAll(this.state.sessions);
      this.state = undefined;
    }
    this.wiped = true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.state !== undefined) {
      zeroize(this.state.dataKey);
      zeroizeAll(this.state.sessions);
      this.state = undefined;
    }
    if (this.locked) {
      this.locked = false;
      void this.operations.rm(this.lockPath, { force: true });
    }
  }
}
