/**
 * One-time prekey replenishment + signed-prekey rotation (ADR 0020 §5, issue #278) — web
 * port of the TUI's test, over `memoryVault()` (opaque-record only) for the enrollment-level
 * cases and `createRatchetSessionVault` (fake IndexedDB) for the runtime-level case, which
 * needs real ratchet-session persistence.
 */
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { loadStoredEnrollment, saveStoredEnrollment, enrollThisDevice } from './enrollment.js';
import { maintainPrekeys } from './prekey-maintenance.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import {
  consumeOneTimePrekeys,
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  memoryVault,
  registerMessagingDevice,
} from './test-support.js';
import { createRatchetSessionVault, type RatchetSessionVault } from './vault.js';

const ACTOR_A = 'actor-a';
const ACTOR_B = 'actor-b';
const CONV = 'conv-a-b';
const DAY_MS = 24 * 60 * 60 * 1_000;

let counter = 0;

function freshId(label: string): string {
  counter += 1;
  return `${label}-${counter}`;
}

async function openRatchetVault(actorId: string): Promise<RatchetSessionVault> {
  return createRatchetSessionVault({
    account: { origin: 'https://node.example', actorId: freshId(actorId) },
  });
}

describe('maintainPrekeys (issue #278)', () => {
  it('replenishes one-time prekeys with monotonically continuing ids once the count drops to the threshold', async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const transport = fakeTransport({ actorId: ACTOR_A, node });
    const vault = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_A, transport, vault, nowMs: now });
    const stored = await loadStoredEnrollment(vault, nowMs);
    if (stored === undefined) throw new Error('device must be enrolled');
    const deviceId = stored.identity.deviceId;

    // 100 minted at enrollment; drop to exactly the replenish threshold (20 remaining).
    consumeOneTimePrekeys(node, deviceId, 80);

    const result = await maintainPrekeys({
      identity: stored.identity,
      transport,
      vault,
      nowMs: now,
    });

    expect(result).toEqual({ replenishedOneTimePrekeys: 80, rotatedSignedPreKey: false });
    expect(transport.uploadPrekeys).toHaveBeenCalledTimes(1);
    const uploaded = transport.uploadPrekeys.mock.calls[0]?.[0];
    const uploadedIds = (uploaded?.oneTimePrekeys ?? [])
      .map((prekey) => prekey.keyId)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(uploadedIds).toEqual(
      Array.from({ length: 80 }, (_unused, index) => BigInt(101 + index)),
    );

    const restored = await loadStoredEnrollment(vault, nowMs);
    expect(restored?.nextOneTimePrekeyId).toBe(181);
    expect(restored?.pendingPrekeyUpload).toBeUndefined();
    expect(node.prekeyState.get(deviceId)?.unconsumedOneTimePrekeyIds.size).toBe(100);
  });

  it('is a no-op when the one-time prekey count is above the replenish threshold and the signed prekey is fresh', async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const transport = fakeTransport({ actorId: ACTOR_A, node });
    const vault = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_A, transport, vault, nowMs: now });
    const stored = await loadStoredEnrollment(vault, nowMs);
    if (stored === undefined) throw new Error('device must be enrolled');

    const result = await maintainPrekeys({
      identity: stored.identity,
      transport,
      vault,
      nowMs: now,
    });

    expect(result).toEqual({ replenishedOneTimePrekeys: 0, rotatedSignedPreKey: false });
    expect(transport.getPrekeyInventory).toHaveBeenCalledTimes(1);
    expect(transport.uploadPrekeys).not.toHaveBeenCalled();
  });

  it('resumes and re-uploads the exact same batch after a crash between persist and upload, never re-minting', async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const transport = fakeTransport({ actorId: ACTOR_A, node });
    const vault = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_A, transport, vault, nowMs: now });
    const stored = await loadStoredEnrollment(vault, nowMs);
    if (stored === undefined) throw new Error('device must be enrolled');
    const deviceId = stored.identity.deviceId;
    consumeOneTimePrekeys(node, deviceId, 85);

    transport.uploadPrekeys.mockImplementationOnce(() =>
      Promise.reject(new Error('simulated crash before the RPC completed')),
    );

    await expect(
      maintainPrekeys({ identity: stored.identity, transport, vault, nowMs: now }),
    ).rejects.toThrow('simulated crash');

    // The batch was already persisted before the (failed) upload — the node never saw it.
    const afterCrash = await loadStoredEnrollment(vault, nowMs);
    expect(afterCrash?.pendingPrekeyUpload?.oneTimePrekeyIds).toHaveLength(85);
    expect(node.prekeyState.get(deviceId)?.unconsumedOneTimePrekeyIds.size).toBe(15);

    // Resume: the exact same ids go out, and `getPrekeyInventory` is not consulted again —
    // this is a resume, not a fresh replenishment decision.
    transport.getPrekeyInventory.mockClear();
    const result = await maintainPrekeys({
      identity: afterCrash?.identity ?? stored.identity,
      transport,
      vault,
      nowMs: now,
    });

    expect(result).toEqual({ replenishedOneTimePrekeys: 85, rotatedSignedPreKey: false });
    expect(transport.getPrekeyInventory).not.toHaveBeenCalled();
    expect(transport.uploadPrekeys).toHaveBeenCalledTimes(2);
    const resumedIds = (transport.uploadPrekeys.mock.calls[1]?.[0]?.oneTimePrekeys ?? [])
      .map((prekey) => prekey.keyId)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(resumedIds).toEqual(
      afterCrash?.pendingPrekeyUpload?.oneTimePrekeyIds
        .slice()
        .sort((a, b) => a - b)
        .map(BigInt),
    );
    expect(node.prekeyState.get(deviceId)?.unconsumedOneTimePrekeyIds.size).toBe(100);
    const afterResume = await loadStoredEnrollment(vault, nowMs);
    expect(afterResume?.pendingPrekeyUpload).toBeUndefined();
  });

  it('prunes a retained previous signed prekey once its 30-day mailbox window has elapsed', async () => {
    const enrollMs = Date.UTC(2026, 0, 1);
    // Just past the 30-day retention window for the retained key, but well inside the 7-day
    // rotation window for the CURRENT signed prekey — isolates pruning from a concurrent
    // rotation.
    const laterMs = enrollMs + 60 * DAY_MS;
    const retiredAtMs = laterMs - 31 * DAY_MS;
    // This test isolates prekey-retention pruning from the (separately owned) device
    // certificate rotation lifecycle: the device's 30-day certificate is minted close
    // enough to `laterMs` that it is still valid there, rather than at the nominal
    // `enrollMs` this scenario's prekey math is otherwise expressed relative to.
    const certificateMintMs = laterMs - 20 * DAY_MS;
    const node = createFakeE2eeNode();
    const transport = fakeTransport({ actorId: ACTOR_A, node });
    const vault = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_A, transport, vault, nowMs: () => certificateMintMs });
    const stored = await loadStoredEnrollment(vault, certificateMintMs);
    if (stored === undefined) throw new Error('device must be enrolled');

    // Directly craft a record with an old retained signed prekey — decoupled from rotation
    // cadence, since this test only exercises the pruning threshold itself.
    const crafted = {
      ...stored,
      identity: {
        ...stored.identity,
        signedPreKey: { ...stored.identity.signedPreKey, createdAtMs: laterMs - 1 * DAY_MS },
      },
      previousSignedPreKeys: [
        {
          id: 0,
          keyPair: stored.identity.signedPreKey.keyPair,
          createdAtMs: retiredAtMs - DAY_MS,
          expiresAtMs: retiredAtMs,
          bundleBytes: stored.identity.ownBundle.bundleBytes,
          deviceSignature: stored.identity.ownBundle.deviceSignature,
          retiredAtMs,
        },
      ],
    };
    await saveStoredEnrollment(vault, crafted);

    const result = await maintainPrekeys({
      identity: crafted.identity,
      transport,
      vault,
      nowMs: () => laterMs,
    });

    expect(result).toEqual({ replenishedOneTimePrekeys: 0, rotatedSignedPreKey: false });
    const pruned = await loadStoredEnrollment(vault, laterMs);
    expect(pruned?.previousSignedPreKeys).toEqual([]);
  });

  it('rotates the signed prekey after 7 days, and the retained private key still opens an initial message sealed against the pre-rotation prekey', async () => {
    const t1 = Date.UTC(2026, 0, 1);
    const node = createFakeE2eeNode();

    const transportA = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA = await openRatchetVault(ACTOR_A);
    await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA,
      vault: vaultA,
      nowMs: () => t1,
    });
    const storedA = await loadStoredEnrollment(vaultA, t1);
    if (storedA === undefined) throw new Error('A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: ACTOR_B, node });
    const vaultB = await openRatchetVault(ACTOR_B);
    await enrollThisDevice({
      actorId: ACTOR_B,
      transport: transportB,
      vault: vaultB,
      nowMs: () => t1,
    });
    const storedB = await loadStoredEnrollment(vaultB, t1);
    if (storedB === undefined) throw new Error('B must be enrolled');
    registerMessagingDevice(node, storedB.identity);

    const runtimeA = new E2eeSessionRuntime({
      vault: vaultA,
      identity: storedA.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: ACTOR_A,
        deviceId: storedA.identity.deviceId,
        participantActorIds: [ACTOR_A, ACTOR_B],
        nowMs: () => t1,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedA.identity.deviceId,
        nowMs: () => t1,
      }),
      nowMs: () => t1,
    });

    // A initiates against B's PRE-rotation signed prekey (B's original id, minted at enrollment).
    await runtimeA.send(CONV, 'hi B', 'req-1');
    expect(node.mailboxesByDevice.get(storedB.identity.deviceId) ?? []).toHaveLength(1);

    // 8 days later, B's own maintenance rotates its signed prekey — retiring the exact one A's
    // envelope names into `previousSignedPreKeys`.
    const t2 = t1 + 8 * DAY_MS;
    const maintained = await maintainPrekeys({
      identity: storedB.identity,
      transport: transportB,
      vault: vaultB,
      nowMs: () => t2,
    });
    expect(maintained.rotatedSignedPreKey).toBe(true);

    const storedBAfterRotation = await loadStoredEnrollment(vaultB, t2);
    if (storedBAfterRotation === undefined) throw new Error('B must still be enrolled');
    expect(storedBAfterRotation.identity.signedPreKey.id).toBe(
      storedB.identity.signedPreKey.id + 1,
    );
    expect(storedBAfterRotation.previousSignedPreKeys).toHaveLength(1);
    expect(storedBAfterRotation.previousSignedPreKeys[0]?.id).toBe(
      storedB.identity.signedPreKey.id,
    );

    // B's own runtime, now holding the ROTATED identity, must still open A's already-sealed
    // initial envelope — the whole point of retaining the old private half.
    const runtimeB = new E2eeSessionRuntime({
      vault: vaultB,
      identity: storedBAfterRotation.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: ACTOR_B,
        deviceId: storedB.identity.deviceId,
        participantActorIds: [ACTOR_A, ACTOR_B],
        nowMs: () => t2,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedB.identity.deviceId,
        nowMs: () => t2,
      }),
      nowMs: () => t2,
    });
    const polled = await runtimeB.pollMailbox({ conversationId: CONV });

    expect(polled.error).toBeUndefined();
    expect(polled.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'hi B', senderLabel: `@${ACTOR_A}` }),
    ]);
  });
});
