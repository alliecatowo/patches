/**
 * Two-device interop + convergence (issue #273 part a): actor A bootstrap-enrolls A1, links a
 * second device A2 (ADR 0037 §1), and actor B bootstrap-enrolls B1 — all through the same public
 * runtime API a real client uses (`enrollThisDevice`, `beginDeviceLinkOffer`/`listLinkOffers`/
 * `approveLinkOffer`/`pollLinkedEnrollment`), against the shared in-memory fake node
 * (`test-support.js`).
 *
 * Steps 3 (own-device fanout: B1 sends one message that both A1 and A2 decrypt) and 4 (A1
 * revokes A2, B1's next send addresses only A1, A2 refuses to send) are NOT implemented here —
 * both are blocked by missing public API, not stubbed around:
 *
 *   - Step 3 fails closed for a real reason, asserted below: `enrollThisDevice`'s signed prekey
 *     bundle (`local-identity.ts`'s `selfPrekeyBundle`, called from `enrollment.ts`'s
 *     `generateEnrollment`) commits to the roster digest AT THE MOMENT the bundle is signed.
 *     `apps/tui/src/e2ee/` has no exported function that re-signs and republishes a device's own
 *     prekey bundle after a later roster change (e.g. `approveLinkOffer` adding A2) — so once A2
 *     links, A1's already-signed bundle keeps citing the pre-link (sequence 1) roster digest
 *     forever, and `@patches/crypto`'s `initiateX3dh` → `assertBundleMatchesRoster`
 *     (`packages/crypto/src/x3dh.ts:134-142`) rejects any handshake against it as soon as the
 *     node's served roster moves past sequence 1 — even though A1 was never revoked. This is
 *     reproduced exactly below.
 *   - Step 4 additionally needs a function that signs a NEW roster revoking exactly one device
 *     while leaving others active. `apps/tui/src/e2ee/device-link.ts` has no such export:
 *     `rotateMessagingRoot` is the closest analog, but it mints an entirely new root generation
 *     and marks EVERY existing device inactive (full identity rotation, ADR 0037 §2), not a
 *     single-device revoke. `RevokeDeviceRequest.roster` (packages/proto/src/generated/patches/
 *     v1/e2ee.ts) documents that the caller must supply this root-signed roster; the TUI's own
 *     `DevicesScreen.tsx` `revokeDevice` calls `api.revokeDevice({ deviceId }, accessToken)` with
 *     no roster at all, so the real client path itself does not build one anywhere.
 */
import { describe, expect, it } from 'vitest';

import { activeDeviceIds, assertRosterNotRolledBack } from '@patches/domain';

import { rosterViewFromWire } from './chain.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  listLinkOffers,
  pollLinkedEnrollment,
} from './device-link.js';
import { enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import { TypedRatchetVault } from './ratchet-vault.js';
import { MemoryVaultStore } from './vault-store.js';
import {
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  registerMessagingDevice,
} from './test-support.js';

const ACTOR_A = 'actor-a';
const ACTOR_B = 'actor-b';
const CONV = 'conv-a-b';

async function openVault(): Promise<TypedRatchetVault> {
  const store = new MemoryVaultStore();
  await store.open();
  return new TypedRatchetVault(store);
}

describe('two-device E2EE interop (#273)', () => {
  it('links a second device end to end (SAS equal, roster converges to sequence 2, no root key on the new device)', async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    // --- 1: A bootstrap-enrolls A1; B bootstrap-enrolls B1. ---
    const transportA1 = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA1 = await openVault();
    const outcomeA1 = await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA1,
      vault: vaultA1,
      nowMs: now,
    });
    expect(outcomeA1.status).toBe('enrolled');

    const transportB1 = fakeTransport({ actorId: ACTOR_B, node });
    const vaultB1 = await openVault();
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
    const vaultA2 = await openVault();

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

  it('blocks the own-device fanout after linking: A1 cannot complete X3DH because its signed prekey bundle still commits to the pre-link roster digest, and no public API re-signs it', async () => {
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
    // Registers A1's bundle exactly as `enrollThisDevice` signed it — at roster sequence 1.
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
      nowMs: now,
    });

    // B1's fanout plan already covers both of A's active devices (own-device fanout is
    // server-side, computed here from the node's current roster) — the send fails on the crypto
    // layer, not on target selection.
    await expect(runtimeB1.send(CONV, 'hello A', 'req-b-1')).rejects.toThrow(
      'Cryptographic authentication failed.',
    );
    // Nothing reached either of A's mailboxes: the whole fanout fails closed together, it does
    // not partially deliver to A2 while silently dropping A1.
    expect(node.mailboxesByDevice.get(storedA1.identity.deviceId) ?? []).toHaveLength(0);
    expect(node.mailboxesByDevice.get(storedA2.identity.deviceId) ?? []).toHaveLength(0);
  });
});
