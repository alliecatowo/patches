import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FileCredentialStore,
  MemoryCredentialStore,
  type StoredCredential,
} from './credential-store.js';

const ALICE: StoredCredential = {
  nodeOrigin: 'patches.example:443',
  userId: 'user-1',
  actorHandle: 'alice',
  refreshToken: 'refresh-alice',
  refreshExpiresAt: '2026-09-01T00:00:00.000Z',
};

const BOB: StoredCredential = {
  nodeOrigin: 'patches.example:443',
  userId: 'user-2',
  actorHandle: 'bob',
  refreshToken: 'refresh-bob',
  refreshExpiresAt: '2026-09-01T00:00:00.000Z',
};

const OTHER_NODE: StoredCredential = {
  nodeOrigin: 'other.example:443',
  userId: 'user-1',
  actorHandle: 'alice',
  refreshToken: 'refresh-alice-other',
  refreshExpiresAt: '2026-09-01T00:00:00.000Z',
};

describe('MemoryCredentialStore', () => {
  it('round-trips a credential by node + user id', async () => {
    const store = new MemoryCredentialStore();
    await store.set(ALICE);
    await expect(store.get(ALICE.nodeOrigin, ALICE.userId)).resolves.toEqual(ALICE);
  });

  it('resolves the sole account for a node when userId is omitted', async () => {
    const store = new MemoryCredentialStore();
    await store.set(ALICE);
    await expect(store.get(ALICE.nodeOrigin)).resolves.toEqual(ALICE);
  });

  it('refuses to guess when a node has more than one stored account', async () => {
    const store = new MemoryCredentialStore();
    await store.set(ALICE);
    await store.set(BOB);
    await expect(store.get(ALICE.nodeOrigin)).resolves.toBeUndefined();
  });

  it('keeps accounts on different nodes independent, even with the same userId', async () => {
    const store = new MemoryCredentialStore();
    await store.set(ALICE);
    await store.set(OTHER_NODE);
    await expect(store.get(ALICE.nodeOrigin, ALICE.userId)).resolves.toEqual(ALICE);
    await expect(store.get(OTHER_NODE.nodeOrigin, OTHER_NODE.userId)).resolves.toEqual(OTHER_NODE);
  });

  it('never exposes refreshToken from list()', async () => {
    const store = new MemoryCredentialStore();
    await store.set(ALICE);
    const [summary] = await store.list();
    expect(summary).toEqual({
      nodeOrigin: ALICE.nodeOrigin,
      userId: ALICE.userId,
      actorHandle: ALICE.actorHandle,
      refreshExpiresAt: ALICE.refreshExpiresAt,
    });
    expect(summary).not.toHaveProperty('refreshToken');
  });

  it('deletes a stored credential', async () => {
    const store = new MemoryCredentialStore();
    await store.set(ALICE);
    await store.delete(ALICE.nodeOrigin, ALICE.userId);
    await expect(store.get(ALICE.nodeOrigin, ALICE.userId)).resolves.toBeUndefined();
  });
});

describe('FileCredentialStore', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-credstore-'));
    path = join(dir, 'nested', 'credentials.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to construct without explicit opt-in', () => {
    expect(() => new FileCredentialStore({ allowInsecure: false, path })).toThrow(
      /allow-insecure-credential-file/,
    );
  });

  it('warns on construction', () => {
    const warnings: string[] = [];
    const store = new FileCredentialStore({
      allowInsecure: true,
      path,
      warn: (m) => warnings.push(m),
    });
    expect(store).toBeInstanceOf(FileCredentialStore);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('plaintext');
  });

  it('persists to disk with mode 0600', async () => {
    const store = new FileCredentialStore({ allowInsecure: true, path, warn: () => undefined });
    await store.set(ALICE);

    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw)).toEqual([ALICE]);

    const stats = await stat(path);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('round-trips get/set/delete/list across separate store instances (same file)', async () => {
    const first = new FileCredentialStore({ allowInsecure: true, path, warn: () => undefined });
    await first.set(ALICE);
    await first.set(BOB);

    const second = new FileCredentialStore({ allowInsecure: true, path, warn: () => undefined });
    await expect(second.get(ALICE.nodeOrigin, ALICE.userId)).resolves.toEqual(ALICE);
    await expect(second.list()).resolves.toHaveLength(2);

    await second.delete(ALICE.nodeOrigin, ALICE.userId);
    await expect(second.get(ALICE.nodeOrigin, ALICE.userId)).resolves.toBeUndefined();
    await expect(second.list()).resolves.toHaveLength(1);
  });

  it('starts empty when the file does not exist yet', async () => {
    const store = new FileCredentialStore({ allowInsecure: true, path, warn: () => undefined });
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.get('nowhere.example', 'nobody')).resolves.toBeUndefined();
  });
});
