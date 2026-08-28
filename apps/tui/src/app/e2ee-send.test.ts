/**
 * Issue #332 at the runtime level: a device is not in its own fanout, so a sent message
 * is only ever re-readable if this client wrote it to its own vault. Everything here runs
 * the real send pipeline (real X3DH/Double Ratchet against the shared fake node) over a
 * real encrypted `FileVaultStore`, then CLOSES it and opens a second sender against the
 * same bytes — the restart the in-memory local echo never survived.
 */
import { describe, expect, it } from 'vitest';

import { createVaultE2eeSender, type E2eeTransports } from './e2ee-send.js';
import { enrollThisDevice, loadStoredEnrollment } from '../e2ee/enrollment.js';
import type { LocalDeviceIdentity } from '../e2ee/local-identity.js';
import { TypedRatchetVault } from '../e2ee/ratchet-vault.js';
import {
  MemoryVaultFs,
  TEST_ACCOUNT,
  createFakeE2eeNode,
  fakeKeyring,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  registerMessagingDevice,
  type FakeE2eeNode,
} from '../e2ee/test-support.js';
import { KeyringVaultKeyProvider } from '../e2ee/vault-key-providers.js';
import { FileVaultStore, MemoryVaultStore } from '../e2ee/vault-store.js';

const CONVERSATION_ID = 'conv-332';
const NOW_MS = Date.UTC(2026, 7, 28);
const now = (): number => NOW_MS;

/** A durable vault whose bytes outlive any one store instance, so "reopen" is real. */
function durableVault(
  fs: MemoryVaultFs,
  keyring: ReturnType<typeof fakeKeyring>,
): () => TypedRatchetVault {
  return () =>
    new TypedRatchetVault(
      new FileVaultStore({
        provider: new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring: keyring.keyring }),
        account: TEST_ACCOUNT,
        path: '/vault/patches.bin',
        fileOperations: fs,
      }),
    );
}

function transportsFor(
  node: FakeE2eeNode,
  identity: LocalDeviceIdentity,
  participantActorIds: readonly string[],
): E2eeTransports {
  return {
    ...fakeMessagingSendTransport({
      node,
      actorId: identity.actorId,
      deviceId: identity.deviceId,
      participantActorIds,
      nowMs: now,
    }),
    ...fakeMessagingMailboxTransport({ node, deviceId: identity.deviceId, nowMs: now }),
  };
}

async function enrolledIdentity(node: FakeE2eeNode, actorId: string): Promise<LocalDeviceIdentity> {
  const store = new MemoryVaultStore();
  await store.open();
  const vault = new TypedRatchetVault(store);
  await enrollThisDevice({
    actorId,
    transport: fakeTransport({ actorId, node }),
    vault,
    nowMs: now,
  });
  const stored = await loadStoredEnrollment(vault, NOW_MS);
  if (stored === undefined) throw new Error('test setup: enrollment must be stored');
  registerMessagingDevice(node, stored.identity);
  return stored.identity;
}

describe('vault-backed sender — own messages survive a restart (issue #332)', () => {
  it('re-reads a sent message from the vault after the sender is closed and reopened', async () => {
    const node = createFakeE2eeNode();
    const alice = 'alice-332';
    const bob = 'bob-332';
    const fs = new MemoryVaultFs();
    const keyring = fakeKeyring();
    const openVault = durableVault(fs, keyring);

    // Alice's device identity is enrolled in its own vault; the durable vault under test
    // holds her ratchet + own-message state for this conversation.
    const aliceIdentity = await enrolledIdentity(node, alice);
    await enrolledIdentity(node, bob);
    const enrolled = {
      identity: aliceIdentity,
      transports: transportsFor(node, aliceIdentity, [alice, bob]),
    };

    const firstVault = openVault();
    const first = createVaultE2eeSender({
      account: TEST_ACCOUNT,
      allowInsecureKeyFile: false,
      vault: firstVault,
      nowMs: now,
      enrolled,
    });
    const sentRow = await first.send(CONVERSATION_ID, 'hello from alice');
    expect(sentRow).toMatchObject({ body: 'hello from alice', sentByViewer: true });
    // An injected vault is not owned by the sender, so the test releases the file lock the
    // way the app's own lifecycle would — a second store cannot open while the first holds it.
    first.close();
    firstVault.close();

    const secondVault = openVault();
    const second = createVaultE2eeSender({
      account: TEST_ACCOUNT,
      allowInsecureKeyFile: false,
      vault: secondVault,
      nowMs: now,
      enrolled: {
        identity: aliceIdentity,
        transports: transportsFor(node, aliceIdentity, [alice, bob]),
      },
    });
    const reopened = await second.pollMailbox(CONVERSATION_ID);
    second.close();
    secondVault.close();

    // Nothing was redelivered — Alice is not in her own fanout — so this row can only
    // have come from the vault.
    expect(reopened.rows).toEqual([
      {
        kind: 'message',
        id: sentRow.id,
        senderLabel: 'you',
        body: 'hello from alice',
        sentByViewer: true,
      },
    ]);
  });

  it('keeps a failed send, marked undelivered, instead of losing the text', async () => {
    const node = createFakeE2eeNode();
    const alice = 'alice-332b';
    const bob = 'bob-332b';
    const fs = new MemoryVaultFs();
    const keyring = fakeKeyring();
    const openVault = durableVault(fs, keyring);

    const aliceIdentity = await enrolledIdentity(node, alice);
    await enrolledIdentity(node, bob);
    const broken: E2eeTransports = {
      ...transportsFor(node, aliceIdentity, [alice, bob]),
      sendEnvelopes: () => Promise.reject(new Error('network is down')),
    };

    const firstVault = openVault();
    const first = createVaultE2eeSender({
      account: TEST_ACCOUNT,
      allowInsecureKeyFile: false,
      vault: firstVault,
      nowMs: now,
      enrolled: { identity: aliceIdentity, transports: broken },
    });
    await expect(first.send(CONVERSATION_ID, 'never left the device')).rejects.toThrow();
    first.close();
    firstVault.close();

    const secondVault = openVault();
    const second = createVaultE2eeSender({
      account: TEST_ACCOUNT,
      allowInsecureKeyFile: false,
      vault: secondVault,
      nowMs: now,
      enrolled: {
        identity: aliceIdentity,
        transports: transportsFor(node, aliceIdentity, [alice, bob]),
      },
    });
    const reopened = await second.pollMailbox(CONVERSATION_ID);
    second.close();
    secondVault.close();

    expect(reopened.rows).toHaveLength(1);
    const [row] = reopened.rows;
    if (row?.kind !== 'message') throw new Error('expected the stored own-message row');
    expect(row).toEqual({
      kind: 'message',
      id: row.id,
      senderLabel: 'you',
      body: 'never left the device',
      sentByViewer: true,
      deliveryFailed: true,
    });
    // The send never reached the node, so no envelope id exists: the id can only be the
    // locally minted own-message one.
    expect(row.id.startsWith('own:')).toBe(true);
  });
});
