import { describe, expect, it, vi } from 'vitest';

import {
  beginDeviceLinkOffer,
  approveLinkOffer,
  pollLinkedEnrollment,
  refreshOwnRoster,
} from './device-link.js';
import {
  ENROLLMENT_RECORD_KEY,
  enrollThisDevice,
  loadStoredEnrollment,
  isSelfCertificateExpired,
  CERTIFICATE_LIFETIME_MS,
} from './enrollment.js';
import {
  CERTIFICATE_RENEWAL_WINDOW_MS,
  RENEWAL_RECORD_KEY,
  discardExpiredIdentityKeepingHistory,
  renewDeviceIdentity,
} from './renewal.js';
import { SESSION_INDEX_KEY } from './session-index.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from './test-support.js';

const T0 = Date.UTC(2026, 0, 1);
const DAY = 24 * 60 * 60 * 1_000;
const HISTORY_KEY = '\0patches-e2ee-inbound-history-fixture';
const SESSION_KEY = 'conversation-1:peer-actor:peer-device';

async function enrolledAuthority(actorId: string) {
  const node = createFakeE2eeNode();
  const transport = fakeTransport({ actorId, node });
  const vault = memoryVault();
  const outcome = await enrollThisDevice({ actorId, transport, vault, nowMs: () => T0 });
  expect(outcome.status).toBe('enrolled');
  vault.records.set(HISTORY_KEY, new Uint8Array([1, 2, 3]));
  vault.records.set(SESSION_KEY, new Uint8Array([9, 9, 9]));
  return { node, transport, vault };
}

describe('device certificate expiry and renewal (P2-C1)', () => {
  it('keeps an expired device loadable instead of treating its record as absent', async () => {
    const { vault } = await enrolledAuthority('actor-expiry-load');
    const dayThirtyOne = T0 + 31 * DAY;
    const stored = await loadStoredEnrollment(vault, dayThirtyOne);
    // Before the fix an expired certificate made the whole record undecodable, which the
    // manager read as "not enrolled" and routed into the needs-authority/rotate flow.
    expect(stored).toBeDefined();
    expect(isSelfCertificateExpired(stored!.identity, dayThirtyOne)).toBe(true);
    expect(isSelfCertificateExpired(stored!.identity, T0 + DAY)).toBe(false);
  });

  it('does not renew a fresh certificate', async () => {
    const actorId = 'actor-not-due';
    const { transport, vault } = await enrolledAuthority(actorId);
    const outcome = await renewDeviceIdentity({ actorId, transport, vault, nowMs: () => T0 + DAY });
    expect(outcome.status).toBe('not-due');
  });

  it('replaces an expired device under the same root, keeping history and dropping ratchets', async () => {
    const actorId = 'actor-renew-expired';
    const { node, transport, vault } = await enrolledAuthority(actorId);
    const before = await loadStoredEnrollment(vault, T0);
    const now = T0 + 31 * DAY;

    const outcome = await renewDeviceIdentity({ actorId, transport, vault, nowMs: () => now });
    expect(outcome.status).toBe('renewed');
    if (outcome.status !== 'renewed') return;
    expect(outcome.revokedOld).toBe(true);

    const after = await loadStoredEnrollment(vault, now);
    expect(after).toBeDefined();
    expect(after!.identity.deviceId).not.toBe(before!.identity.deviceId);
    expect(after!.submitted).toBe(true);
    expect(after!.rootPublic).toEqual(before!.rootPublic);
    expect(after!.rootPrivate).toBeDefined();
    expect(isSelfCertificateExpired(after!.identity, now)).toBe(false);

    // History survives; the ratchet bound to the old device id does not; no pending record.
    expect(vault.records.get(HISTORY_KEY)).toEqual(new Uint8Array([1, 2, 3]));
    expect(vault.records.has(SESSION_KEY)).toBe(false);
    expect(vault.records.has(SESSION_INDEX_KEY)).toBe(false);
    expect(vault.records.has(RENEWAL_RECORD_KEY)).toBe(false);

    // The node's roster: old device inactive, new device active, sequence advanced by two.
    const served = node.rosterByActor.get(actorId)!;
    const roster = served.roster!;
    const active = roster.entries.filter((entry) => entry.active).map((entry) => entry.deviceId);
    expect(active).toEqual([after!.identity.deviceId]);
    expect(roster.entries.find((e) => e.deviceId === before!.identity.deviceId)?.active).toBe(
      false,
    );
    expect(Number(roster.sequence)).toBe(before!.identity.ownRoster.sequence + 2);
  });

  it('renews inside the window, before anything has expired', async () => {
    const actorId = 'actor-renew-early';
    const { transport, vault } = await enrolledAuthority(actorId);
    const now = T0 + CERTIFICATE_LIFETIME_MS - CERTIFICATE_RENEWAL_WINDOW_MS + DAY;
    const outcome = await renewDeviceIdentity({ actorId, transport, vault, nowMs: () => now });
    expect(outcome.status).toBe('renewed');
  });

  it('resumes a renewal whose enrollment call failed with the same device id', async () => {
    const actorId = 'actor-renew-resume';
    const { transport, vault } = await enrolledAuthority(actorId);
    const now = T0 + 31 * DAY;
    vi.mocked(transport.enrollDevice).mockRejectedValueOnce(new Error('network down'));
    await expect(
      renewDeviceIdentity({ actorId, transport, vault, nowMs: () => now }),
    ).rejects.toThrow('network down');
    // The old identity is untouched and a pending replacement is durable.
    expect((await loadStoredEnrollment(vault, now))?.submitted).toBe(true);
    expect(vault.records.has(SESSION_KEY)).toBe(true);
    const pendingBytes = vault.records.get(RENEWAL_RECORD_KEY);
    expect(pendingBytes).toBeDefined();

    const outcome = await renewDeviceIdentity({ actorId, transport, vault, nowMs: () => now });
    expect(outcome.status).toBe('renewed');
    if (outcome.status !== 'renewed') return;
    // The retry submitted the SAME pending identity rather than minting a second device.
    const submittedDeviceIds = vi
      .mocked(transport.enrollDevice)
      .mock.calls.slice(1) // call 0 is the original enrollment
      .map(([request]) => request.certificate?.deviceId);
    expect(submittedDeviceIds).toHaveLength(2);
    expect(submittedDeviceIds[1]).toBe(submittedDeviceIds[0]);
    expect(outcome.record.identity.deviceId).toBe(submittedDeviceIds[0]);
  });

  it('refuses a node that serves a different messaging root', async () => {
    const actorId = 'actor-renew-wrong-root';
    const { node, transport, vault } = await enrolledAuthority(actorId);
    const other = await enrolledAuthority('actor-renew-wrong-root');
    const foreignRoot = other.node.rootByActor.get(actorId)!;
    node.rootByActor.set(actorId, foreignRoot);
    const beforeBytes = vault.records.get(ENROLLMENT_RECORD_KEY)!.slice();

    await expect(
      renewDeviceIdentity({ actorId, transport, vault, nowMs: () => T0 + 31 * DAY }),
    ).rejects.toThrow();
    expect(vault.records.get(ENROLLMENT_RECORD_KEY)).toEqual(beforeBytes);
    expect(vault.records.has(SESSION_KEY)).toBe(true);
  });

  it('refuses a rolled-back roster from the node', async () => {
    const actorId = 'actor-renew-rollback';
    const { node, transport, vault } = await enrolledAuthority(actorId);
    // Advance the account (a second device links), then have the node serve the old roster.
    const oldServed = node.rosterByActor.get(actorId)!;
    const linkedTransport = fakeTransport({ actorId, node });
    const linkedVault = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: linkedTransport,
      vault: linkedVault,
      nowMs: () => T0,
    });
    await approveLinkOffer({
      actorId,
      linkId: begin.linkId,
      transport,
      vault,
      nowMs: () => T0,
    });
    node.rosterByActor.set(actorId, oldServed);

    await expect(
      renewDeviceIdentity({ actorId, transport, vault, nowMs: () => T0 + 31 * DAY }),
    ).rejects.toThrow(/older/);
    expect(vault.records.has(SESSION_KEY)).toBe(true);
  });

  it('a linked device cannot renew itself; the history-keeping reset leaves it re-linkable', async () => {
    const actorId = 'actor-linked-expired';
    const { node, transport, vault } = await enrolledAuthority(actorId);
    const linkedTransport = fakeTransport({ actorId, node });
    const linkedVault = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: linkedTransport,
      vault: linkedVault,
      nowMs: () => T0,
    });
    await approveLinkOffer({
      actorId,
      linkId: begin.linkId,
      transport,
      vault,
      nowMs: () => T0,
    });
    await pollLinkedEnrollment({
      actorId,
      transport: linkedTransport,
      vault: linkedVault,
      nowMs: () => T0,
    });
    linkedVault.records.set(HISTORY_KEY, new Uint8Array([7]));
    linkedVault.records.set(SESSION_KEY, new Uint8Array([8]));
    const now = T0 + 31 * DAY;

    const outcome = await renewDeviceIdentity({
      actorId,
      transport: linkedTransport,
      vault: linkedVault,
      nowMs: () => now,
    });
    expect(outcome.status).toBe('needs-relink');
    expect(linkedVault.records.has(ENROLLMENT_RECORD_KEY)).toBe(true);

    await discardExpiredIdentityKeepingHistory(linkedVault, now);
    expect(linkedVault.records.has(ENROLLMENT_RECORD_KEY)).toBe(false);
    expect(linkedVault.records.has(SESSION_KEY)).toBe(false);
    expect(linkedVault.records.get(HISTORY_KEY)).toEqual(new Uint8Array([7]));
    expect(await loadStoredEnrollment(linkedVault, now)).toBeUndefined();
  });

  it('never discards the identity of a device that holds the root key, or a live one', async () => {
    const actorId = 'actor-discard-guard';
    const { vault } = await enrolledAuthority(actorId);
    await expect(discardExpiredIdentityKeepingHistory(vault, T0 + 31 * DAY)).rejects.toThrow(
      /root key/,
    );
    expect(vault.records.has(ENROLLMENT_RECORD_KEY)).toBe(true);
    expect(vault.records.has(SESSION_KEY)).toBe(true);
  });

  it('refreshOwnRoster keeps an expired self entry active rather than reporting revocation', async () => {
    const actorId = 'actor-refresh-expired';
    const { transport, vault } = await enrolledAuthority(actorId);
    const result = await refreshOwnRoster({
      actorId,
      transport,
      vault,
      nowMs: () => T0 + 31 * DAY,
    });
    expect(result.selfActive).toBe(true);
  });
});
