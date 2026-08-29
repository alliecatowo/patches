/**
 * Inbound-message vault store (issue #352): the round trip, dedupe by envelope id,
 * retention, fail-closed behavior on a record that will not decode, and — the point of
 * the whole store — the received half of a conversation surviving a restart, where the
 * drained rows are the only copy (the mailbox acknowledges them).
 */
import { describe, expect, it } from 'vitest';

import { createRatchetSessionVault } from './ratchet-vault.js';
import {
  INBOUND_MESSAGE_RETENTION,
  inboundMessageRow,
  inboundMessagesToRecords,
  loadInboundMessages,
  mergeInboundMessages,
  recordInboundMessages,
} from './inbound-messages.js';
import { MemoryVaultFs, TEST_ACCOUNT, fakeKeyring, memoryVault } from './test-support.js';
import { VaultCorruptionError } from './vault-errors.js';

const VAULT_PATH = '/cfg/patches/e2ee/inbound-test.vault';

function durableVault(fs: MemoryVaultFs, keyring: ReturnType<typeof fakeKeyring>) {
  return {
    open: () =>
      createRatchetSessionVault({
        account: TEST_ACCOUNT,
        allowInsecureKeyFile: false,
        vaultPath: VAULT_PATH,
        fileOperations: fs,
        keyring: keyring.keyring,
      }),
  };
}

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

  it('merges a later drain after stored rows', () => {
    const merged = mergeInboundMessages(
      [{ id: 'env-1', senderLabel: '@peer', body: 'first' }],
      [{ id: 'env-2', senderLabel: '@peer', body: 'second' }],
    );
    expect(merged.map((row) => row.id)).toEqual(['env-1', 'env-2']);
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

  it('survives a restart: a reopened durable vault still holds a received message', async () => {
    // The drain acknowledged this envelope, so nothing will redeliver it — a row read
    // back from a second vault instance can only have come from durable storage.
    const fs = new MemoryVaultFs();
    const keyring = fakeKeyring();
    const first = durableVault(fs, keyring);
    const vault = await first.open();
    await vault.open();
    await recordInboundMessages(vault, 'conv', [
      { id: 'env-1', senderLabel: '@peer', body: 'received before the restart' },
    ]);
    vault.close();

    const second = durableVault(fs, keyring);
    const reopened = await second.open();
    await reopened.open();
    const rows = (await loadInboundMessages(reopened, 'conv')).map(inboundMessageRow);
    reopened.close();

    expect(rows).toEqual([
      {
        kind: 'message',
        id: 'env-1',
        senderLabel: '@peer',
        body: 'received before the restart',
        sentByViewer: false,
      },
    ]);
  });
});
