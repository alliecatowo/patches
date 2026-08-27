import { assertRosterSucceeds } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { rosterViewFromWire } from './chain.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  DeviceLinkError,
  listLinkOffers,
  pollLinkedEnrollment,
  rotateMessagingRoot,
} from './device-link.js';
import { enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from './test-support.js';

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
});
