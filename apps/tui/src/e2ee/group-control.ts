/**
 * Group-control transcript verification for display (ADR 0020 §7, P13-008/P13-010).
 *
 * The node serves membership events, but "the node says this happened" is exactly what
 * the signed transcript exists to go beyond: every event carries `event_bytes` signed by
 * a member device's Ed25519 key. This module re-verifies each event against the signer's
 * *certified* device key (loaded from the signer's verified identity chain, never from
 * the event itself) before the UI renders it, and marks any row that does not verify so
 * it can never pass silently as ordinary history.
 */
import {
  assertGroupControlShape,
  verifyGroupControlSignature,
  type E2eeGroupControlEventView,
} from '@patches/domain';

import type { E2eeGroupControlEvent } from '../api/wire/types.js';
import { E2EE_GROUP_CHANGE_KIND } from '../api/wire/enums.js';
import { toDate } from '../api/wire/time.js';
import { sha256Digest, strictVerifier, type VerifiedPeerChain } from './chain.js';

function changeOf(wire: E2eeGroupControlEvent): 'ADDED' | 'REMOVED' | undefined {
  if (wire.change === E2EE_GROUP_CHANGE_KIND.ADDED) return 'ADDED';
  if (wire.change === E2EE_GROUP_CHANGE_KIND.REMOVED) return 'REMOVED';
  return undefined;
}

/** A wire event lifted into the domain view its validators operate on. */
export function groupControlEventFromWire(
  wire: E2eeGroupControlEvent,
  change: 'ADDED' | 'REMOVED',
): E2eeGroupControlEventView {
  return {
    conversationId: wire.conversationId,
    epoch: wire.epoch,
    change,
    subjectActorId: wire.subjectActorId,
    signerActorId: wire.signerActorId,
    signerDeviceId: wire.signerDeviceId,
    previousDigest: wire.previousDigest,
    digest: wire.digest,
    eventBytes: wire.eventBytes,
    deviceSignature: wire.deviceSignature,
    createdAt: toDate(wire.createdAt) ?? new Date(0),
  };
}

export interface GroupControlRow {
  readonly epoch: bigint;
  readonly change: 'ADDED' | 'REMOVED' | 'UNKNOWN';
  readonly subjectActorId: string;
  /** True only when the signature verified against the signer's certified device key. */
  readonly signatureVerified: boolean;
}

export interface GroupControlVerdict {
  /** True when every row verified. False means at least one row failed or could not be checked. */
  readonly allVerified: boolean;
  readonly rows: readonly GroupControlRow[];
}

export interface GroupControlChainLoader {
  /**
   * Returns the actor's verified chain (root → roster → active certificates), or
   * `undefined` when the chain cannot be fetched/verified — which fails the affected
   * rows closed rather than trusting an unverifiable signature.
   */
  loadVerifiedChain(actorId: string): Promise<VerifiedPeerChain | undefined>;
}

function rowOf(event: E2eeGroupControlEventView, signatureVerified: boolean): GroupControlRow {
  return {
    epoch: event.epoch,
    change: event.change === 'ADDED' || event.change === 'REMOVED' ? event.change : 'UNKNOWN',
    subjectActorId: event.subjectActorId,
    signatureVerified,
  };
}

/**
 * Verifies each served event in order. A malformed event, a missing chain, or a signer
 * device absent from the verified roster all render as unverified rows — the transcript
 * still displays (it is the node's claim), but never with a clean bill of health.
 */
export async function verifyGroupControlEvents(
  events: readonly E2eeGroupControlEvent[],
  chains: GroupControlChainLoader,
): Promise<GroupControlVerdict> {
  const chainCache = new Map<string, Promise<VerifiedPeerChain | undefined>>();
  const loadChain = (actorId: string): Promise<VerifiedPeerChain | undefined> => {
    let cached = chainCache.get(actorId);
    if (cached === undefined) {
      cached = chains.loadVerifiedChain(actorId).catch(() => undefined);
      chainCache.set(actorId, cached);
    }
    return cached;
  };

  const rows: GroupControlRow[] = [];
  let allVerified = events.length > 0;
  for (const wireEvent of events) {
    const change = changeOf(wireEvent);
    if (change === undefined) {
      rows.push({
        epoch: wireEvent.epoch,
        change: 'UNKNOWN',
        subjectActorId: wireEvent.subjectActorId,
        signatureVerified: false,
      });
      allVerified = false;
      continue;
    }
    let event: E2eeGroupControlEventView;
    try {
      event = groupControlEventFromWire(wireEvent, change);
      assertGroupControlShape(event);
    } catch {
      rows.push({
        epoch: wireEvent.epoch,
        change: 'UNKNOWN',
        subjectActorId: wireEvent.subjectActorId,
        signatureVerified: false,
      });
      allVerified = false;
      continue;
    }
    const chain = await loadChain(event.signerActorId);
    const signingKey = chain?.activeDevices.get(event.signerDeviceId)?.signingPublicKey;
    if (signingKey === undefined) {
      rows.push(rowOf(event, false));
      allVerified = false;
      continue;
    }
    try {
      verifyGroupControlSignature(event, signingKey, {
        verifier: strictVerifier,
        digest: sha256Digest,
      });
      rows.push(rowOf(event, true));
    } catch {
      rows.push(rowOf(event, false));
      allVerified = false;
    }
  }
  return { allVerified, rows };
}
