import { activeDeviceIds, assertRosterSucceeds } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { rosterViewFromWire } from './chain.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  DeviceLinkError,
  listLinkOffers,
  pollLinkedEnrollment,
  refreshOwnRoster,
  revokeLinkedDevice,
  rotateMessagingRoot,
} from './device-link.js';
import { enrollThisDevice, loadStoredEnrollment, saveStoredEnrollment } from './enrollment.js';
import { createFakeE2eeNode, fakeTransport, memoryVault, setFakeRoster } from './test-support.js';

describe('device-link (ADR 0037)', () => {
  it('links a second device end to end: begin -> list -> approve -> poll', async () => {
    const actorId = 'actor-link';
    let nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transportA = fakeTransport({ actorId, node });
    const vaultA = memoryVault();
    const outcomeA = await enrollThisDevice({
      actorId,
      transport: transportA,
      vault: vaultA,
      nowMs: now,
    });
    expect(outcomeA.status).toBe('enrolled');

    const transportB = fakeTransport({ actorId, node });
    const vaultB = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: transportB,
      vault: vaultB,
      nowMs: now,
    });

    const offers = await listLinkOffers({
      actorId,
      transport: transportA,
      vault: vaultA,
      nowMs: now,
    });
    expect(offers).toHaveLength(1);
    expect(offers[0]?.linkId).toBe(begin.linkId);
    expect(offers[0]?.sas).toBe(begin.sas);

    const approval = await approveLinkOffer({
      actorId,
      linkId: begin.linkId,
      transport: transportA,
      vault: vaultA,
      nowMs: now,
    });
    expect(approval.rosterSequence).toBe(2n);

    const pollResult = await pollLinkedEnrollment({
      actorId,
      transport: transportB,
      vault: vaultB,
      nowMs: now,
    });
    expect(pollResult).toBe('enrolled');

    const storedB = await loadStoredEnrollment(vaultB, now());
    expect(storedB).toBeDefined();
    expect(storedB?.rootPrivate).toBeUndefined();
    expect(storedB?.identity.ownRoster.sequence).toBe(2);
    expect(storedB?.identity.ownRoster.entries.every((entry) => entry.active)).toBe(true);

    // The offer is consumed: a second poll (no pending record left) never re-enrolls.
    nowMs += 1_000;
    const secondPoll = await pollLinkedEnrollment({
      actorId,
      transport: transportB,
      vault: vaultB,
      nowMs: now,
    });
    expect(secondPoll).toBe('expired');
  });

  it('never lists a tampered offer', async () => {
    const actorId = 'actor-tamper';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transportA = fakeTransport({ actorId, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId, transport: transportA, vault: vaultA, nowMs: now });

    const transportB = fakeTransport({ actorId, node });
    const vaultB = memoryVault();
    await beginDeviceLinkOffer({ actorId, transport: transportB, vault: vaultB, nowMs: now });

    const pending = node.pendingOffersByActor.get(actorId) ?? [];
    expect(pending).toHaveLength(1);
    const offer = pending[0];
    if (offer !== undefined) {
      const tampered = offer.offerBytes.slice();
      tampered[0] = (tampered[0] ?? 0) ^ 0xff;
      node.pendingOffersByActor.set(actorId, [{ ...offer, offerBytes: tampered }]);
    }

    const offers = await listLinkOffers({
      actorId,
      transport: transportA,
      vault: vaultA,
      nowMs: now,
    });
    expect(offers).toHaveLength(0);
  });

  it('approveLinkOffer refuses an expired offer', async () => {
    const actorId = 'actor-expired';
    let nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transportA = fakeTransport({ actorId, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId, transport: transportA, vault: vaultA, nowMs: now });

    const transportB = fakeTransport({ actorId, node });
    const vaultB = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: transportB,
      vault: vaultB,
      nowMs: now,
    });

    nowMs += 11 * 60 * 1_000; // past the 10-minute offer window
    await expect(
      approveLinkOffer({
        actorId,
        linkId: begin.linkId,
        transport: transportA,
        vault: vaultA,
        nowMs: now,
      }),
    ).rejects.toMatchObject({ reason: 'offer-unavailable' });
  });

  it('a device with no stored authority key cannot list pending offers', async () => {
    const actorId = 'actor-non-authority';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transportA = fakeTransport({ actorId, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId, transport: transportA, vault: vaultA, nowMs: now });

    const transportB = fakeTransport({ actorId, node });
    const vaultB = memoryVault();
    await beginDeviceLinkOffer({ actorId, transport: transportB, vault: vaultB, nowMs: now });

    await expect(
      listLinkOffers({ actorId, transport: transportB, vault: vaultB, nowMs: now }),
    ).rejects.toMatchObject({ reason: 'not-authority' });
    await expect(
      listLinkOffers({ actorId, transport: transportB, vault: vaultB, nowMs: now }),
    ).rejects.toBeInstanceOf(DeviceLinkError);
  });

  it('rotates the root: generation 2, roster S+1 carries prior entries inactive, and a chain-valid successor', async () => {
    const actorId = 'actor-rotate';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transport1 = fakeTransport({ actorId, node });
    const vault1 = memoryVault();
    await enrollThisDevice({ actorId, transport: transport1, vault: vault1, nowMs: now });
    const served = await transport1.getDeviceRoster(actorId);
    const previousView = rosterViewFromWire(served.roster as NonNullable<typeof served.roster>);

    const transport2 = fakeTransport({ actorId, node });
    const vault2 = memoryVault();
    const result = await rotateMessagingRoot({
      actorId,
      transport: transport2,
      vault: vault2,
      nowMs: now,
    });

    expect(result.generation).toBe(2);
    expect(result.planned).toBe(false);

    const publishCall = transport2.publishIdentityRoot.mock.calls[0]?.[0];
    const rotationRosterWire = publishCall?.roster;
    expect(rotationRosterWire).toBeDefined();
    const rotationView = rosterViewFromWire(
      rotationRosterWire as NonNullable<typeof rotationRosterWire>,
    );
    expect(rotationView.entries.every((entry) => !entry.active)).toBe(true);
    expect(() => assertRosterSucceeds(previousView, rotationView)).not.toThrow();

    const enrollCall = transport2.enrollDevice.mock.calls[0]?.[0];
    const finalRosterWire = enrollCall?.roster;
    expect(finalRosterWire).toBeDefined();
    const finalView = rosterViewFromWire(finalRosterWire as NonNullable<typeof finalRosterWire>);
    expect(() => assertRosterSucceeds(rotationView, finalView)).not.toThrow();
  });

  it('rotates from a root that has no roster at all: genesis roster, generation +1', async () => {
    // A published root with no roster is a real state (all devices lost/purged before any
    // roster landed, or a root republished after a failed enrollment). It must still rotate.
    const actorId = 'actor-rotate-no-roster';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transport1 = fakeTransport({ actorId, node });
    await enrollThisDevice({ actorId, transport: transport1, vault: memoryVault(), nowMs: now });
    node.rosterByActor.delete(actorId);

    const transport2 = fakeTransport({ actorId, node });
    const result = await rotateMessagingRoot({
      actorId,
      transport: transport2,
      vault: memoryVault(),
      nowMs: now,
    });

    expect(result.generation).toBe(2);
    const publishCall = transport2.publishIdentityRoot.mock.calls[0]?.[0];
    const rotationRosterWire = publishCall?.roster;
    expect(rotationRosterWire).toBeDefined();
    const rotationView = rosterViewFromWire(
      rotationRosterWire as NonNullable<typeof rotationRosterWire>,
    );
    expect(rotationView.sequence).toBe(1n);
    expect(rotationView.entries).toHaveLength(0);
    expect(() => assertRosterSucceeds(null, rotationView)).not.toThrow();
    expect(transport2.enrollDevice).toHaveBeenCalledTimes(1);
  });

  it('marks a rotation planned when the previous root key is supplied and matches the served root', async () => {
    const actorId = 'actor-rotate-planned';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transport1 = fakeTransport({ actorId, node });
    const vault1 = memoryVault();
    await enrollThisDevice({ actorId, transport: transport1, vault: vault1, nowMs: now });
    const stored1 = await loadStoredEnrollment(vault1, now());
    if (stored1 === undefined || stored1.rootPrivate === undefined) {
      throw new Error('test setup: device 1 must hold the account root');
    }

    const transport2 = fakeTransport({ actorId, node });
    const vault2 = memoryVault();
    const result = await rotateMessagingRoot({
      actorId,
      transport: transport2,
      vault: vault2,
      nowMs: now,
      previousRoot: { privateKey: stored1.rootPrivate, publicKey: stored1.rootPublic },
    });

    expect(result.generation).toBe(2);
    expect(result.planned).toBe(true);
  });

  it('beginDeviceLinkOffer is idempotent: a second call returns the same linkId and SAS', async () => {
    const actorId = 'actor-idempotent';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transportA = fakeTransport({ actorId, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId, transport: transportA, vault: vaultA, nowMs: now });

    const transportB = fakeTransport({ actorId, node });
    const vaultB = memoryVault();
    const first = await beginDeviceLinkOffer({
      actorId,
      transport: transportB,
      vault: vaultB,
      nowMs: now,
    });
    const second = await beginDeviceLinkOffer({
      actorId,
      transport: transportB,
      vault: vaultB,
      nowMs: now,
    });

    expect(second.linkId).toBe(first.linkId);
    expect(second.sas).toBe(first.sas);
    expect(transportB.beginDeviceLink).toHaveBeenCalledTimes(1);
  });

  it('refreshOwnRoster persists a digest change once the served roster moves forward, and is a no-op once converged', async () => {
    const actorId = 'actor-refresh';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transport1 = fakeTransport({ actorId, node });
    const vault1 = memoryVault();
    await enrollThisDevice({ actorId, transport: transport1, vault: vault1, nowMs: now });
    const storedAtSeq1 = await loadStoredEnrollment(vault1, now());
    if (storedAtSeq1 === undefined) throw new Error('test setup: device 1 must be enrolled');

    const transport2 = fakeTransport({ actorId, node });
    const vault2 = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: transport2,
      vault: vault2,
      nowMs: now,
    });
    await approveLinkOffer({
      actorId,
      linkId: begin.linkId,
      transport: transport1,
      vault: vault1,
      nowMs: now,
    });
    // `approveLinkOffer` already persisted vault1's own roster forward (issue #277) — simulate
    // a device that missed a persisted refresh (e.g. a snapshot loaded before the fix, or one
    // that has been offline) by re-seeding the pre-link record into a FRESH vault, while the
    // node still serves the post-link roster.
    const staleVault = memoryVault();
    await saveStoredEnrollment(staleVault, storedAtSeq1);

    const result = await refreshOwnRoster({
      actorId,
      transport: transport1,
      vault: staleVault,
      nowMs: now,
    });
    expect(result.changed).toBe(true);
    expect(result.sequence).toBe(2n);
    expect(result.selfActive).toBe(true);

    const reloaded = await loadStoredEnrollment(staleVault, now());
    expect(reloaded?.identity.ownRoster.sequence).toBe(2);

    // Already converged: a second refresh against the same served roster changes nothing.
    const second = await refreshOwnRoster({
      actorId,
      transport: transport1,
      vault: staleVault,
      nowMs: now,
    });
    expect(second.changed).toBe(false);
    expect(second.sequence).toBe(2n);
  });

  it('refreshOwnRoster rejects a served roster older than the one already verified (rollback)', async () => {
    const actorId = 'actor-refresh-rollback';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transport1 = fakeTransport({ actorId, node });
    const vault1 = memoryVault();
    await enrollThisDevice({ actorId, transport: transport1, vault: vault1, nowMs: now });
    const seq1Root = await transport1.getIdentityRoot(actorId);
    const seq1Response = await transport1.getDeviceRoster(actorId);
    if (seq1Root === undefined || seq1Response.roster === undefined) {
      throw new Error('test setup: device 1 must have a served root/roster');
    }

    const transport2 = fakeTransport({ actorId, node });
    const vault2 = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: transport2,
      vault: vault2,
      nowMs: now,
    });
    await approveLinkOffer({
      actorId,
      linkId: begin.linkId,
      transport: transport1,
      vault: vault1,
      nowMs: now,
    });
    const storedAtSeq2 = await loadStoredEnrollment(vault1, now());
    expect(storedAtSeq2?.identity.ownRoster.sequence).toBe(2);

    // A node that (bug or attack) still serves the pre-link (sequence 1) root/roster to this
    // already-converged device is a rollback — never trusted, even though the served bytes are
    // themselves genuinely root-signed.
    const rollbackNode = createFakeE2eeNode();
    rollbackNode.rootByActor.set(actorId, seq1Root);
    setFakeRoster(rollbackNode, actorId, seq1Response.roster, seq1Response.certificates);
    const rollbackTransport = fakeTransport({ actorId, node: rollbackNode });

    await expect(
      refreshOwnRoster({ actorId, transport: rollbackTransport, vault: vault1, nowMs: now }),
    ).rejects.toThrow(/rollback/);
  });

  it("revokeLinkedDevice marks exactly one device inactive, converges the authority's own roster, and refuses non-authority/self-revoke callers", async () => {
    const actorId = 'actor-revoke';
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();

    const transport1 = fakeTransport({ actorId, node });
    const vault1 = memoryVault();
    await enrollThisDevice({ actorId, transport: transport1, vault: vault1, nowMs: now });
    const stored1 = await loadStoredEnrollment(vault1, now());
    if (stored1 === undefined) throw new Error('test setup: device 1 must be enrolled');

    const transport2 = fakeTransport({ actorId, node });
    const vault2 = memoryVault();
    const begin = await beginDeviceLinkOffer({
      actorId,
      transport: transport2,
      vault: vault2,
      nowMs: now,
    });
    await approveLinkOffer({
      actorId,
      linkId: begin.linkId,
      transport: transport1,
      vault: vault1,
      nowMs: now,
    });
    await pollLinkedEnrollment({ actorId, transport: transport2, vault: vault2, nowMs: now });
    const stored2 = await loadStoredEnrollment(vault2, now());
    if (stored2 === undefined) throw new Error('test setup: device 2 must be linked');

    // Device 2 does not hold the root key: it cannot revoke anything.
    await expect(
      revokeLinkedDevice({
        actorId,
        deviceId: stored1.identity.deviceId,
        transport: transport2,
        vault: vault2,
        nowMs: now,
      }),
    ).rejects.toMatchObject({ reason: 'not-authority' });

    // The authority cannot revoke itself.
    await expect(
      revokeLinkedDevice({
        actorId,
        deviceId: stored1.identity.deviceId,
        transport: transport1,
        vault: vault1,
        nowMs: now,
      }),
    ).rejects.toMatchObject({ reason: 'cannot-revoke-self' });

    const result = await revokeLinkedDevice({
      actorId,
      deviceId: stored2.identity.deviceId,
      transport: transport1,
      vault: vault1,
      nowMs: now,
    });
    expect(result.rosterSequence).toBe(3n);

    const served = await transport1.getDeviceRoster(actorId);
    if (served.roster === undefined) throw new Error('actor must still have a served roster');
    const view = rosterViewFromWire(served.roster);
    expect(activeDeviceIds(view)).toEqual([stored1.identity.deviceId]);
    const revokedEntry = view.entries.find((entry) => entry.deviceId === stored2.identity.deviceId);
    expect(revokedEntry?.active).toBe(false);
    expect(revokedEntry?.revokedAt).toBeDefined();

    // Issue #277: the authority's own stored roster converges too, not just the served one.
    const reloadedAuthority = await loadStoredEnrollment(vault1, now());
    expect(reloadedAuthority?.identity.ownRoster.sequence).toBe(3);
  });
});
