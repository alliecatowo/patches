/**
 * `patches e2ee link` / `approve-link` / `rotate-root` pure flow functions (ADR 0037 §1–§2,
 * issues #265/#266) — mirrors `e2ee-recovery.test.ts`'s structure: `fakeTransport`/
 * `createFakeE2eeNode`/`memoryVault` from `../e2ee/test-support.ts` stand in for a real node and
 * vault, and a small scripted `CliIo` fake stands in for a real terminal, so the three flows are
 * unit-tested without a real node, vault file, or keyring.
 *
 * Every case here also guards spec §194: nothing printed to the operator may contain raw key or
 * offer material (a long hex/base64 run) — only fixed copy, SAS groups, and device ids.
 */
import { describe, expect, it } from 'vitest';

import { rosterViewFromWire } from '../e2ee/chain.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  listLinkOffers,
  type PendingLinkOfferSummary,
} from '../e2ee/device-link.js';
import { enrollThisDevice } from '../e2ee/enrollment.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from '../e2ee/test-support.js';
import {
  LINK_MISMATCH_COPY,
  runApproveLinkFlow,
  runLinkOfferFlow,
  runRotateRootFlow,
} from './e2ee-link.js';
import type { CliIo } from './io.js';

const ACTOR_ID = 'actor-cli-link';
const NOW_MS = Date.UTC(2026, 0, 1);
const nowMs = (): number => NOW_MS;

/** A `CliIo` double that records every line instead of touching a real terminal. */
function fakeIo(): CliIo & { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    isTTY: true,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    prompt: () => Promise.reject(new Error('prompt() was not scripted for this test')),
    promptPassword: () =>
      Promise.reject(new Error('promptPassword() was not scripted for this test')),
    readStdin: () => Promise.reject(new Error('readStdin() was not scripted for this test')),
  };
}

/** A 32-byte key is 64 hex chars / 43+ base64 chars; a 64-byte signature is longer still. Any
 * such run appearing in printed output would mean raw key/offer material leaked (spec §194) — a
 * device id (dash-separated 8/4/4/4/12 hex groups) and a five-group SAS never trip this. */
const KEY_MATERIAL_PATTERN = /[0-9a-f]{64,}|[A-Za-z0-9+/]{43,}={0,2}/i;

function assertNoKeyMaterial(lines: readonly string[]): void {
  for (const line of lines) {
    expect(line).not.toMatch(KEY_MATERIAL_PATTERN);
  }
}

describe('runLinkOfferFlow', () => {
  it('prints the SAS as five 4-digit groups and returns 0 once the poll reports enrolled', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_ID, transport: transportA, vault: vaultA, nowMs });

    const transportB = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultB = memoryVault();
    const io = fakeIo();

    // Simulates the authority device approving out of band while this device "waits": the
    // first scripted sleep does the approval, so the very next poll observes it enrolled.
    let approved = false;
    const sleep = async (): Promise<void> => {
      if (approved) return;
      approved = true;
      const offers = await listLinkOffers({
        actorId: ACTOR_ID,
        transport: transportA,
        vault: vaultA,
        nowMs,
      });
      const offer = offers[0];
      if (offer === undefined) throw new Error('expected exactly one pending offer');
      await approveLinkOffer({
        actorId: ACTOR_ID,
        linkId: offer.linkId,
        transport: transportA,
        vault: vaultA,
        nowMs,
      });
    };

    const exitCode = await runLinkOfferFlow(io, transportB, vaultB, ACTOR_ID, nowMs, {
      sleep,
      maxPolls: 3,
    });

    expect(exitCode).toBe(0);
    const sasLine = io.out.find((line) => line.includes('Compare this code'));
    expect(sasLine).toMatch(/\d{4}-\d{4}-\d{4}-\d{4}-\d{4}/);
    expect(io.out.some((line) => line.includes('now linked and enrolled'))).toBe(true);
    assertNoKeyMaterial(io.out);
    assertNoKeyMaterial(io.err);
  });
});

describe('runApproveLinkFlow', () => {
  it('lists offers, refuses on a mismatch, approves a match, and advances the roster to sequence 2', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_ID, transport: transportA, vault: vaultA, nowMs });

    const transportB = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultB = memoryVault();
    const offerB = await beginDeviceLinkOffer({
      actorId: ACTOR_ID,
      transport: transportB,
      vault: vaultB,
      nowMs,
    });

    const transportC = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultC = memoryVault();
    const offerC = await beginDeviceLinkOffer({
      actorId: ACTOR_ID,
      transport: transportC,
      vault: vaultC,
      nowMs,
    });

    const io = fakeIo();
    const confirmMatch = (offer: PendingLinkOfferSummary): Promise<boolean> =>
      Promise.resolve(offer.linkId === offerC.linkId);

    const exitCode = await runApproveLinkFlow(
      io,
      transportA,
      vaultA,
      ACTOR_ID,
      nowMs,
      undefined,
      confirmMatch,
    );

    expect(exitCode).toBe(0);
    expect(io.out.some((line) => line.includes(LINK_MISMATCH_COPY))).toBe(true);
    expect(io.out.some((line) => line.includes('Linked device'))).toBe(true);

    // The refused offer (B) is never approved; only the matched offer (C) advances the roster.
    const rosterResponse = await transportA.getDeviceRoster(ACTOR_ID);
    const roster = rosterResponse.roster;
    if (roster === undefined) throw new Error('expected a served roster');
    const view = rosterViewFromWire(roster);
    expect(view.sequence).toBe(2n);
    // Only the original authority device and the matched offer (C) are active — the refused
    // offer (B) never became a roster entry.
    expect(view.entries).toHaveLength(2);
    void offerB;

    assertNoKeyMaterial(io.out);
    assertNoKeyMaterial(io.err);
  });
});

describe('runRotateRootFlow', () => {
  it('refuses to rotate without explicit confirmation', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_ID, transport: transportA, vault: vaultA, nowMs });

    const transportB = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultB = memoryVault();
    const io = fakeIo();

    const exitCode = await runRotateRootFlow(io, transportB, vaultB, ACTOR_ID, nowMs, false);

    expect(exitCode).toBe(0);
    expect(io.out.some((line) => line.includes('Cancelled. No identity was changed.'))).toBe(true);
    expect(transportB.publishIdentityRoot).not.toHaveBeenCalled();
    assertNoKeyMaterial(io.out);
  });

  it('publishes generation 2 once confirmed', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultA = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_ID, transport: transportA, vault: vaultA, nowMs });

    const transportB = fakeTransport({ actorId: ACTOR_ID, node });
    const vaultB = memoryVault();
    const io = fakeIo();

    const exitCode = await runRotateRootFlow(io, transportB, vaultB, ACTOR_ID, nowMs, true);

    expect(exitCode).toBe(0);
    expect(io.out.some((line) => line.includes('Started messaging identity generation 2.'))).toBe(
      true,
    );
    expect(transportB.publishIdentityRoot).toHaveBeenCalledTimes(1);
    const publishCall = transportB.publishIdentityRoot.mock.calls[0]?.[0];
    expect(publishCall?.identityRoot?.generation).toBe(2);

    assertNoKeyMaterial(io.out);
    assertNoKeyMaterial(io.err);
  });
});
