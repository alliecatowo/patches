/**
 * One-time prekey replenishment and signed-prekey rotation (ADR 0020 §5, issue #278).
 *
 * Every device targets 100 one-time prekeys, replenishing when its server-reported inventory
 * drops to the replenish threshold, and rotates its signed prekey every 7 days — retaining the
 * previous signed prekey's private half only long enough that a peer's initial message sealed
 * against it just before rotation can still be opened (the mailbox's max-latency window).
 *
 * Crash safety (ADR 0020 §4's commit-before-network rule, applied here): whatever this run
 * decides to mint is persisted to the vault BEFORE `UploadPrekeys` is called, tagged as a
 * `pendingPrekeyUpload`. A process that dies between the persist and the RPC resuming resumes by
 * re-sending exactly that batch — it never mints a second one, which would collide with the
 * node's immutable per-device issued-id ledger (an id, once issued, is never reissued).
 */
import { create } from '@bufbuild/protobuf';
import { generateKeyAgreementKeyPair, signPreKeyBundle } from '@patches/crypto';
import {
  E2EE_MAILBOX_MAX_LATENCY_MS,
  E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_SIGNED_PREKEY_ROTATION_MS,
} from '@patches/domain';
import { UploadPrekeysRequestSchema } from '@patches/proto/es';

import { fromDate } from '../api/wire/time.js';
import {
  loadStoredEnrollment,
  saveStoredEnrollment,
  type EnrollmentTransport,
  type PendingPrekeyUpload,
  type StoredEnrollment,
} from './enrollment.js';
import type { LocalDeviceIdentity, LocalOneTimePreKey } from './local-identity.js';
import type { RatchetSessionVault } from './ratchet-vault.js';

export interface MaintainPrekeysInput {
  /** The caller's already-synced local identity — only its `deviceId` is consulted, as a
   * cross-check against the vault's own stored record; every mutated field is read fresh from
   * the vault so a stale in-memory copy can never steer what gets minted or uploaded. */
  readonly identity: LocalDeviceIdentity;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  /** Injectable clock for tests; production omits it. */
  readonly nowMs?: (() => number) | undefined;
}

export interface MaintainPrekeysResult {
  /** Count of newly minted one-time prekeys uploaded this run (0 if none were due). */
  readonly replenishedOneTimePrekeys: number;
  /** True when a new signed prekey was minted and uploaded this run. */
  readonly rotatedSignedPreKey: boolean;
}

function mintOneTimePrekeys(startId: number, count: number): LocalOneTimePreKey[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: startId + index,
    keyPair: generateKeyAgreementKeyPair(),
  }));
}

/** Drops previous signed prekeys past the mailbox's max-latency window — nothing sealed
 * against them can still be in flight (ADR 0020 §5). */
function pruneExpiredPreviousSignedPreKeys(
  stored: StoredEnrollment,
  nowMs: number,
): StoredEnrollment {
  const kept = stored.previousSignedPreKeys.filter(
    (previous) => nowMs - previous.retiredAtMs < E2EE_MAILBOX_MAX_LATENCY_MS,
  );
  if (kept.length === stored.previousSignedPreKeys.length) return stored;
  return { ...stored, previousSignedPreKeys: kept };
}

/** Mints a new signed prekey, retiring the current one into `previousSignedPreKeys` rather than
 * discarding its private half — a delayed initial message sealed against it must still open. */
function rotateSignedPreKey(
  stored: StoredEnrollment,
  nowMs: number,
): { readonly stored: StoredEnrollment; readonly newId: number } {
  const identity = stored.identity;
  const newId = identity.signedPreKey.id + 1;
  const newKeyPair = generateKeyAgreementKeyPair();
  const expiresAtMs = nowMs + E2EE_SIGNED_PREKEY_ROTATION_MS;
  const signedBundle = signPreKeyBundle(identity.keys.signing.privateKey, {
    actorId: identity.actorId,
    deviceId: identity.deviceId,
    certificateDigest: identity.selfDevice.certificateDigest,
    signedPrekeyId: newId,
    signedPrekeyPublicKey: newKeyPair.publicKey,
    createdAtMs: nowMs,
    expiresAtMs,
  });
  const nextIdentity: LocalDeviceIdentity = {
    ...identity,
    signedPreKey: { id: newId, keyPair: newKeyPair, createdAtMs: nowMs, expiresAtMs },
    ownBundle: {
      bundleBytes: signedBundle.bundleBytes,
      deviceSignature: signedBundle.deviceSignature,
    },
  };
  return {
    stored: {
      ...stored,
      identity: nextIdentity,
      previousSignedPreKeys: [
        ...stored.previousSignedPreKeys,
        {
          id: identity.signedPreKey.id,
          keyPair: identity.signedPreKey.keyPair,
          createdAtMs: identity.signedPreKey.createdAtMs,
          expiresAtMs: identity.signedPreKey.expiresAtMs,
          bundleBytes: identity.ownBundle.bundleBytes,
          deviceSignature: identity.ownBundle.deviceSignature,
          retiredAtMs: nowMs,
        },
      ],
    },
    newId,
  };
}

function wireSignedPrekey(identity: LocalDeviceIdentity) {
  return {
    keyId: BigInt(identity.signedPreKey.id),
    publicKey: identity.signedPreKey.keyPair.publicKey,
    signature: identity.ownBundle.deviceSignature,
    createdAt: fromDate(new Date(identity.signedPreKey.createdAtMs)),
    expiresAt: fromDate(new Date(identity.signedPreKey.expiresAtMs)),
  };
}

/** Re-sends (or sends for the first time) exactly `stored.pendingPrekeyUpload`, then clears it.
 * A no-op when nothing is pending. */
async function confirmPendingUpload(
  transport: EnrollmentTransport,
  vault: RatchetSessionVault,
  stored: StoredEnrollment,
): Promise<StoredEnrollment> {
  const pending = stored.pendingPrekeyUpload;
  if (pending === undefined) return stored;
  const identity = stored.identity;
  const oneTimePrekeys = pending.oneTimePrekeyIds.map((id) => {
    const local = identity.oneTimePreKeys.find((candidate) => candidate.id === id);
    if (local === undefined) {
      // The persisted batch and the persisted identity are written together in the same
      // `saveStoredEnrollment` call below — this can only mean vault corruption, not a race.
      throw new Error('Pending one-time prekey upload names an id this device no longer holds.');
    }
    return { keyId: BigInt(id), publicKey: local.keyPair.publicKey };
  });
  await transport.uploadPrekeys(
    create(UploadPrekeysRequestSchema, {
      deviceId: identity.deviceId,
      ...(pending.signedPreKeyId === undefined ? {} : { signedPrekey: wireSignedPrekey(identity) }),
      oneTimePrekeys,
      prekeyBundleBytes: identity.ownBundle.bundleBytes,
      prekeyBundleSignature: identity.ownBundle.deviceSignature,
    }),
  );
  const confirmed: StoredEnrollment = { ...stored, pendingPrekeyUpload: undefined };
  await saveStoredEnrollment(vault, confirmed);
  return confirmed;
}

/**
 * Runs one maintenance attempt: replenishes one-time prekeys and/or rotates the signed prekey
 * if either is due, uploading at most one batch. Safe to call repeatedly (idempotent) — a batch
 * already staged from a prior, interrupted run is resumed before anything new is considered.
 */
export async function maintainPrekeys(input: MaintainPrekeysInput): Promise<MaintainPrekeysResult> {
  const nowMs = (input.nowMs ?? Date.now)();
  const loaded = await loadStoredEnrollment(input.vault, nowMs);
  if (loaded === undefined || loaded.identity.deviceId !== input.identity.deviceId) {
    throw new Error('maintainPrekeys requires this device’s own stored enrollment record.');
  }
  let stored = pruneExpiredPreviousSignedPreKeys(loaded, nowMs);
  if (stored !== loaded) await saveStoredEnrollment(input.vault, stored);

  if (stored.pendingPrekeyUpload !== undefined) {
    const pending = stored.pendingPrekeyUpload;
    await confirmPendingUpload(input.transport, input.vault, stored);
    return {
      replenishedOneTimePrekeys: pending.oneTimePrekeyIds.length,
      rotatedSignedPreKey: pending.signedPreKeyId !== undefined,
    };
  }

  const inventory = await input.transport.getPrekeyInventory(stored.identity.deviceId);

  let mintedOneTimeIds: readonly number[] = [];
  if (inventory.oneTimePrekeyCount <= E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD) {
    const mintCount = Math.max(0, E2EE_ONE_TIME_PREKEY_TARGET - inventory.oneTimePrekeyCount);
    if (mintCount > 0) {
      const minted = mintOneTimePrekeys(stored.nextOneTimePrekeyId, mintCount);
      mintedOneTimeIds = minted.map((prekey) => prekey.id);
      stored = {
        ...stored,
        identity: {
          ...stored.identity,
          oneTimePreKeys: [...stored.identity.oneTimePreKeys, ...minted],
        },
        nextOneTimePrekeyId: stored.nextOneTimePrekeyId + mintCount,
      };
    }
  }

  let rotatedSignedPreKeyId: number | undefined;
  const signedPreKeyAgeMs = nowMs - stored.identity.signedPreKey.createdAtMs;
  if (signedPreKeyAgeMs >= E2EE_SIGNED_PREKEY_ROTATION_MS || inventory.signedPrekeyRotationDue) {
    const rotated = rotateSignedPreKey(stored, nowMs);
    stored = rotated.stored;
    rotatedSignedPreKeyId = rotated.newId;
  }

  if (mintedOneTimeIds.length === 0 && rotatedSignedPreKeyId === undefined) {
    return { replenishedOneTimePrekeys: 0, rotatedSignedPreKey: false };
  }

  const pendingPrekeyUpload: PendingPrekeyUpload = {
    oneTimePrekeyIds: mintedOneTimeIds,
    signedPreKeyId: rotatedSignedPreKeyId,
  };
  stored = { ...stored, pendingPrekeyUpload };
  // Durable BEFORE the upload (ADR 0020 §4): a crash after this line resumes on the next call
  // via the `pendingPrekeyUpload` branch above, re-sending these exact ids.
  await saveStoredEnrollment(input.vault, stored);

  await confirmPendingUpload(input.transport, input.vault, stored);

  return {
    replenishedOneTimePrekeys: mintedOneTimeIds.length,
    rotatedSignedPreKey: rotatedSignedPreKeyId !== undefined,
  };
}
