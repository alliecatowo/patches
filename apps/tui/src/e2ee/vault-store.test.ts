import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { encodeRatchetState } from '@patches/crypto';

import { KeyringVaultKeyProvider, type KeyringModuleLike } from './vault-key-providers.js';
import { defaultVaultFileOperations } from './vault-file-operations.js';
import {
  VaultCorruptionError,
  VaultLockError,
  VaultRollbackError,
  VaultTransactionError,
} from './vault-errors.js';
import { FileVaultStore, MemoryVaultStore } from './vault-store.js';
import { MemoryVaultFs, TEST_ACCOUNT, fakeKeyring, testRatchetState } from './test-support.js';

const VAULT_PATH = '/cfg/patches/e2ee/test.vault';
const RECORD_A = encodeRatchetState(testRatchetState());
const RECORD_B = encodeRatchetState(testRatchetState());
const RECORD_C = encodeRatchetState(testRatchetState());

interface Harness {
  readonly fs: MemoryVaultFs;
  readonly keyring: KeyringModuleLike;
  readonly entries: Map<string, string>;
  store(): FileVaultStore;
  open(): Promise<FileVaultStore>;
}

function harness(path = VAULT_PATH): Harness {
  const fs = new MemoryVaultFs();
  const { keyring, entries } = fakeKeyring();
  const store = () =>
    new FileVaultStore({
      provider: new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring }),
      account: TEST_ACCOUNT,
      path,
      fileOperations: fs,
    });
  return {
    fs,
    keyring,
    entries,
    store,
    open: async () => {
      const opened = store();
      await opened.open();
      return opened;
    },
  };
}

describe('FileVaultStore basics', () => {
  it('opens fresh (no file, anchor at 0) with an empty document', async () => {
    const h = harness();
    const store = await h.open();
    expect(await store.listSessions()).toEqual([]);
    expect(await store.getRecord('missing')).toBeUndefined();
    store.close();
  });

  it('round-trips records across store instances on the same files', async () => {
    const h = harness();
    const first = await h.open();
    await first.updateRecord('s1', RECORD_A);
    await first.updateRecord('s2', RECORD_B);
    first.close();

    const second = await h.open();
    expect(await second.listSessions()).toEqual(['s1', 's2']);
    expect(await second.getRecord('s1')).toEqual(RECORD_A);
    expect(await second.getRecord('s2')).toEqual(RECORD_B);
    await second.deleteRecord('s1');
    second.close();

    const third = await h.open();
    expect(await third.listSessions()).toEqual(['s2']);
    third.close();
  });

  it('writes the vault owner-only, with no plaintext state or session ids on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'patches-vault-'));
    try {
      const { keyring } = fakeKeyring();
      const store = new FileVaultStore({
        provider: new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring }),
        account: TEST_ACCOUNT,
        path: join(dir, 'vault.bin'),
        fileOperations: defaultVaultFileOperations(),
      });
      await store.open();
      await store.updateRecord('s1', RECORD_A);
      store.close();

      const stats = await stat(join(dir, 'vault.bin'));
      expect(stats.mode & 0o777).toBe(0o600);
      const onDisk = await readFile(join(dir, 'vault.bin'));
      expect(onDisk.indexOf(RECORD_A)).toBe(-1);
      expect(onDisk.indexOf(new TextEncoder().encode('s1'))).toBe(-1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('FileVaultStore staged-send transaction', () => {
  it('stage then confirm promotes the staged state', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    await store.stageRecord('s1', RECORD_B);
    await store.confirmRecord('s1');
    expect(await store.getRecord('s1')).toEqual(RECORD_B);
    store.close();
  });

  it('confirm may carry a successor derived from the staged state', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    await store.stageRecord('s1', RECORD_B);
    await store.confirmRecord('s1', RECORD_C);
    expect(await store.getRecord('s1')).toEqual(RECORD_C);
    store.close();
  });

  it('refuses double staging and plain updates over a pending stage', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    await store.stageRecord('s1', RECORD_B);
    await expect(store.stageRecord('s1', RECORD_C)).rejects.toBeInstanceOf(VaultTransactionError);
    await expect(store.updateRecord('s1', RECORD_C)).rejects.toBeInstanceOf(VaultTransactionError);
    store.close();
  });

  it('refuses staging an unknown session', async () => {
    const h = harness();
    const store = await h.open();
    await expect(store.stageRecord('ghost', RECORD_A)).rejects.toBeInstanceOf(
      VaultTransactionError,
    );
    store.close();
  });

  it('adopts a pending staged send on reopen and reports it — old live never returns', async () => {
    const h = harness();
    const crashed = await h.open();
    await crashed.updateRecord('s1', RECORD_A);
    await crashed.stageRecord('s1', RECORD_B);
    crashed.close(); // crash between the durable stage and the confirm/send

    const recovered = h.store();
    const info = await recovered.open();
    expect(info.adoptedStagedSessions).toEqual(['s1']);
    expect(await recovered.getRecord('s1')).toEqual(RECORD_B);
    recovered.close();

    // The adoption commit is durable: a second reopen reports nothing left to adopt.
    const again = h.store();
    expect((await again.open()).adoptedStagedSessions).toEqual([]);
    expect(await again.getRecord('s1')).toEqual(RECORD_B);
    again.close();
  });
});

describe('FileVaultStore crash windows', () => {
  it('a torn temp write (crash before rename) loses nothing committed', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);

    h.fs.crashAt = 'rename';
    await expect(store.updateRecord('s1', RECORD_B)).rejects.toThrow();
    store.close();

    const reopened = await h.open();
    expect(await reopened.getRecord('s1')).toEqual(RECORD_A);
    expect([...h.fs.files.keys()].filter((key) => key.endsWith('.tmp'))).toEqual([]);
    reopened.close();
  });

  it('a crash after rename but before the anchor update is adopted, not flagged', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);

    h.fs.crashAt = 'syncDirectory';
    await expect(store.updateRecord('s1', RECORD_B)).rejects.toThrow();
    store.close();

    const reopened = await h.open();
    expect(await reopened.getRecord('s1')).toEqual(RECORD_B);
    reopened.close();
  });

  it('a crash before the file commit leaves the previous state intact', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);

    h.fs.crashAt = 'write';
    await expect(store.updateRecord('s1', RECORD_B)).rejects.toThrow();
    store.close();

    const reopened = await h.open();
    expect(await reopened.getRecord('s1')).toEqual(RECORD_A);
    reopened.close();
  });
});

describe('FileVaultStore rollback detection', () => {
  it('refuses an older vault file (restored backup) and releases the lock', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    const backup = h.fs.files.get(VAULT_PATH)?.slice();
    await store.updateRecord('s1', RECORD_B); // generation and anchor advance
    store.close();

    h.fs.files.set(VAULT_PATH, backup ?? new Uint8Array()); // restore the old file

    await expect(h.store().open()).rejects.toBeInstanceOf(VaultRollbackError);
    // Fail-closed must not leave the vault permanently locked.
    expect(h.fs.files.has(`${VAULT_PATH}.lock`)).toBe(false);
  });

  it('refuses a vanished vault file when the anchor says commits existed', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    store.close();
    h.fs.files.delete(VAULT_PATH);

    await expect(h.store().open()).rejects.toBeInstanceOf(VaultRollbackError);
  });

  it('an unchanged vault reopens cleanly after commits', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    store.close();
    await expect(h.open()).resolves.toBeTruthy();
  });
});

describe('FileVaultStore corruption', () => {
  it('fails closed on a flipped byte and does not reset silently', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    store.close();

    const flipped = h.fs.files.get(VAULT_PATH)?.slice() ?? new Uint8Array();
    const last = flipped.length - 1;
    flipped[last] = (flipped[last] ?? 0) ^ 0xff;
    h.fs.files.set(VAULT_PATH, flipped);

    await expect(h.store().open()).rejects.toBeInstanceOf(VaultCorruptionError);
    expect(h.fs.files.has(`${VAULT_PATH}.lock`)).toBe(false);
  });
});

describe('FileVaultStore single-owner lock', () => {
  it('blocks a second open while the owner lives, then frees on close', async () => {
    const h = harness();
    const owner = await h.open();
    await expect(h.store().open()).rejects.toBeInstanceOf(VaultLockError);
    owner.close();
    await expect(h.open()).resolves.toBeTruthy();
  });

  it('steals a stale lock left by a dead process', async () => {
    const h = harness();
    const store = await h.open();
    store.close();
    // Forge a lock as if a process crashed without cleanup: pid 999999 is dead.
    h.fs.files.set(`${VAULT_PATH}.lock`, new TextEncoder().encode('999999\n'));
    const reopened = await h.open();
    expect(await reopened.listSessions()).toEqual([]);
    reopened.close();
  });
});

describe('FileVaultStore wipe', () => {
  it('removes the database, temps, lock, and keyring anchor; a fresh vault starts clean', async () => {
    const h = harness();
    const store = await h.open();
    await store.updateRecord('s1', RECORD_A);
    await store.stageRecord('s1', RECORD_B);
    await store.wipe();
    store.close();

    expect(h.fs.files.has(VAULT_PATH)).toBe(false);
    expect([...h.fs.files.keys()].filter((key) => key.endsWith('.tmp'))).toEqual([]);
    expect(h.entries.size).toBe(0);

    const fresh = await h.open();
    expect(await fresh.listSessions()).toEqual([]);
    await fresh.updateRecord('s1', RECORD_A);
    fresh.close();
  });

  it('is idempotent on an empty vault', async () => {
    const h = harness();
    const store = await h.open();
    await store.wipe();
    await expect(store.wipe()).resolves.toBeUndefined();
    store.close();
  });

  it('leaves the store unusable until reopened', async () => {
    const h = harness();
    const store = await h.open();
    await store.wipe();
    await expect(store.listSessions()).rejects.toBeInstanceOf(VaultTransactionError);
    store.close();
  });
});

describe('MemoryVaultStore', () => {
  it('enforces the same staged-send transaction semantics', async () => {
    const store = new MemoryVaultStore();
    await store.open();
    await store.updateRecord('s1', RECORD_A);
    await store.stageRecord('s1', RECORD_B);
    await expect(store.stageRecord('s1', RECORD_C)).rejects.toBeInstanceOf(VaultTransactionError);
    await expect(store.updateRecord('s1', RECORD_C)).rejects.toBeInstanceOf(VaultTransactionError);
    await store.confirmRecord('s1');
    expect(await store.getRecord('s1')).toEqual(RECORD_B);
    await store.wipe();
    expect(await store.listSessions()).toEqual([]);
    store.close();
  });

  it('refuses use before open and after close', async () => {
    const unopened = new MemoryVaultStore();
    await expect(unopened.listSessions()).rejects.toBeInstanceOf(VaultTransactionError);
    const store = new MemoryVaultStore();
    await store.open();
    store.close();
    await expect(store.listSessions()).rejects.toBeInstanceOf(VaultTransactionError);
  });
});
