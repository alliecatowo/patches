/**
 * Own-message vault store (issue #332): the round trip, the failed-send marking, the
 * fail-closed behavior on a record that will not decode, and — the point of the whole
 * store — survival of a page reload in real (faked) IndexedDB.
 */
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { IndexedDbRatchetVaultStore, TypedRatchetVault } from './vault.js';
import {
  OWN_MESSAGE_RETENTION,
  loadOwnMessages,
  mergeOwnMessages,
  ownMessageRowId,
  recordOwnMessage,
} from './own-messages.js';
import { memoryVault } from './test-support.js';
import { VaultCorruptionError } from './vault-errors.js';

describe('own-message vault store', () => {
  it('round-trips a sent message and keeps conversations separate', async () => {
    const vault = memoryVault();
    await recordOwnMessage(vault, 'conv-a', {
      clientMessageId: 'cid-1',
      body: 'first',
      sentAtMs: 10,
      deliveryState: 'sent',
    });
    await recordOwnMessage(vault, 'conv-b', {
      clientMessageId: 'cid-2',
      body: 'elsewhere',
      sentAtMs: 20,
      deliveryState: 'sent',
    });

    expect(await loadOwnMessages(vault, 'conv-a')).toEqual([
      { clientMessageId: 'cid-1', body: 'first', sentAtMs: 10, deliveryState: 'sent' },
    ]);
    expect((await loadOwnMessages(vault, 'conv-b')).map((row) => row.body)).toEqual(['elsewhere']);
    expect(await loadOwnMessages(vault, 'conv-c')).toEqual([]);
  });

  it('orders by send time and updates in place by client message id', async () => {
    const vault = memoryVault();
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-late',
      body: 'later',
      sentAtMs: 200,
      deliveryState: 'sent',
    });
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-early',
      body: 'earlier',
      sentAtMs: 100,
      deliveryState: 'failed',
    });
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-early',
      body: 'earlier',
      sentAtMs: 100,
      deliveryState: 'sent',
    });

    const stored = await loadOwnMessages(vault, 'conv');
    expect(stored.map((row) => row.clientMessageId)).toEqual(['cid-early', 'cid-late']);
    expect(stored.every((row) => row.deliveryState === 'sent')).toBe(true);
  });

  it('marks a failed send and renders it as an undelivered row', async () => {
    const vault = memoryVault();
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-fail',
      body: 'never left',
      sentAtMs: 5,
      deliveryState: 'failed',
    });

    const [row] = mergeOwnMessages(await loadOwnMessages(vault, 'conv'), []);
    expect(row).toEqual({
      kind: 'message',
      id: ownMessageRowId('cid-fail'),
      senderLabel: 'you',
      body: 'never left',
      sentByViewer: true,
      deliveryFailed: true,
    });
  });

  it('keeps the newest entries once retention is exceeded', async () => {
    const vault = memoryVault();
    for (let index = 0; index < OWN_MESSAGE_RETENTION + 3; index += 1) {
      await recordOwnMessage(vault, 'conv', {
        clientMessageId: `cid-${String(index)}`,
        body: `m${String(index)}`,
        sentAtMs: index,
        deliveryState: 'sent',
      });
    }
    const stored = await loadOwnMessages(vault, 'conv');
    expect(stored).toHaveLength(OWN_MESSAGE_RETENTION);
    expect(stored[0]?.clientMessageId).toBe('cid-3');
  });

  it('merges own rows ahead of drained rows and never duplicates an already-drained id', async () => {
    const vault = memoryVault();
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-1',
      body: 'mine',
      sentAtMs: 1,
      deliveryState: 'sent',
    });
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-2',
      body: 'also mine',
      sentAtMs: 2,
      deliveryState: 'sent',
    });
    const own = await loadOwnMessages(vault, 'conv');

    const merged = mergeOwnMessages(own, [
      {
        kind: 'message' as const,
        id: ownMessageRowId('cid-2'),
        senderLabel: 'you',
        body: 'also mine',
        sentByViewer: true,
      },
      {
        kind: 'message' as const,
        id: 'envelope-1',
        senderLabel: '@peer',
        body: 'theirs',
        sentByViewer: false,
      },
    ]);

    expect(merged.map((row) => row.id)).toEqual([
      ownMessageRowId('cid-1'),
      ownMessageRowId('cid-2'),
      'envelope-1',
    ]);
  });

  it('fails closed rather than reporting an empty history for an undecodable record', async () => {
    const vault = memoryVault();
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-1',
      body: 'mine',
      sentAtMs: 1,
      deliveryState: 'sent',
    });
    for (const [key, value] of vault.records) {
      value[0] = 99;
      vault.records.set(key, value);
    }

    await expect(loadOwnMessages(vault, 'conv')).rejects.toBeInstanceOf(VaultCorruptionError);
  });

  it('is erased by a vault wipe', async () => {
    const vault = memoryVault();
    await recordOwnMessage(vault, 'conv', {
      clientMessageId: 'cid-1',
      body: 'mine',
      sentAtMs: 1,
      deliveryState: 'sent',
    });
    await vault.wipe();

    expect(await loadOwnMessages(vault, 'conv')).toEqual([]);
  });

  it('survives a page reload: a closed and reopened IndexedDB vault still holds it', async () => {
    // A device is never in its own fanout, so nothing will redeliver this message — a row
    // read back from a second store instance can only have come from durable storage.
    const account = { origin: 'https://node.example', actorId: 'actor-own-messages' };
    const first = new TypedRatchetVault(new IndexedDbRatchetVaultStore({ account }));
    await first.open();
    await recordOwnMessage(first, 'conv', {
      clientMessageId: 'cid-1',
      body: 'written before the reload',
      sentAtMs: 1,
      deliveryState: 'sent',
    });
    first.close();

    const second = new TypedRatchetVault(new IndexedDbRatchetVaultStore({ account }));
    await second.open();
    const merged = mergeOwnMessages(await loadOwnMessages(second, 'conv'), []);
    second.close();

    expect(merged).toEqual([
      {
        kind: 'message',
        id: ownMessageRowId('cid-1'),
        senderLabel: 'you',
        body: 'written before the reload',
        sentByViewer: true,
      },
    ]);
  });
});
