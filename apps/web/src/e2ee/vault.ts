/**
 * The browser's encrypted E2EE vault (B-102 follow-up; web analogue of the TUI's
 * P13-006 `vault-store.ts`/`ratchet-vault.ts`).
 *
 * **What is identical to the TUI vault:** the sealed container format
 * (`vault-format.ts`), the staged-commit send contract (`stageRecord` durably before
 * bytes may leave; a crash between stage and send is adopted — never replayed — on the
 * next open), the transaction rules, and the coarse content-free fault vocabulary.
 *
 * **What is browser-specific, stated plainly because ADR 0020 §4 requires each client
 * to have its own *reviewed* vault adapter rather than a port that silently claims
 * parity:**
 *
 *   1. *Wrapping key.* The TUI wraps with an OS-keyring entry. A browser has no
 *      keyring, so this tier is the browser analogue of the TUI's explicitly weaker
 *      guarded-file tier: a random 32-byte account secret held in `localStorage`
 *      (origin-scoped, never leaves the device) is stretched with WebCrypto
 *      PBKDF2-SHA256 over a salt stored beside the vault in IndexedDB, then HKDF-bound
 *      to the account before it ever encrypts a document. This defends vault bytes at
 *      rest against other origins, extensions without page access, and casual database
 *      inspection — it does NOT defend against anything with this origin's
 *      localStorage (notably XSS), and it must never be described as hardware-backed.
 *   2. *Durability.* A commit is one IndexedDB transaction over a single record plus a
 *      localStorage generation-anchor update. Browsers do not expose fsync; a power
 *      loss after `stageRecord` resolves could still lose the staged successor, which
 *      degrades to the ratchet's skipped-key path (a gap the peer absorbs), never to
 *      key/nonce reuse — reuse would require the *anchor+vault together* to travel
 *      backwards, which the rollback check below refuses.
 *   3. *Rollback detection boundary.* The generation high-water mark lives beside the
 *      wrapping secret in localStorage, mirroring the TUI's guarded-file tier: restoring
 *      only the IndexedDB vault to an older snapshot is detected; restoring both
 *      storages together defeats detection (accepted residual risk, same boundary ADR
 *      0020's 2026-08-24 addendum records as risk 1).
 *   4. *Single owner.* One runtime instance per tab owns the vault; browsers offer no
 *      cross-process lock the way the TUI's lock file does, so two tabs of the same
 *      account each hold an independent copy of the last committed state (last writer
 *      wins per record). The app routes every E2EE operation through one module-level
 *      manager to keep one owner per tab.
 *
 * Hard rule (ADR 0020 §4 / spec §194): no key material, ratchet bytes, counters, or
 * message content ever reaches an error, log, or diagnostic.
 */

import {
  decodeRatchetState,
  disposeRatchetState,
  encodeRatchetState,
  randomBytes,
  zeroize,
  type DoubleRatchetState,
} from '@patches/crypto';

import {
  decodeVaultDocument,
  deriveVaultDataKey,
  encodeVaultDocument,
  openSealedVaultBlob,
  parseSealedVaultBlob,
  sealVaultBlob,
  type VaultSessionRecord,
} from './vault-format.js';
import { VaultCorruptionError, VaultRollbackError, VaultTransactionError } from './vault-errors.js';

/** PBKDF2 work factor for stretching the localStorage account secret. Deliberately
 * documented next to the claim it supports: this is *storage* hardening for a secret
 * that never leaves the origin, not a password KDF defending a memorized secret. */
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const SECRET_BYTES = 32;
const DB_VERSION = 1;
const DOC_KEY = 'doc';
const SALT_KEY = 'salt';

export interface WebVaultAccount {
  /** Window origin (`location.origin`) — scopes the vault to one node. */
  readonly origin: string;
  readonly actorId: string;
}

export interface VaultOpenInfo {
  readonly generation: number;
  /** Sessions whose pending staged send was adopted as live after a crash/retry. */
  readonly adoptedStagedSessions: readonly string[];
}

/** The byte-level store contract the typed facade sits on (TUI `RatchetVaultStore`,
 * minus the fs-specific `discardedTempFiles`). */
export interface RatchetVaultStore {
  open(): Promise<VaultOpenInfo>;
  listSessions(): Promise<string[]>;
  getRecord(sessionId: string): Promise<Uint8Array | undefined>;
  stageRecord(sessionId: string, next: Uint8Array): Promise<void>;
  confirmRecord(sessionId: string, successor?: Uint8Array): Promise<void>;
  updateRecord(sessionId: string, next: Uint8Array): Promise<void>;
  deleteRecord(sessionId: string): Promise<void>;
  wipe(): Promise<void>;
  close(): void;
}

// ---------------------------------------------------------------------------
// localStorage seams — wrapping secret + generation anchor (guarded-file analogue)
// ---------------------------------------------------------------------------

export interface VaultBrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultBrowserStorage: VaultBrowserStorage =
  typeof localStorage === 'undefined'
    ? {
        getItem: () => null,
        setItem: () => {
          // No storage at all (SSR/preview shells): the vault cannot persist; fail
          // closed at open() below rather than silently storing secrets in memory
          // that claims to be durable.
          throw new VaultTransactionError('This browser has no local storage for the E2EE vault.');
        },
        removeItem: () => undefined,
      }
    : {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      };

function secretKey(account: WebVaultAccount): string {
  return `patches-e2ee-vault/secret/${account.origin}/${account.actorId}`;
}

function anchorKey(account: WebVaultAccount): string {
  return `patches-e2ee-vault/generation/${account.origin}/${account.actorId}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string, expectedLength: number): Uint8Array | undefined {
  try {
    const binary = atob(value);
    if (binary.length !== expectedLength) return undefined;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

/** Loads (or creates once, ever) the account's wrapping secret. A malformed stored
 * value is treated as absent only when no vault exists yet; once a vault exists the
 * secret must decode, otherwise the vault would be silently unreadable-by-choice. */
function loadOrCreateSecret(account: WebVaultAccount, storage: VaultBrowserStorage): Uint8Array {
  const stored = storage.getItem(secretKey(account));
  if (stored !== null) {
    const parsed = fromBase64(stored, SECRET_BYTES);
    if (parsed !== undefined) return parsed;
  }
  const secret = randomBytes(SECRET_BYTES);
  storage.setItem(secretKey(account), toBase64(secret));
  return secret;
}

function readAnchor(account: WebVaultAccount, storage: VaultBrowserStorage): number {
  const stored = storage.getItem(anchorKey(account));
  if (stored === null) return 0;
  const parsed = Number.parseInt(stored, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function writeAnchor(account: WebVaultAccount, storage: VaultBrowserStorage, value: number): void {
  storage.setItem(anchorKey(account), String(value));
}

// ---------------------------------------------------------------------------
// WebCrypto PBKDF2 — the browser-stored salt lives in IndexedDB beside the vault
// ---------------------------------------------------------------------------

/** WebCrypto's `BufferSource` is `ArrayBuffer`-backed, while `@noble/*` hands back
 * `Uint8Array<ArrayBufferLike>` (possibly `SharedArrayBuffer`); copy into a fresh
 * `ArrayBuffer` the caller can zeroize afterwards. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export async function deriveWrappingKey(secret: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
    // No environment for the reviewed derivation path — refuse rather than substituting
    // an unreviewed KDF on the fly.
    throw new VaultTransactionError('This browser has no WebCrypto for the E2EE vault.');
  }
  const secretBuffer = toArrayBuffer(secret);
  try {
    const key = await crypto.subtle.importKey('raw', secretBuffer, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS },
      key,
      256,
    );
    return new Uint8Array(bits);
  } finally {
    // The transient copy of the account secret must not outlive the derivation.
    new Uint8Array(secretBuffer).fill(0);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB seams — a single-record document store with an injectable factory
// ---------------------------------------------------------------------------

export interface VaultIndexedDbLike {
  // `IDBOpenDBRequest` (not `IDBRequest<T>`): `IDBRequest` is invariant in its result
  // type, so widening `deleteDatabase` to `IDBRequest<unknown>` rejects the real
  // `indexedDB` object.
  open(name: string, version: number): IDBOpenDBRequest;
  deleteDatabase(name: string): IDBOpenDBRequest;
}

const defaultIndexedDb: VaultIndexedDbLike =
  typeof indexedDB === 'undefined'
    ? {
        open: () => {
          throw new VaultTransactionError('This browser has no IndexedDB for the E2EE vault.');
        },
        deleteDatabase: () => {
          throw new VaultTransactionError('This browser has no IndexedDB for the E2EE vault.');
        },
      }
    : {
        open: (name, version) => indexedDB.open(name, version),
        deleteDatabase: (name) => indexedDB.deleteDatabase(name),
      };

function databaseName(account: WebVaultAccount): string {
  return `patches-e2ee-vault/${encodeURIComponent(account.origin)}/${account.actorId}`;
}

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB failure')),
    );
  });
}

async function openDatabase(
  account: WebVaultAccount,
  indexedDb: VaultIndexedDbLike,
): Promise<IDBDatabase> {
  const request = indexedDb.open(databaseName(account), DB_VERSION);
  request.addEventListener('upgradeneeded', () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
  });
  const db = await requestDone(request);
  db.addEventListener('versionchange', () => db.close());
  return db;
}

/** One read-modify-write over the `state` store — the atomicity unit of every commit. */
function withStateStore<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('state', mode);
    const result = run(transaction.objectStore('state'));
    // `complete` is the event IndexedDB fires when a transaction commits; `commit` is a
    // *method* on IDBTransaction and never fires as an event (waiting on it hangs).
    transaction.addEventListener('complete', () => resolve(result));
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted')),
    );
  });
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** Enforces the staged-send transaction rules (identical to the TUI store). */
function withRecord(
  sessions: ReadonlyMap<string, VaultSessionRecord>,
  sessionId: string,
  build: (record: VaultSessionRecord) => VaultSessionRecord,
): Map<string, VaultSessionRecord> {
  const record = sessions.get(sessionId);
  if (record === undefined) {
    throw new VaultTransactionError('No vault session exists for this id.');
  }
  const next = new Map(sessions);
  next.set(sessionId, build(record));
  return next;
}

/** Best-effort hygiene: zeroize every buffer of `previous` that `next` did not keep. */
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

export interface CreateWebVaultOptions {
  readonly account: WebVaultAccount;
  /** Injectable for tests (fresh `IDBFactory`, isolated localStorage view). */
  readonly indexedDb?: VaultIndexedDbLike | undefined;
  readonly browserStorage?: VaultBrowserStorage | undefined;
}

export class IndexedDbRatchetVaultStore implements RatchetVaultStore {
  private readonly account: WebVaultAccount;
  private readonly indexedDb: VaultIndexedDbLike;
  private readonly storage: VaultBrowserStorage;
  private db: IDBDatabase | undefined;
  private dataKey: Uint8Array | undefined;
  private secret: Uint8Array | undefined;
  private sessions = new Map<string, VaultSessionRecord>();
  private generation = 0;
  private opened = false;
  private closed = false;

  constructor(options: CreateWebVaultOptions) {
    this.account = options.account;
    this.indexedDb = options.indexedDb ?? defaultIndexedDb;
    this.storage = options.browserStorage ?? defaultBrowserStorage;
  }

  private assertUsable(): void {
    if (this.closed) throw new VaultTransactionError('The vault is closed.');
    if (!this.opened) throw new VaultTransactionError('The vault is not open yet.');
  }

  async open(): Promise<VaultOpenInfo> {
    if (this.closed) throw new VaultTransactionError('The vault is closed.');
    if (this.opened) throw new VaultTransactionError('The vault is already open.');
    this.db = await openDatabase(this.account, this.indexedDb);

    // Salt first: created once, ever, beside the vault.
    const salt = await withStateStore(this.db, 'readwrite', async (store) => {
      // IDBObjectStore.get's built-in typing always returns IDBRequest<any> regardless of
      // what's stored; this cast asserts the shape this vault itself wrote at SALT_KEY.
      const stored = await requestDone<Uint8Array | undefined>(
        store.get(SALT_KEY) as IDBRequest<Uint8Array | undefined>,
      );
      if (stored !== undefined) return stored;
      const fresh = randomBytes(SALT_BYTES);
      store.put(fresh, SALT_KEY);
      return fresh;
    });

    this.secret = loadOrCreateSecret(this.account, this.storage);
    const wrappingKey = await deriveWrappingKey(this.secret, salt);
    this.dataKey = deriveVaultDataKey(
      wrappingKey,
      `${this.account.origin}\u0000${this.account.actorId}`,
    );
    zeroize(wrappingKey);

    // Same IDBObjectStore.get typing gap as above: cast to the shape this vault wrote.
    const blob = await withStateStore(this.db, 'readonly', (store) =>
      requestDone<Uint8Array | undefined>(store.get(DOC_KEY) as IDBRequest<Uint8Array | undefined>),
    );

    const anchor = readAnchor(this.account, this.storage);
    if (blob === undefined) {
      if (anchor > 0) {
        // The vault is gone but this browser committed a later generation (cleared
        // IndexedDB, restored storage): the anchor-ahead ritual (ADR 0020 addendum
        // risk 2) — inaccessible history until an explicit wipe, never a silent reset.
        throw new VaultRollbackError();
      }
      this.sessions = new Map();
      this.generation = 0;
      this.opened = true;
      writeAnchor(this.account, this.storage, 0);
      return { generation: 0, adoptedStagedSessions: [] };
    }

    const parsed = parseSealedVaultBlob(blob);
    if (parsed.generation < anchor) throw new VaultRollbackError();
    const plaintext = openSealedVaultBlob(this.dataKey, parsed);
    const document = decodeVaultDocument(plaintext);
    zeroize(plaintext);
    this.generation = parsed.generation;
    this.sessions = new Map(document.sessions);

    // Adopt any staged sends left behind by a crash between stage and confirm: the
    // reloaded state must always be at least as advanced as anything ever sent.
    const adopted: string[] = [];
    const adoptedSessions = new Map<string, VaultSessionRecord>();
    for (const [sessionId, record] of this.sessions) {
      if (record.staged !== undefined) {
        adoptedSessions.set(sessionId, { live: record.staged, staged: undefined });
        adopted.push(sessionId);
      } else {
        adoptedSessions.set(sessionId, record);
      }
    }
    this.opened = true;
    if (adopted.length > 0) {
      this.sessions = adoptedSessions;
      await this.commit();
    }
    return { generation: this.generation, adoptedStagedSessions: adopted };
  }

  /** The durability unit: seal generation+1, one IndexedDB transaction, then anchor. */
  private async commit(): Promise<void> {
    if (this.dataKey === undefined || this.db === undefined) {
      throw new VaultTransactionError('The vault is not open yet.');
    }
    const generation = this.generation + 1;
    const plaintext = encodeVaultDocument({ sessions: this.sessions });
    const sealed = sealVaultBlob(this.dataKey, generation, plaintext);
    zeroize(plaintext);
    await withStateStore(this.db, 'readwrite', (store) => {
      store.put(sealed, DOC_KEY);
    });
    this.generation = generation;
    // Anchor after the vault commit: an anchor that lags weakens rollback detection for
    // one generation; an anchor that leads would false-positive a healthy vault.
    writeAnchor(
      this.account,
      this.storage,
      Math.max(readAnchor(this.account, this.storage), generation),
    );
  }

  listSessions(): Promise<string[]> {
    // Not async: assertUsable's throw must surface as a rejection (callers await this),
    // which a synchronous throw from a non-async function would bypass.
    try {
      this.assertUsable();
    } catch (err) {
      return Promise.reject(
        err instanceof Error ? err : new VaultTransactionError('The vault is not usable.'),
      );
    }
    return Promise.resolve([...this.sessions.keys()]);
  }

  getRecord(sessionId: string): Promise<Uint8Array | undefined> {
    // Same rejection-not-throw requirement as listSessions above.
    try {
      this.assertUsable();
    } catch (err) {
      return Promise.reject(
        err instanceof Error ? err : new VaultTransactionError('The vault is not usable.'),
      );
    }
    return Promise.resolve(this.sessions.get(sessionId)?.live.slice());
  }

  /** Applies one map mutation durably: commit, then zeroize whatever the commit
   * evicted; a failed commit restores the previous map untouched. */
  private async mutate(apply: (sessions: Map<string, VaultSessionRecord>) => void): Promise<void> {
    this.assertUsable();
    const previous = this.sessions;
    const next = new Map(previous);
    apply(next);
    this.sessions = next;
    try {
      await this.commit();
    } catch (error) {
      this.sessions = previous;
      throw error;
    }
    zeroizeEvicted(previous, this.sessions);
  }

  async stageRecord(sessionId: string, next: Uint8Array): Promise<void> {
    await this.mutate((sessions) => {
      const updated = withRecord(sessions, sessionId, (record) => {
        if (record.staged !== undefined) {
          throw new VaultTransactionError('A staged send is already pending for this session.');
        }
        return { live: record.live, staged: next.slice() };
      });
      sessions.clear();
      for (const [key, value] of updated) sessions.set(key, value);
    });
  }

  async confirmRecord(sessionId: string, successor?: Uint8Array): Promise<void> {
    await this.mutate((sessions) => {
      const updated = withRecord(sessions, sessionId, (record) => {
        if (record.staged === undefined) {
          throw new VaultTransactionError('No staged send is pending for this session.');
        }
        return { live: (successor ?? record.staged).slice(), staged: undefined };
      });
      sessions.clear();
      for (const [key, value] of updated) sessions.set(key, value);
    });
  }

  async updateRecord(sessionId: string, next: Uint8Array): Promise<void> {
    await this.mutate((sessions) => {
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { live: next.slice(), staged: undefined });
        return;
      }
      const updated = withRecord(sessions, sessionId, (record) => {
        if (record.staged !== undefined) {
          throw new VaultTransactionError('Confirm the pending staged send before updating.');
        }
        return { live: next.slice(), staged: undefined };
      });
      sessions.clear();
      for (const [key, value] of updated) sessions.set(key, value);
    });
  }

  async deleteRecord(sessionId: string): Promise<void> {
    this.assertUsable();
    if (!this.sessions.has(sessionId)) return;
    await this.mutate((sessions) => {
      sessions.delete(sessionId);
    });
  }

  async wipe(): Promise<void> {
    if (this.closed) return;
    for (const record of this.sessions.values()) {
      zeroize(record.live);
      if (record.staged !== undefined) zeroize(record.staged);
    }
    this.sessions = new Map();
    this.generation = 0;
    this.storage.removeItem(secretKey(this.account));
    this.storage.removeItem(anchorKey(this.account));
    const db = this.db;
    this.db = undefined;
    if (db !== undefined) db.close();
    await new Promise<void>((resolve) => {
      const request = this.indexedDb.deleteDatabase(databaseName(this.account));
      request.addEventListener('success', () => resolve());
      request.addEventListener('error', () => resolve());
      request.addEventListener('blocked', () => resolve());
    });
  }

  close(): void {
    if (this.closed) return;
    for (const record of this.sessions.values()) {
      zeroize(record.live);
      if (record.staged !== undefined) zeroize(record.staged);
    }
    this.sessions = new Map();
    if (this.dataKey !== undefined) zeroize(this.dataKey);
    if (this.secret !== undefined) zeroize(this.secret);
    this.dataKey = undefined;
    this.secret = undefined;
    this.db?.close();
    this.db = undefined;
    this.closed = true;
  }
}

// ---------------------------------------------------------------------------
// Typed facade — callers hand around `DoubleRatchetState`, only opaque
// `encodeRatchetState` bytes ever cross the store boundary (ADR 0020 §4)
// ---------------------------------------------------------------------------

/** The runtime-facing vault surface (TUI `RatchetSessionVault`, verbatim). */
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
  /** Opaque non-ratchet record access (the enrollment record). Keys must never
   * collide with a session id. */
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

export async function createRatchetSessionVault(
  options: CreateWebVaultOptions,
): Promise<RatchetSessionVault> {
  const store = new IndexedDbRatchetVaultStore(options);
  try {
    await store.open();
  } catch (error) {
    // A fault (rollback/corrupt/storage-missing) must not leak the DB connection; the
    // fault is sticky at the manager layer, which refuses a silent reset.
    store.close();
    throw error;
  }
  return new TypedRatchetVault(store);
}
