/**
 * Inbound-message vault store (issue #352): the round trip, dedupe by envelope id,
 * retention, fail-closed behavior on a record that will not decode, and — the point of
 * the whole store — the received half of a conversation surviving a page reload in real
 * (faked) IndexedDB, where the drained rows are the only copy (the mailbox acknowledges
 * them).
 */
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { IndexedDbRatchetVaultStore, TypedRatchetVault } from './vault.js';
import {
  INBOUND_MESSAGE_RETENTION,
  inboundMessageRow,
  inboundMessagesToRecords,
  loadInboundMessages,
  mergeInboundMessages,
  recordInboundMessages,
} from './inbound-messages.js';
import { memoryVault } from './test-support.js';
import { VaultCorruptionError } from './vault-errors.js';

describe('inbound-message vault store', () => {
  it('round-trips received messages and keeps conversations separate', async () => {
    const vault = memoryVault();
    await recordInboundMessages(vault, 'conv-a', [
      { id: 'env-1', senderLabel: '@peer', body: 'first' },
    ]);
    await recordInboundMessages(vault, 'conv-b', [
      { id: 'env-2', senderLabel: '@other', body: 'elsewhere' },
    ]);

    expect(await loadInboundMessages(vault, 'conv-a')).toEqual([
      { id: 'env-1', senderLabel: '@peer', body: 'first' },
    ]);
    expect((await loadInboundMessages(vault, 'conv-b')).map((row) => row.body)).toEqual([
      'elsewhere',
    ]);
    expect(await loadInboundMessages(vault, 'conv-c')).toEqual([]);
  });

  it('dedupes by envelope id across drains and never renders a replay twice', async () => {
    const vault = memoryVault();
    await recordInboundMessages(vault, 'conv', [
      { id: 'env-1', senderLabel: '@peer', body: 'first' },
    ]);
    // A lost-acknowledgement replay (or a re-drain after a transient fault) redelivers
    // the same envelope id — it must not be stored twice.
    await recordInboundMessages(vault, 'conv', [
      { id: 'env-1', senderLabel: '@peer', body: 'first' },
      { id: 'env-2', senderLabel: '@peer', body: 'second' },
    ]);

    expect((await loadInboundMessages(vault, 'conv')).map((row) => row.id)).toEqual([
      'env-1',
      'env-2',
    ]);
  });

  it('filters drains to received message rows only', () => {
    expect(
      inboundMessagesToRecords([
        { kind: 'message', id: 'env-1', senderLabel: '@peer', body: 'theirs', sentByViewer: false },
        { kind: 'message', id: 'own:cid', senderLabel: 'you', body: 'mine', sentByViewer: true },
        { kind: 'quarantined', id: 'env-2', reason: 'undecryptable' },
      ]),
    ).toEqual([{ id: 'env-1', senderLabel: '@peer', body: 'theirs' }]);
  });

  it('merges a later drain after stored rows, newest retained', async () => {
    const vault = memoryVault();
    const merged = mergeInboundMessages(
      [{ id: 'env-1', senderLabel: '@peer', body: 'first' }],
      [{ id: 'env-2', senderLabel: '@peer', body: 'second' }],
    );
    expect(merged.map((row) => row.id)).toEqual(['env-1', 'env-2']);
    await recordInboundMessages(vault, 'conv', merged);
    expect((await loadInboundMessages(vault, 'conv')).map((row) => row.body)).toEqual([
      'first',
      'second',
    ]);
  });

  it('keeps the newest entries once retention is exceeded', async () => {
    const vault = memoryVault();
    const records = Array.from({ length: INBOUND_MESSAGE_RETENTION + 3 }, (_, index) => ({
      id: `env-${String(index)}`,
      senderLabel: '@peer',
      body: `m${String(index)}`,
    }));
    await recordInboundMessages(vault, 'conv', records);
    const stored = await loadInboundMessages(vault, 'conv');
    expect(stored).toHaveLength(INBOUND_MESSAGE_RETENTION);
    expect(stored[0]?.id).toBe('env-3');
  });

  it('maps a stored record back to a render-ready, non-viewer row', () => {
    expect(inboundMessageRow({ id: 'env-1', senderLabel: '@peer', body: 'theirs' })).toEqual({
      kind: 'message',
      id: 'env-1',
      senderLabel: '@peer',
      body: 'theirs',
      sentByViewer: false,
    });
  });

  it('fails closed rather than reporting an empty history for an undecodable record', async () => {
    const vault = memoryVault();
    await recordInboundMessages(vault, 'conv', [
      { id: 'env-1', senderLabel: '@peer', body: 'theirs' },
    ]);
    for (const [key, value] of vault.records) {
      value[0] = 99;
      vault.records.set(key, value);
    }

    await expect(loadInboundMessages(vault, 'conv')).rejects.toBeInstanceOf(VaultCorruptionError);
  });

  it('is erased by a vault wipe', async () => {
    const vault = memoryVault();
    await recordInboundMessages(vault, 'conv', [
      { id: 'env-1', senderLabel: '@peer', body: 'theirs' },
    ]);
    await vault.wipe();

    expect(await loadInboundMessages(vault, 'conv')).toEqual([]);
  });

  it('survives a page reload: a closed and reopened IndexedDB vault still holds it', async () => {
    // The drain acknowledged this envelope, so nothing will redeliver it — a row read
    // back from a second store instance can only have come from durable storage.
    const account = { origin: 'https://node.example', actorId: 'actor-inbound-messages' };
    const first = new TypedRatchetVault(new IndexedDbRatchetVaultStore({ account }));
    await first.open();
    await recordInboundMessages(first, 'conv', [
      { id: 'env-1', senderLabel: '@peer', body: 'received before the reload' },
    ]);
    first.close();

    const second = new TypedRatchetVault(new IndexedDbRatchetVaultStore({ account }));
    await second.open();
    const rows = (await loadInboundMessages(second, 'conv')).map(inboundMessageRow);
    second.close();

    expect(rows).toEqual([
      {
        kind: 'message',
        id: 'env-1',
        senderLabel: '@peer',
        body: 'received before the reload',
        sentByViewer: false,
      },
    ]);
  });
});
