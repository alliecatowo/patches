/**
 * Device-certificate renewal and expired-device recovery (audit P2-C1, ADR 0038).
 *
 * A device certificate is root-signed and pinned by digest in the append-only roster, and
 * ADR 0031 §2 forbids re-pointing a device id at a new certificate. So "renewal" is DEVICE
 * REPLACEMENT inside the same messaging root: the authority device mints a fresh device id,
 * certificate and prekeys, enrolls them through the ordinary `EnrollDevice` path, swaps its
 * local identity, and revokes the lapsed device. No wire change and no server change.
 *
 * History is never wiped. Only the device identity record and the ratchet sessions go (every
 * ratchet is bound to the old device id and cannot continue); every other opaque record —
 * message history, peer pins, safety-number verification — is left untouched. Peers simply
 * run a fresh X3DH to the new device id.
 *
 * A device without the root key (an ordinary linked device) cannot sign its own certificate.
 * It gets the same history-preserving reset, then goes through the existing link flow.
 */
import { verifyMessagingRoot, verifyRosterSnapshot, bytesEqual } from '@patches/crypto';

import {
  ENROLLMENT_RECORD_KEY,
  decodeStoredEnrollment,
  disposeStoredEnrollment,
  encodeStoredEnrollment,
  enrollRequestFromRecord,
  generateEnrollment,
  isSelfCertificateExpired,
  loadStoredEnrollment,
  saveStoredEnrollment,
  type EnrollmentTransport,
  type StoredEnrollment,
} from './enrollment.js';
import { revokeLinkedDevice } from './device-link.js';
import type { RatchetSessionVault } from './vault.js';

/** Start renewing this long before expiry, so a failed attempt has time to be retried. */
export const CERTIFICATE_RENEWAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;

/** Pending replacement identity, durable BEFORE `EnrollDevice` so a crash resumes it verbatim. */
export const RENEWAL_RECORD_KEY = '\0patches-e2ee-enrollment-renewal';

export type RenewalOutcome =
  | { readonly status: 'not-due' }
  | {
      readonly status: 'renewed';
      readonly record: StoredEnrollment;
      /** True when the lapsed device was also revoked from the roster. */
      readonly revokedOld: boolean;
    }
  /** This device has no root key: it must be re-linked from an authority device. */
  | { readonly status: 'needs-relink' };

export interface RenewDeviceInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
  /** Renew even when the certificate is not within the window (explicit user action). */
  readonly force?: boolean;
}

/** True when the local certificate is expired or inside the renewal window. */
export function isRenewalDue(
  record: StoredEnrollment,
  nowMs: number,
  windowMs = CERTIFICATE_RENEWAL_WINDOW_MS,
): boolean {
  return isSelfCertificateExpired(record.identity, nowMs, windowMs);
}

/** Opaque record keys start with NUL (`sessionIdFor` composes UUIDs, so they never collide). */
function isOpaqueKey(key: string): boolean {
  return key.startsWith('\0');
}

/** Deletes every ratchet session, keeping all opaque records (history, pins, verification). */
export async function dropRatchetSessions(vault: RatchetSessionVault): Promise<number> {
  const keys = (await vault.listSessions()).filter((key) => !isOpaqueKey(key));
  for (const key of keys) await vault.deleteSession(key);
  return keys.length;
}

/**
 * Replaces this device's identity with a freshly certified one under the SAME root.
 * Authority-only; returns `needs-relink` (touching nothing) when the root key is absent.
 */
export async function renewDeviceIdentity(input: RenewDeviceInput): Promise<RenewalOutcome> {
  const nowMs = input.nowMs();
  const stored = await loadStoredEnrollment(input.vault, nowMs);
  if (stored === undefined || !stored.submitted) {
    throw new Error('renewDeviceIdentity requires an already-enrolled device.');
  }
  if (input.force !== true && !isRenewalDue(stored, nowMs)) {
    disposeStoredEnrollment(stored);
    return { status: 'not-due' };
  }
  if (stored.rootPrivate === undefined) return { status: 'needs-relink' };

  const oldDeviceId = stored.identity.deviceId;
  let pending = await loadPendingRenewal(input.vault, nowMs);
  if (pending !== undefined && pending.identity.actorId !== input.actorId) pending = undefined;

  const rootWire = await input.transport.getIdentityRoot(input.actorId);
  if (rootWire === undefined || rootWire.publicKey.length === 0) {
    throw new Error('The node has no messaging root for this account.');
  }
  const cryptoRoot = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  // A node that serves a different root than the one this device holds the key for cannot be
  // renewed against; it is a rotation the authority did not make.
  if (!bytesEqual(cryptoRoot.publicKey, stored.rootPublic)) {
    throw new Error('The served messaging root is not the one this device holds.');
  }
  const rosterResponse = await input.transport.getDeviceRoster(input.actorId);
  if (rosterResponse.roster === undefined) throw new Error('The node has no device roster.');
  const certificates = rosterResponse.certificates.map((certificate) => ({
    certificateBytes: certificate.certificateBytes,
    rootSignature: certificate.rootSignature,
  }));
  const currentRoster = verifyRosterSnapshot({
    rosterBytes: rosterResponse.roster.rosterBytes,
    rootSignature: rosterResponse.roster.rootSignature,
    root: cryptoRoot,
    certificates,
    nowMs,
  });

  // A node must not be able to steer the replacement onto a stale chain (e.g. one that still
  // lists a device this account already revoked as active): never go below what this device
  // has already verified.
  if (currentRoster.sequence < stored.identity.ownRoster.sequence) {
    throw new Error('The node served a device roster older than the one already verified.');
  }

  // A pending replacement was built against an older roster when the account has moved on
  // since (another device linked, a revoke): regenerate rather than submit a stale chain.
  if (pending !== undefined && pending.identity.ownRoster.sequence !== currentRoster.sequence + 1) {
    pending = undefined;
  }
  if (pending === undefined) {
    const generated = generateEnrollment({
      actorId: input.actorId,
      root: {
        privateKey: stored.rootPrivate,
        publicKey: stored.rootPublic,
        createdAtMs: cryptoRoot.createdAtMs,
        generation: cryptoRoot.generation,
        currentRoster,
        certificates,
      },
      nowMs,
    });
    pending = generated.record;
    await input.vault.putOpaqueRecord(RENEWAL_RECORD_KEY, encodeStoredEnrollment(pending));
  }

  await input.transport.enrollDevice(enrollRequestFromRecord(pending));

  // Swap: the new identity becomes THE enrollment record, then every ratchet bound to the old
  // device id is dropped. Order matters for crash safety: if we die between the two writes the
  // new record is already authoritative and the leftover sessions are merely dead weight that
  // the next renewal check (or a failed decrypt) discards.
  const submitted: StoredEnrollment = { ...pending, submitted: true };
  await saveStoredEnrollment(input.vault, submitted);
  await dropRatchetSessions(input.vault);
  await input.vault.deleteSession(RENEWAL_RECORD_KEY);

  let revokedOld = false;
  try {
    await revokeLinkedDevice({
      actorId: input.actorId,
      deviceId: oldDeviceId,
      transport: input.transport,
      vault: input.vault,
      nowMs: input.nowMs,
    });
    revokedOld = true;
  } catch {
    // Non-fatal: the replacement is live, and a lapsed entry is skipped by every verifier
    // (P2-C1). A revoke that failed here can be retried from the Devices screen.
  }
  disposeStoredEnrollment(stored);
  const finalRecord = (await loadStoredEnrollment(input.vault, input.nowMs())) ?? submitted;
  return { status: 'renewed', record: finalRecord, revokedOld };
}

/**
 * History-preserving reset for a lapsed device that cannot renew itself (no root key): removes
 * the dead identity record and the ratchets bound to it, keeps everything else, and leaves the
 * vault in the not-enrolled state so the ordinary link flow can run. Refuses to run on a device
 * that holds the root key — discarding it would destroy the account's only signing authority.
 */
export async function discardExpiredIdentityKeepingHistory(
  vault: RatchetSessionVault,
  nowMs: number,
): Promise<void> {
  const stored = await loadStoredEnrollment(vault, nowMs);
  if (stored === undefined) return;
  try {
    if (stored.rootPrivate !== undefined) {
      throw new Error('This device holds the messaging root key; renew it instead of discarding.');
    }
    if (!isSelfCertificateExpired(stored.identity, nowMs)) {
      throw new Error('This device certificate has not expired.');
    }
  } finally {
    disposeStoredEnrollment(stored);
  }
  await dropRatchetSessions(vault);
  // `deleteSession` is a plain keyed delete, so it removes the opaque enrollment record too.
  await vault.deleteSession(ENROLLMENT_RECORD_KEY);
}

async function loadPendingRenewal(
  vault: RatchetSessionVault,
  nowMs: number,
): Promise<StoredEnrollment | undefined> {
  const bytes = await vault.getOpaqueRecord(RENEWAL_RECORD_KEY);
  if (bytes === undefined || bytes.length === 0) return undefined;
  try {
    return decodeStoredEnrollment(bytes, nowMs);
  } catch {
    // An undecodable or no-longer-valid pending record is discarded and regenerated.
    return undefined;
  }
}
