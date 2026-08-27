/**
 * Two-device interop + convergence (issue #273 part a, issue #277) — web port of the TUI
 * suite: actor A bootstrap-enrolls A1, links a second device A2 (ADR 0037 §1), and actor B
 * bootstrap-enrolls B1 — all through the same public runtime API a real client uses
 * (`enrollThisDevice`, `beginDeviceLinkOffer`/`listLinkOffers`/`approveLinkOffer`/
 * `pollLinkedEnrollment`/`revokeLinkedDevice`), against the shared in-memory fake node
 * (`test-support.js`).
 *
 * The second case below exercises the full own-device-fanout + roster-convergence + revocation
 * path (#273 steps 3–4): `E2eeSessionRuntime` now refreshes each device's own roster from the
 * vault (`refreshOwnRoster`, `device-link.ts`) before every send/receive, converging every own
 * device on the SAME served roster digest a peer that fetched it fresh binds into the X3DH
 * handshake transcript — the digest mismatch this case used to pin (issue #277's Sesame gap) no
 * longer occurs.
 */
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { activeDeviceIds, assertRosterNotRolledBack } from '@patches/domain';

import { rosterViewFromWire } from './chain.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  E2EE_DEVICE_REVOKED_COPY,
  listLinkOffers,
  pollLinkedEnrollment,
  revokeLinkedDevice,
} from './device-link.js';
import { enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import { createRatchetSessionVault, type RatchetSessionVault } from './vault.js';
import {
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  memoryVault,
  registerMessagingDevice,
} from './test-support.js';

const ACTOR_A = 'actor-a';
const ACTOR_B = 'actor-b';
const CONV = 'conv-a-b';

let vaultCounter = 0;

/** One device's own vault (issue #277: `E2eeSessionRuntime` needs the real ratchet
 * session storage, not the opaque-record-only `memoryVault()` double) — a fresh
 * `actorId` per call isolates each device's storage inside the shared `fake-indexeddb`
 * instance this test process uses (mirrors `runtime-session.test.ts`'s `freshId`). */
async function openVault(): Promise<RatchetSessionVault> {
  vaultCounter += 1;
  return createRatchetSessionVault({
    account: {
      origin: 'https://node.example',
      actorId: `two-device-interop-${String(vaultCounter)}`,
    },
  });
}

describe('two-device E2EE interop (#273)', () => {
  it('links a second device end to end (SAS equal, roster converges to sequence 2, no root key on the new device)', async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    // --- 1: A bootstrap-enrolls A1; B bootstrap-enrolls B1. ---
    const transportA1 = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA1 = memoryVault();
    const outcomeA1 = await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    expect(outcomeA1.status).toBe('enrolled');

    const transportB1 = fakeTransport({ actorId: ACTOR_B, node });
    const vaultB1 = memoryVault();
    const outcomeB1 = await enrollThisDevice({
      actorId: ACTOR_B,
      transport: transportB1,
      vault: vaultB1,
      nowMs: now,
    });
    expect(outcomeB1.status).toBe('enrolled');

    const storedA1BeforeLink = await loadStoredEnrollment(vaultA1, now());
    if (storedA1BeforeLink === undefined) throw new Error('A1 must have a stored enrollment');
    const rosterSeq1Wire = await transportA1.getDeviceRoster(ACTOR_A);
    if (rosterSeq1Wire.roster === undefined) throw new Error('A must have a served roster');
    const rosterSeq1View = rosterViewFromWire(rosterSeq1Wire.roster);
    expect(rosterSeq1View.sequence).toBe(1n);

    // --- 2: A links a second device A2 (begin -> list -> SAS -> approve -> poll). ---
    const transportA2 = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA2 = memoryVault();

    const begin = await beginDeviceLinkOffer({
      actorId: ACTOR_A,
      transport: transportA2,
      vault: vaultA2,
      nowMs: now,
    });
    const offers = await listLinkOffers({
      actorId: ACTOR_A,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    expect(offers).toHaveLength(1);
    expect(offers[0]?.linkId).toBe(begin.linkId);
    // The SAS is independently re-derived on each side from the same authenticated offer bytes
    // (ADR 0037 §1 step 2/§3.3): both must agree before the authority approves.
    expect(offers[0]?.sas).toBe(begin.sas);

    const approval = await approveLinkOffer({
      actorId: ACTOR_A,
      linkId: begin.linkId,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    expect(approval.rosterSequence).toBe(2n);

    const pollResult = await pollLinkedEnrollment({
      actorId: ACTOR_A,
      transport: transportA2,
      vault: vaultA2,
      nowMs: now,
    });
    expect(pollResult).toBe('enrolled');

    const storedA2 = await loadStoredEnrollment(vaultA2, now());
    if (storedA2 === undefined) throw new Error('A2 must have a stored enrollment after linking');
    // A2 holds no root private key: linking never moves the root (ADR 0037 §1).
    expect(storedA2.rootPrivate).toBeUndefined();
    expect(storedA2.identity.ownRoster.sequence).toBe(2);
    expect(storedA2.identity.ownRoster.entries.every((entry) => entry.active)).toBe(true);
    expect(storedA2.identity.ownRoster.entries.map((entry) => entry.deviceId).sort()).toEqual(
      [storedA1BeforeLink.identity.deviceId, storedA2.identity.deviceId].sort(),
    );

    // A's served roster is sequence 2 with both devices active.
    const rosterSeq2Wire = await transportA1.getDeviceRoster(ACTOR_A);
    if (rosterSeq2Wire.roster === undefined) throw new Error('A must have a served roster');
    const rosterSeq2View = rosterViewFromWire(rosterSeq2Wire.roster);
    expect(rosterSeq2View.sequence).toBe(2n);
    expect(rosterSeq2View.entries.every((entry) => entry.active)).toBe(true);
    expect(activeDeviceIds(rosterSeq2View)).toEqual(
      [storedA1BeforeLink.identity.deviceId, storedA2.identity.deviceId].sort(),
    );

    // --- 5: a roster served at a lower sequence than already verified is a rollback. ---
    expect(() => assertRosterNotRolledBack(rosterSeq2View.sequence, rosterSeq1View)).toThrow();
    // Equal or newer is fine (a re-fetch, or genuine forward progress).
    expect(() => assertRosterNotRolledBack(rosterSeq1View.sequence, rosterSeq2View)).not.toThrow();
    expect(() => assertRosterNotRolledBack(rosterSeq2View.sequence, rosterSeq2View)).not.toThrow();
  });

  it("own-device fanout + roster convergence end to end (#273/#277): B1 reaches both of A's devices, A1 replies, A1 revokes A2, and A2 refuses to send afterward", async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transportA1 = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA1 = await openVault();
    await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    const storedA1 = await loadStoredEnrollment(vaultA1, now());
    if (storedA1 === undefined) throw new Error('A1 must have a stored enrollment');
    registerMessagingDevice(node, storedA1.identity);

    const transportB1 = fakeTransport({ actorId: ACTOR_B, node });
    const vaultB1 = await openVault();
    await enrollThisDevice({
      actorId: ACTOR_B,
      transport: transportB1,
      vault: vaultB1,
      nowMs: now,
    });
    const storedB1 = await loadStoredEnrollment(vaultB1, now());
    if (storedB1 === undefined) throw new Error('B1 must have a stored enrollment');
    registerMessagingDevice(node, storedB1.identity);

    const transportA2 = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA2 = await openVault();
    const begin = await beginDeviceLinkOffer({
      actorId: ACTOR_A,
      transport: transportA2,
      vault: vaultA2,
      nowMs: now,
    });
    const approval = await approveLinkOffer({
      actorId: ACTOR_A,
      linkId: begin.linkId,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    expect(approval.rosterSequence).toBe(2n);
    const pollResult = await pollLinkedEnrollment({
      actorId: ACTOR_A,
      transport: transportA2,
      vault: vaultA2,
      nowMs: now,
    });
    expect(pollResult).toBe('enrolled');
    const storedA2 = await loadStoredEnrollment(vaultA2, now());
    if (storedA2 === undefined) throw new Error('A2 must have a stored enrollment after linking');
    registerMessagingDevice(node, storedA2.identity);

    // #277: `approveLinkOffer` must have persisted A1's own roster forward to sequence 2 too —
    // not just the new device's.
    const storedA1AfterLink = await loadStoredEnrollment(vaultA1, now());
    if (storedA1AfterLink === undefined) throw new Error('A1 must still have a stored enrollment');
    expect(storedA1AfterLink.identity.ownRoster.sequence).toBe(2);

    const runtimeA1 = new E2eeSessionRuntime({
      vault: vaultA1,
      identity: storedA1AfterLink.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: ACTOR_A,
        deviceId: storedA1.identity.deviceId,
        participantActorIds: [ACTOR_A, ACTOR_B],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedA1.identity.deviceId,
        nowMs: now,
      }),
      transport: transportA1,
      refreshIntervalMs: 0,
      nowMs: now,
    });
    const runtimeA2 = new E2eeSessionRuntime({
      vault: vaultA2,
      identity: storedA2.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: ACTOR_A,
        deviceId: storedA2.identity.deviceId,
        participantActorIds: [ACTOR_A, ACTOR_B],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedA2.identity.deviceId,
        nowMs: now,
      }),
      transport: transportA2,
      refreshIntervalMs: 0,
      nowMs: now,
    });
    const runtimeB1 = new E2eeSessionRuntime({
      vault: vaultB1,
      identity: storedB1.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: ACTOR_B,
        deviceId: storedB1.identity.deviceId,
        participantActorIds: [ACTOR_A, ACTOR_B],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedB1.identity.deviceId,
        nowMs: now,
      }),
      transport: transportB1,
      refreshIntervalMs: 0,
      nowMs: now,
    });

    // --- 3: B1 sends; the own-device fanout reaches both of A's active devices, and both
    // decrypt the identical plaintext (the fake node records the actual recipient device ids). ---
    await runtimeB1.send(CONV, 'hello A', 'req-b-1');
    expect(node.mailboxesByDevice.get(storedA1.identity.deviceId) ?? []).toHaveLength(1);
    expect(node.mailboxesByDevice.get(storedA2.identity.deviceId) ?? []).toHaveLength(1);

    const pollA1First = await runtimeA1.pollMailbox({ conversationId: CONV });
    expect(pollA1First.error).toBeUndefined();
    expect(pollA1First.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'hello A', senderLabel: `@${ACTOR_B}` }),
    ]);
    const pollA2First = await runtimeA2.pollMailbox({ conversationId: CONV });
    expect(pollA2First.error).toBeUndefined();
    expect(pollA2First.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'hello A', senderLabel: `@${ACTOR_B}` }),
    ]);

    // --- 4: A1 replies; it lands on B1, and A2 receives A1's own-device copy. ---
    await runtimeA1.send(CONV, 'hi B', 'req-a1-1');
    expect(node.mailboxesByDevice.get(storedB1.identity.deviceId) ?? []).toHaveLength(1);
    expect(node.mailboxesByDevice.get(storedA2.identity.deviceId) ?? []).toHaveLength(1);

    const pollB1 = await runtimeB1.pollMailbox({ conversationId: CONV });
    expect(pollB1.error).toBeUndefined();
    expect(pollB1.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'hi B', senderLabel: `@${ACTOR_A}` }),
    ]);
    const pollA2Second = await runtimeA2.pollMailbox({ conversationId: CONV });
    expect(pollA2Second.error).toBeUndefined();
    expect(pollA2Second.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'hi B', senderLabel: 'you' }),
    ]);

    // --- 5: A1 (authority) revokes A2. ---
    const revocation = await revokeLinkedDevice({
      actorId: ACTOR_A,
      deviceId: storedA2.identity.deviceId,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    expect(revocation.rosterSequence).toBe(3n);

    // --- 6: B1's next send addresses only A1 — the node's active roster for A dropped A2. ---
    await runtimeB1.send(CONV, 'still here?', 'req-b-2');
    expect(node.mailboxesByDevice.get(storedA1.identity.deviceId) ?? []).toHaveLength(1);
    // A2's mailbox stays empty (step 4's message was already drained by `pollA2Second` above):
    // A2 is no longer a fanout target, so nothing new arrives for it either.
    expect(node.mailboxesByDevice.get(storedA2.identity.deviceId) ?? []).toHaveLength(0);

    // --- 7: A2's own runtime observes the revocation on its next roster refresh and refuses
    // to send, producing no envelope. ---
    await expect(runtimeA2.send(CONV, 'can I still talk?', 'req-a2-1')).rejects.toThrow(
      E2EE_DEVICE_REVOKED_COPY,
    );
  });
});
