/**
 * Conversation-unread vault store (issue #383): the round trip, the read-clears-the-count
 * behavior, the server-merge rule, and a locally-read conversation surviving a "restart"
 * (a fresh handle to the same underlying vault).
 */
import { describe, expect, it } from 'vitest';

import {
  clearUnread,
  loadUnread,
  mergeUnread,
  setUnread,
  type UnreadVaultAccess,
} from './conversation-unread.js';
import { VaultCorruptionError } from './vault-errors.js';

function memoryVault(): UnreadVaultAccess {
  const records = new Map<string, Uint8Array>();
  return {
    getOpaqueRecord(key: string): Promise<Uint8Array | undefined> {
      return Promise.resolve(records.get(key));
    },
    putOpaqueRecord(key: string, value: Uint8Array): Promise<void> {
      records.set(key, value);
      return Promise.resolve();
    },
  };
}

describe('conversation-unread vault store', () => {
  it('round-trips a per-conversation count and keeps conversations separate', async () => {
    const vault = memoryVault();
    await setUnread(vault, 'conv-a', 3);
    await setUnread(vault, 'conv-b', 1);

    expect(await loadUnread(vault, 'conv-a')).toBe(3);
    expect(await loadUnread(vault, 'conv-b')).toBe(1);
    expect(await loadUnread(vault, 'conv-c')).toBeUndefined();
  });

  it('clearing read sets the count to a durable 0 (survives a restart)', async () => {
    const vault = memoryVault();
    await setUnread(vault, 'conv-a', 4);
    await clearUnread(vault, 'conv-a');

    // A fresh handle to the same backing store === a restart.
    expect(await loadUnread(vault, 'conv-a')).toBe(0);
  });

  it('fails closed on a record that will not decode', async () => {
    const vault = memoryVault();
    await setUnread(vault, 'conv-a', 1);
    const key = '\0patches-e2ee-conversation-unread\0conv-a';
    const bytes = await vault.getOpaqueRecord(key);
    const corrupted = Uint8Array.from(bytes as Uint8Array);
    corrupted[0] = 0xff;
    await vault.putOpaqueRecord(key, corrupted);

    await expect(loadUnread(vault, 'conv-a')).rejects.toBeInstanceOf(VaultCorruptionError);
  });

  it('mergeUnread: local record is authoritative once present, server is the bootstrap', () => {
    expect(mergeUnread(5, undefined)).toBe(5);
    expect(mergeUnread(0, undefined)).toBe(0);
    // Locally read through -> 0 even if the server still reports unread.
    expect(mergeUnread(5, 0)).toBe(0);
    // Locally-derived unread survives independently of a stale server count.
    expect(mergeUnread(2, 3)).toBe(3);
    expect(mergeUnread(-1, undefined)).toBe(0);
    expect(mergeUnread(-1, -2)).toBe(0);
  });
});
