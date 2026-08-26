/**
 * IndexedDB vault store tests (B-140). What is actually being asserted here is the
 * durability contract the ratchet depends on (ADR 0020 §4): a committed record survives a
 * reopen, a staged send is adopted rather than lost after a crash, a rolled-back or
 * tampered store fails closed instead of silently resetting, and one account's vault is
 * never readable as another's.
 */
import 'fake-indexeddb/auto';

import { randomBytes } from '@patches/crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  IndexedDbRatchetVaultStore,
  type VaultBrowserStorage,
  type VaultIndexedDbLike,
  type WebVaultAccount,
} from './vault.js';
import { VaultCorruptionError, VaultRollbackError, VaultTransactionError } from './vault-errors.js';

const ORIGIN = 'https://node.example';

/** In-memory `localStorage` view so each test owns its own secret + generation anchor. */
function memoryStorage(): VaultBrowserStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/** Wraps the (fake) global factory and records the database name the store asked for, so
 * the tamper test can reach the raw sealed blob without duplicating the naming rule. */
function trackingIndexedDb(): VaultIndexedDbLike & { name(): string } {
  let seen = '';
  return {
    name: () => seen,
    open: (name, version) => {
      seen = name;
      return indexedDB.open(name, version);
    },
    deleteDatabase: (name) => indexedDB.deleteDatabase(name),
  };
}

function rawRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error('idb failure')));
  });
}

/** Reads and rewrites the sealed document straight out of IndexedDB. */
async function mutateSealedDocument(
  databaseName: string,
  mutate: (blob: Uint8Array) => Uint8Array,
): Promise<void> {
  const db = await rawRequest(indexedDB.open(databaseName));
  try {
    const read = db.transaction('state', 'readonly').objectStore('state');
    const blob = await rawRequest<Uint8Array>(read.get('doc') as IDBRequest<Uint8Array>);
    const write = db.transaction('state', 'readwrite').objectStore('state');
    await rawRequest(write.put(mutate(blob), 'doc'));
  } finally {
    db.close();
  }
}

let counter = 0;

function freshAccount(): WebVaultAccount {
  counter += 1;
  return { origin: ORIGIN, actorId: `actor-${counter}` };
}

describe('IndexedDbRatchetVaultStore', () => {
  let account: WebVaultAccount;
  let storage: ReturnType<typeof memoryStorage>;
  let indexedDb: ReturnType<typeof trackingIndexedDb>;

  beforeEach(() => {
    account = freshAccount();
    storage = memoryStorage();
    indexedDb = trackingIndexedDb();
  });

  function newStore(): IndexedDbRatchetVaultStore {
    return new IndexedDbRatchetVaultStore({ account, indexedDb, browserStorage: storage });
  }

  it('opens an empty vault at generation 0', async () => {
    const store = newStore();

    const info = await store.open();

    expect(info).toEqual({ generation: 0, adoptedStagedSessions: [] });
    expect(await store.listSessions()).toEqual([]);
    store.close();
  });

  it('refuses to be used before open and after close', async () => {
    const store = newStore();
    await expect(store.listSessions()).rejects.toThrow(VaultTransactionError);
    await store.open();
    await expect(store.open()).rejects.toThrow(VaultTransactionError);
    store.close();
    await expect(store.getRecord('s')).rejects.toThrow(VaultTransactionError);
  });

  it('persists a record across a close/reopen cycle', async () => {
    const bytes = randomBytes(64);
    const first = newStore();
    await first.open();
    await first.updateRecord('session-1', bytes);
    first.close();

    const second = newStore();
    const info = await second.open();

    expect(info.generation).toBeGreaterThan(0);
    expect([...((await second.getRecord('session-1')) ?? [])]).toEqual([...bytes]);
    second.close();
  });

  it('hands out copies, so a caller cannot mutate committed state in place', async () => {
    const store = newStore();
    await store.open();
    await store.updateRecord('session-1', new Uint8Array([1, 2, 3]));

    const read = await store.getRecord('session-1');
    if (read !== undefined) read[0] = 99;

    expect([...((await store.getRecord('session-1')) ?? [])]).toEqual([1, 2, 3]);
    store.close();
  });

  it('adopts a staged send left behind by a crash between stage and confirm', async () => {
    const live = randomBytes(16);
    const staged = randomBytes(16);
    const first = newStore();
    await first.open();
    await first.updateRecord('session-1', live);
    await first.stageRecord('session-1', staged);
    // No confirmRecord: the "crash".
    first.close();

    const second = newStore();
    const info = await second.open();

    expect(info.adoptedStagedSessions).toEqual(['session-1']);
    // The reloaded state is the ADVANCED one — never the superseded live record.
    expect([...((await second.getRecord('session-1')) ?? [])]).toEqual([...staged]);
    second.close();
  });

  it('promotes a staged send on confirm, optionally through a successor', async () => {
    const store = newStore();
    await store.open();
    await store.updateRecord('session-1', randomBytes(8));
    await store.stageRecord('session-1', randomBytes(8));
    const successor = randomBytes(8);

    await store.confirmRecord('session-1', successor);

    expect([...((await store.getRecord('session-1')) ?? [])]).toEqual([...successor]);
    // The staged slot is empty again, so an ordinary update is legal.
    await store.updateRecord('session-1', randomBytes(8));
    store.close();
  });

  it('enforces the staged-send transaction rules', async () => {
    const store = newStore();
    await store.open();

    await expect(store.stageRecord('missing', randomBytes(8))).rejects.toThrow(
      VaultTransactionError,
    );
    await expect(store.confirmRecord('missing')).rejects.toThrow(VaultTransactionError);

    await store.updateRecord('session-1', randomBytes(8));
    await expect(store.confirmRecord('session-1')).rejects.toThrow(VaultTransactionError);
    await store.stageRecord('session-1', randomBytes(8));
    await expect(store.stageRecord('session-1', randomBytes(8))).rejects.toThrow(
      VaultTransactionError,
    );
    await expect(store.updateRecord('session-1', randomBytes(8))).rejects.toThrow(
      VaultTransactionError,
    );
    store.close();
  });

  it('fails closed when the sealed document has been tampered with', async () => {
    const first = newStore();
    await first.open();
    await first.updateRecord('session-1', randomBytes(32));
    first.close();

    await mutateSealedDocument(indexedDb.name(), (blob) => {
      const tampered = blob.slice();
      const last = tampered.length - 1;
      tampered[last] = (tampered[last] ?? 0) ^ 0x01;
      return tampered;
    });

    const second = newStore();
    await expect(second.open()).rejects.toThrow(VaultCorruptionError);
    second.close();
  });

  it('refuses a vault older than a generation this browser already committed', async () => {
    const first = newStore();
    await first.open();
    await first.updateRecord('session-1', randomBytes(32));
    first.close();

    // A restored IndexedDB snapshot looks exactly like this: the anchor leads the blob.
    const anchor = `patches-e2ee-vault/generation/${account.origin}/${account.actorId}`;
    storage.map.set(anchor, '999');

    const second = newStore();
    await expect(second.open()).rejects.toThrow(VaultRollbackError);
    second.close();
  });

  it('refuses a vanished vault when this browser committed a later generation', async () => {
    const anchor = `patches-e2ee-vault/generation/${account.origin}/${account.actorId}`;
    storage.map.set(anchor, '4');

    const store = newStore();

    await expect(store.open()).rejects.toThrow(VaultRollbackError);
    store.close();
  });

  it('wipe clears the records, the stored secret, and the generation anchor', async () => {
    const store = newStore();
    await store.open();
    await store.updateRecord('session-1', randomBytes(32));
    expect(storage.map.size).toBeGreaterThan(0);

    await store.wipe();

    expect(storage.map.size).toBe(0);
    const reopened = newStore();
    const info = await reopened.open();
    expect(info.generation).toBe(0);
    expect(await reopened.listSessions()).toEqual([]);
    reopened.close();
  });

  it('deletes a single session without disturbing the rest', async () => {
    const keep = randomBytes(8);
    const store = newStore();
    await store.open();
    await store.updateRecord('session-1', randomBytes(8));
    await store.updateRecord('session-2', keep);

    await store.deleteRecord('session-1');
    await store.deleteRecord('session-1'); // idempotent

    expect(await store.listSessions()).toEqual(['session-2']);
    expect([...((await store.getRecord('session-2')) ?? [])]).toEqual([...keep]);
    store.close();
  });

  it('scopes a vault to one account: another actor sees nothing', async () => {
    const store = newStore();
    await store.open();
    await store.updateRecord('session-1', randomBytes(32));
    store.close();

    const otherAccount: WebVaultAccount = { origin: ORIGIN, actorId: `${account.actorId}-other` };
    const other = new IndexedDbRatchetVaultStore({
      account: otherAccount,
      indexedDb,
      browserStorage: storage,
    });
    await other.open();

    expect(await other.listSessions()).toEqual([]);
    other.close();
  });
});
