/**
 * Device linking and root rotation (ADR 0037 §1–§3): the ceremony by which a device that does
 * NOT hold the messaging root gets certified — either by an authority device that does (linking,
 * §1) or by minting a brand-new identity generation (rotation, §2).
 *
 * Linking never moves the root key. The new device signs a link offer with its own device key,
 * the node relays only public material, and the authority device signs the new device's
 * certificate + a carried-forward roster after the user confirms a short authentication string
 * (SAS) out of band — exactly as a safety-number comparison does for peers (§1, §3.3). Rotation
 * is the recovery path: a fresh root generation, self-signed (and, when the previous root key is
 * still held locally, countersigned by it for a "planned" rotation peers can accept without a
 * hard identity-change warning), with every prior device carried forward inactive (§2, §14.4 —
 * a device is marked inactive, never dropped).
 *
 * Every function here fails closed: a malformed, tampered, or expired offer is either skipped
 * (when listing) or rejected with a fixed-copy `DeviceLinkError` (when acting on one) — never a
 * message containing key or offer bytes (spec §194).
 */
import { create } from '@bufbuild/protobuf';
import {
  E2eeDeviceLinkOfferSchema,
  E2eeServiceBeginDeviceLinkRequestSchema,
  PublishIdentityRootRequestSchema,
  RevokeDeviceRequestSchema,
  type E2eeDeviceLinkOffer,
} from '@patches/proto/es';
import {
  bytesEqual,
  countersignMessagingRoot,
  decodeDeviceLinkOffer,
  deviceLinkSas,
  identityTranscriptDigest,
  encodeDeviceCertificateTranscript,
  generateSigningKeyPair,
  signDeviceLinkOffer,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  sortRosterEntries,
  verifyCertifiedDevice,
  verifyDeviceLinkOffer,
  verifyMessagingRoot,
  verifyRosterSnapshot,
  ByteReader,
  ByteWriter,
  KEY_BYTES,
  SIGNATURE_BYTES,
  type DeviceRosterEntryTranscript,
  type KeyPair,
} from '@patches/crypto';
import { assertRosterNotRolledBack, E2EE_DEVICE_CERTIFICATE_VERSION } from '@patches/domain';

import { verifyActorChain } from './chain.js';
import { fromDate } from '../api/wire/time.js';
import type { LocalDeviceIdentity, LocalOneTimePreKey } from './local-identity.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import {
  buildIdentityRootWire,
  buildRosterWire,
  CERTIFICATE_LIFETIME_MS,
  generateDeviceKeyMaterial,
  loadStoredEnrollment,
  saveStoredEnrollment,
  generateEnrollment,
  type EnrollmentTransport,
  type StoredEnrollment,
} from './enrollment.js';

/** How the new device's own device id ends up on this run — decoded from the pending offer,
 * never re-derived, so a mismatch between the stored offer and a served certificate is caught
 * by comparison rather than assumed away. */
interface PendingLinkOfferWithFields extends PendingLinkOffer {
  readonly deviceId: string;
  readonly offerExpiresAtMs: number;
}

async function loadPendingLinkOfferWithFields(
  vault: RatchetSessionVault,
): Promise<PendingLinkOfferWithFields | undefined> {
  const record = await loadPendingLinkOffer(vault);
  if (record === undefined) return undefined;
  const fields = decodeExistingOfferFields(record.offerBytes);
  if (fields === undefined) return undefined;
  return { ...record, deviceId: fields.deviceId, offerExpiresAtMs: fields.expiresAtMs };
}

// ---------------------------------------------------------------------------
// Own-roster convergence (issue #277) — every device re-syncs its OWN stored roster
// snapshot against whatever the node currently serves, instead of trusting the snapshot
// it happened to hold at enrollment/link time forever.
// ---------------------------------------------------------------------------

export interface RefreshOwnRosterInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
}

export interface RefreshOwnRosterResult {
  /** True when the served roster digest differed from the stored one and was persisted. */
  readonly changed: boolean;
  readonly sequence: bigint;
  /** False when the served roster lists this device inactive (revoked) — the caller must
   * refuse to send with {@link E2EE_DEVICE_REVOKED_COPY} rather than seal an envelope a
   * peer would never trust. */
  readonly selfActive: boolean;
}

/**
 * Fetches this account's currently served root + device roster, verifies the whole chain
 * through `chain.ts` (never the node's decoded convenience view alone), rejects a served
 * roster older than the one this device already verified (`assertRosterNotRolledBack` —
 * a stale-looking-active roster is exactly how a node could resurrect a revoked device),
 * and — only when the digest actually moved forward — persists the new roster (and this
 * device's own certificate, if the node re-served a different one) into the stored
 * enrollment atomically. `session-setup.ts`'s X3DH binds the roster digest into the
 * handshake transcript (ADR 0020 §7/§8), so every own device must converge on the SAME
 * served digest before it can complete a handshake with a peer that fetched it fresh.
 */
export async function refreshOwnRoster(
  input: RefreshOwnRosterInput,
): Promise<RefreshOwnRosterResult> {
  const nowMs = input.nowMs();
  const stored = await loadStoredEnrollment(input.vault, nowMs);
  if (stored === undefined) {
    throw new Error('refreshOwnRoster requires an already-enrolled device.');
  }

  const rootWire = await input.transport.getIdentityRoot(input.actorId);
  if (rootWire === undefined || rootWire.publicKey.length === 0) {
    throw new DeviceLinkError('no-remote-root');
  }
  const rosterResponse = await input.transport.getDeviceRoster(input.actorId);
  if (rosterResponse.roster === undefined) throw new DeviceLinkError('no-remote-root');

  const chain = verifyActorChain({
    rootWire,
    rosterWire: rosterResponse.roster,
    certificatesWire: rosterResponse.certificates,
    now: new Date(nowMs),
  });
  assertRosterNotRolledBack(BigInt(stored.identity.ownRoster.sequence), chain.roster);
  const selfActive = chain.activeDevices.has(stored.identity.deviceId);

  const cryptoRoot = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  const servedRoster = verifyRosterSnapshot({
    rosterBytes: rosterResponse.roster.rosterBytes,
    rootSignature: rosterResponse.roster.rootSignature,
    root: cryptoRoot,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });

  const changed = !bytesEqual(servedRoster.rosterDigest, stored.identity.ownRoster.rosterDigest);
  if (!changed) {
    return { changed: false, sequence: BigInt(servedRoster.sequence), selfActive };
  }

  const selfCertificateWire = rosterResponse.certificates.find(
    (candidate) => candidate.deviceId === stored.identity.deviceId,
  );
  const selfDevice =
    selfCertificateWire === undefined
      ? stored.identity.selfDevice
      : verifyCertifiedDevice({
          certificateBytes: selfCertificateWire.certificateBytes,
          rootSignature: selfCertificateWire.rootSignature,
          root: cryptoRoot,
          nowMs,
        });

  const updated: StoredEnrollment = {
    ...stored,
    identity: { ...stored.identity, ownRoster: servedRoster, selfDevice },
  };
  await saveStoredEnrollment(input.vault, updated);
  return { changed: true, sequence: BigInt(servedRoster.sequence), selfActive };
}

// ---------------------------------------------------------------------------
// New-device side (ADR 0037 §1 step 4) — polling for the authority's approval
// ---------------------------------------------------------------------------

export interface PollLinkedEnrollmentInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
}

export type PollLinkedEnrollmentResult = 'pending' | 'enrolled' | 'expired';

/**
 * Checks whether the authority has approved this device's pending link offer yet. Never trusts
 * the served roster/certificates on their own: `verifyActorChain` (`chain.ts`) re-derives the
 * whole chain from the signed transcripts first, exactly as a peer's client would when reading
 * this same account, and only a chain that both verifies AND lists this device active as of
 * `nowMs` counts as enrolled. Any inconsistency — not yet visible, a chain that fails to verify,
 * a served roster missing this device's certificate — reads as `'pending'`, never as `'expired'`
 * or an error: the offer may simply not have propagated yet.
 */
export async function pollLinkedEnrollment(
  input: PollLinkedEnrollmentInput,
): Promise<PollLinkedEnrollmentResult> {
  const nowMs = input.nowMs();
  const pending = await loadPendingLinkOfferWithFields(input.vault);
  if (pending === undefined) return 'expired';
  if (nowMs >= pending.offerExpiresAtMs) {
    await deletePendingLinkOffer(input.vault);
    return 'expired';
  }

  const rootWire = await input.transport.getIdentityRoot(input.actorId);
  if (rootWire === undefined || rootWire.publicKey.length === 0) return 'pending';
  const rosterResponse = await input.transport.getDeviceRoster(input.actorId);
  if (rosterResponse.roster === undefined) return 'pending';

  let chain;
  try {
    chain = verifyActorChain({
      rootWire,
      rosterWire: rosterResponse.roster,
      certificatesWire: rosterResponse.certificates,
      now: new Date(nowMs),
    });
  } catch {
    return 'pending';
  }
  if (!chain.activeDevices.has(pending.deviceId)) return 'pending';

  const certificateWire = rosterResponse.certificates.find(
    (candidate) => candidate.deviceId === pending.deviceId,
  );
  if (certificateWire === undefined) return 'pending';

  // Re-verified through the `@patches/crypto` types `LocalDeviceIdentity` actually needs
  // (`chain.ts` returns the `@patches/domain` view used for peer-chain rendering, a different
  // shape) — the SAME served bytes `verifyActorChain` above already trusted, so this is
  // structural reconstruction, not a second trust decision.
  const cryptoRoot = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  const selfDevice = verifyCertifiedDevice({
    certificateBytes: certificateWire.certificateBytes,
    rootSignature: certificateWire.rootSignature,
    root: cryptoRoot,
    nowMs,
  });
  const ownRoster = verifyRosterSnapshot({
    rosterBytes: rosterResponse.roster.rosterBytes,
    rootSignature: rosterResponse.roster.rootSignature,
    root: cryptoRoot,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });

  const identity: LocalDeviceIdentity = {
    actorId: input.actorId,
    deviceId: pending.deviceId,
    keys: { signing: pending.signing, agreement: pending.agreement },
    selfDevice,
    ownRoster,
    signedPreKey: {
      id: pending.signedPreKeyId,
      keyPair: pending.signedPreKeyPair,
      createdAtMs: pending.certificateCreatedAtMs,
      expiresAtMs: pending.signedPreKeyExpiresAtMs,
    },
    ownBundle: {
      bundleBytes: pending.prekeyBundleBytes,
      deviceSignature: pending.prekeyBundleSignature,
    },
    oneTimePreKeys: pending.oneTimePreKeys,
  };
  const record: StoredEnrollment = {
    submitted: true,
    createdRoot: false,
    rootPrivate: undefined,
    rootPublic: cryptoRoot.publicKey,
    identity,
    // Issue #278: this device's own inventory starts at exactly the ids the authority
    // handed it (`pending.oneTimePreKeys`, minted by `beginDeviceLinkOffer`) — the next
    // locally-minted id must continue past every one of those, never restart at 1.
    nextOneTimePrekeyId:
      pending.oneTimePreKeys.reduce((max, prekey) => Math.max(max, prekey.id), 0) + 1,
    previousSignedPreKeys: [],
    pendingPrekeyUpload: undefined,
  };
  await saveStoredEnrollment(input.vault, record);
  await deletePendingLinkOffer(input.vault);
  return 'enrolled';
}

// ---------------------------------------------------------------------------
// Authority side (ADR 0037 §1 steps 2–3)
// ---------------------------------------------------------------------------

interface VerifiedPendingOffer {
  readonly linkId: string;
  readonly deviceId: string;
  readonly signingPublicKey: Uint8Array;
  readonly agreementPublicKey: Uint8Array;
  readonly supportedProtocolVersions: readonly string[];
  readonly offerCreatedAtMs: number;
  readonly offerExpiresAtMs: number;
  readonly offerBytes: Uint8Array;
  readonly wire: E2eeDeviceLinkOffer;
}

/**
 * Re-verifies every offer the node currently reports pending for this actor, from the bytes
 * received — never the node's decoded convenience view (ADR 0037 §1 step 2, §3.3). An offer that
 * fails to decode, fails its signature, has expired, or whose decoded `actorId`/`deviceId`
 * disagrees with what the node filed it under is silently excluded, never surfaced as an error:
 * a node substituting or corrupting one offer must not block every other pending link.
 */
async function verifiedPendingOffers(
  transport: EnrollmentTransport,
  actorId: string,
  nowMs: number,
): Promise<readonly VerifiedPendingOffer[]> {
  const response = await transport.listPendingDeviceLinks();
  const results: VerifiedPendingOffer[] = [];
  for (const wire of response.offers) {
    if (wire.signedPrekey === undefined) continue;
    let verified;
    try {
      verified = verifyDeviceLinkOffer({
        offerBytes: wire.offerBytes,
        deviceSignature: wire.deviceSignature,
        nowMs,
      });
    } catch {
      continue;
    }
    if (verified.actorId !== actorId || verified.deviceId !== wire.deviceId) continue;
    results.push({
      linkId: wire.linkId,
      deviceId: verified.deviceId,
      signingPublicKey: verified.signingPublicKey,
      agreementPublicKey: verified.agreementPublicKey,
      supportedProtocolVersions: verified.supportedProtocolVersions,
      offerCreatedAtMs: verified.createdAtMs,
      offerExpiresAtMs: verified.expiresAtMs,
      offerBytes: wire.offerBytes,
      wire,
    });
  }
  return results;
}

async function requireAuthority(
  vault: RatchetSessionVault,
  nowMs: number,
): Promise<StoredEnrollment & { readonly rootPrivate: Uint8Array }> {
  const stored = await loadStoredEnrollment(vault, nowMs);
  if (stored === undefined || stored.rootPrivate === undefined) {
    throw new DeviceLinkError('not-authority');
  }
  return { ...stored, rootPrivate: stored.rootPrivate };
}

export interface ListLinkOffersInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
}

export interface PendingLinkOfferSummary {
  readonly linkId: string;
  readonly deviceId: string;
  readonly sas: string;
  readonly expiresAtMs: number;
}

/** Lists this account's pending link offers with a freshly re-derived SAS for each, for the
 * authority device to compare against the new device's own display (ADR 0037 §1 step 2). Throws
 * {@link DeviceLinkError} `'not-authority'` when this device does not hold the root key —
 * approving a link is authority-only, never delegated. */
export async function listLinkOffers(
  input: ListLinkOffersInput,
): Promise<readonly PendingLinkOfferSummary[]> {
  const nowMs = input.nowMs();
  await requireAuthority(input.vault, nowMs);
  const offers = await verifiedPendingOffers(input.transport, input.actorId, nowMs);
  return offers.map((offer) => ({
    linkId: offer.linkId,
    deviceId: offer.deviceId,
    sas: deviceLinkSas(offer.offerBytes, input.actorId),
    expiresAtMs: offer.offerExpiresAtMs,
  }));
}

export interface ApproveLinkOfferInput {
  readonly actorId: string;
  readonly linkId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
}

export interface ApproveLinkOfferResult {
  readonly deviceId: string;
  readonly rosterSequence: bigint;
}

/**
 * Signs the new device's certificate and a carried-forward roster (ADR 0037 §1 step 3), after
 * the caller has already confirmed the SAS matches out of band — this function does not ask
 * again, the caller UI owns that confirmation gate. The new device's private keys never cross
 * this call: only its already-generated public material and already device-signed prekey bundle
 * (from the offer) are used, matching `generateEnrollment`'s `deviceMaterial` contract exactly.
 */
export async function approveLinkOffer(
  input: ApproveLinkOfferInput,
): Promise<ApproveLinkOfferResult> {
  const nowMs = input.nowMs();
  const stored = await requireAuthority(input.vault, nowMs);
  const offers = await verifiedPendingOffers(input.transport, input.actorId, nowMs);
  const offer = offers.find((candidate) => candidate.linkId === input.linkId);
  if (offer === undefined) throw new DeviceLinkError('offer-unavailable');
  const signedPrekey = offer.wire.signedPrekey;
  if (signedPrekey === undefined) throw new DeviceLinkError('offer-unavailable');

  const rootWire = await input.transport.getIdentityRoot(input.actorId);
  if (rootWire === undefined || rootWire.publicKey.length === 0) {
    throw new DeviceLinkError('not-authority');
  }
  const cryptoRoot = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  if (!bytesEqual(cryptoRoot.publicKey, stored.rootPublic)) {
    throw new DeviceLinkError('not-authority');
  }
  const rosterResponse = await input.transport.getDeviceRoster(input.actorId);
  if (rosterResponse.roster === undefined) throw new DeviceLinkError('not-authority');
  const currentRoster = verifyRosterSnapshot({
    rosterBytes: rosterResponse.roster.rosterBytes,
    rootSignature: rosterResponse.roster.rootSignature,
    root: cryptoRoot,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });

  const certificateCreatedAtMs = offer.offerCreatedAtMs;
  const certificateExpiresAtMs = certificateCreatedAtMs + CERTIFICATE_LIFETIME_MS;
  const generated = generateEnrollment({
    actorId: input.actorId,
    root: {
      privateKey: stored.rootPrivate,
      publicKey: stored.rootPublic,
      createdAtMs: cryptoRoot.createdAtMs,
      generation: cryptoRoot.generation,
      currentRoster,
      certificates: rosterResponse.certificates.map((certificate) => ({
        certificateBytes: certificate.certificateBytes,
        rootSignature: certificate.rootSignature,
      })),
    },
    deviceMaterial: {
      deviceId: offer.deviceId,
      signingPublicKey: offer.signingPublicKey,
      agreementPublicKey: offer.agreementPublicKey,
      supportedProtocolVersions: offer.supportedProtocolVersions,
      certificateCreatedAtMs,
      certificateExpiresAtMs,
      signedPrekey,
      oneTimePrekeys: offer.wire.oneTimePrekeys,
      prekeyBundleBytes: offer.wire.prekeyBundleBytes,
      prekeyBundleSignature: offer.wire.prekeyBundleSignature,
    },
    nowMs,
  });

  await input.transport.enrollDevice(generated.enrollRequest);
  await input.transport.cancelDeviceLink(input.linkId);

  // Issue #277: the roster just published (`generated.record.identity.ownRoster`) is the
  // account's new roster — this authority device's own stored roster must converge on it
  // too, or its NEXT own send/receive still X3DHs against the pre-link digest a peer that
  // fetched fresh will never match.
  const updatedAuthorityRecord: StoredEnrollment = {
    ...stored,
    identity: { ...stored.identity, ownRoster: generated.record.identity.ownRoster },
  };
  await saveStoredEnrollment(input.vault, updatedAuthorityRecord);

  return {
    deviceId: offer.deviceId,
    rosterSequence: BigInt(generated.record.identity.ownRoster.sequence),
  };
}

// ---------------------------------------------------------------------------
// Root rotation (ADR 0037 §2) — the recovery path when no authority device is reachable
// ---------------------------------------------------------------------------

export interface RotateMessagingRootInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
  /** Present only when this device holds the CURRENT served root's private key locally (an
   * imported recovery archive, #272) — a "planned" rotation the previous root countersigns, so
   * peers can accept it without the hard identity-change warning (ADR 0037 §2, §3's
   * planned-vs-unverified distinction). Its `publicKey` must equal the currently served root's
   * public key; this function never fakes the countersignature over a mismatched key. */
  readonly previousRoot?: { readonly privateKey: Uint8Array; readonly publicKey: Uint8Array };
}

export interface RotateMessagingRootResult {
  readonly generation: number;
  readonly rosterSequence: bigint;
  readonly planned: boolean;
}

/**
 * Mints identity generation G+1, publishes it with a roster that carries every previously
 * served device forward inactive (§14.4 — never dropped), then enrolls this device as the sole
 * active entry of the NEXT roster sequence via the ordinary `EnrollDevice` path (mirrors
 * `generateEnrollment`'s non-bootstrap "linking" shape: two roster writes, one for the rotation
 * itself, one for the device `EnrollDevice` mints — matching how the node's `appendRoster`
 * requires every newly-active entry to already have a saved certificate).
 */
export async function rotateMessagingRoot(
  input: RotateMessagingRootInput,
): Promise<RotateMessagingRootResult> {
  const nowMs = input.nowMs();
  const rootWire = await input.transport.getIdentityRoot(input.actorId);
  if (rootWire === undefined || rootWire.publicKey.length === 0) {
    throw new DeviceLinkError('no-remote-root');
  }
  const servedRoot = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  // A root with no roster is a real state (an account whose devices were all lost or purged
  // before any roster was published, or a root republished after a failed enrollment). It is
  // still a published identity, so rotation must proceed from a genesis roster rather than
  // telling the user there is nothing to rotate.
  const rosterResponse = await input.transport.getDeviceRoster(input.actorId);
  const servedRoster =
    rosterResponse.roster === undefined
      ? undefined
      : verifyRosterSnapshot({
          rosterBytes: rosterResponse.roster.rosterBytes,
          rootSignature: rosterResponse.roster.rootSignature,
          root: servedRoot,
          certificates: rosterResponse.certificates.map((certificate) => ({
            certificateBytes: certificate.certificateBytes,
            rootSignature: certificate.rootSignature,
          })),
          nowMs,
        });

  const previousRoot = input.previousRoot;
  const planned =
    previousRoot !== undefined && bytesEqual(previousRoot.publicKey, servedRoot.publicKey);

  const newRootKeys = generateSigningKeyPair();
  const newGeneration = servedRoot.generation + 1;
  const signedRoot = signMessagingRoot(newRootKeys.privateKey, {
    actorId: input.actorId,
    generation: newGeneration,
    publicKey: newRootKeys.publicKey,
    createdAtMs: nowMs,
  });
  const previousRootSignature =
    planned && previousRoot !== undefined
      ? countersignMessagingRoot(previousRoot.privateKey, signedRoot.rootBytes)
      : undefined;
  const verifiedNewRoot = verifyMessagingRoot({
    rootBytes: signedRoot.rootBytes,
    selfSignature: signedRoot.selfSignature,
    nowMs,
    ...(previousRootSignature === undefined
      ? {}
      : { previousRootSignature, previousRoot: servedRoot }),
  });

  const carriedEntries: DeviceRosterEntryTranscript[] = (servedRoster?.entries ?? []).map(
    (entry) => ({
      deviceId: entry.deviceId,
      certificateDigest: entry.certificateDigest,
      active: false,
      addedAtMs: entry.addedAtMs,
      revokedAtMs: entry.revokedAtMs ?? nowMs,
    }),
  );
  const rotationSequence = servedRoster === undefined ? 1 : servedRoster.sequence + 1;
  const signedRotationRoster = signDeviceRoster(newRootKeys.privateKey, {
    actorId: input.actorId,
    rootGeneration: newGeneration,
    rootPublicKey: newRootKeys.publicKey,
    sequence: rotationSequence,
    previousDigest:
      servedRoster === undefined ? new Uint8Array(KEY_BYTES) : servedRoster.rosterDigest,
    createdAtMs: nowMs,
    entries: sortRosterEntries(carriedEntries),
  });
  const verifiedRotationRoster = verifyRosterSnapshot({
    rosterBytes: signedRotationRoster.rosterBytes,
    rootSignature: signedRotationRoster.rootSignature,
    root: verifiedNewRoot,
    certificates: [],
    nowMs,
  });

  // Durable before either network call (ADR 0020 §4): a device-material record for the
  // upcoming `EnrollDevice` call, so a crash between here and either RPC resumes rather than
  // minting a second rotation.
  const generated = generateEnrollment({
    actorId: input.actorId,
    root: {
      privateKey: newRootKeys.privateKey,
      publicKey: newRootKeys.publicKey,
      createdAtMs: nowMs,
      generation: newGeneration,
      currentRoster: verifiedRotationRoster,
      certificates: [],
    },
    nowMs,
  });
  await saveStoredEnrollment(input.vault, generated.record);

  await input.transport.publishIdentityRoot(
    create(PublishIdentityRootRequestSchema, {
      identityRoot: buildIdentityRootWire({
        actorId: input.actorId,
        generation: newGeneration,
        publicKey: newRootKeys.publicKey,
        rootBytes: signedRoot.rootBytes,
        selfSignature: signedRoot.selfSignature,
        createdAtMs: nowMs,
        ...(previousRootSignature === undefined ? {} : { previousRootSignature }),
      }),
      roster: buildRosterWire(verifiedRotationRoster),
    }),
  );
  await input.transport.enrollDevice(generated.enrollRequest);

  const submitted: StoredEnrollment = { ...generated.record, submitted: true };
  await saveStoredEnrollment(input.vault, submitted);

  return {
    generation: newGeneration,
    rosterSequence: BigInt(submitted.identity.ownRoster.sequence),
    planned,
  };
}

// ---------------------------------------------------------------------------
// Single-device revocation (issue #277 comment) — the authority signs roster S+1 with
// exactly ONE entry marked inactive, unlike `rotateMessagingRoot`'s full-identity reset.
// ---------------------------------------------------------------------------

export interface RevokeLinkedDeviceInput {
  readonly actorId: string;
  readonly deviceId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
}

export interface RevokeLinkedDeviceResult {
  readonly rosterSequence: bigint;
}

/**
 * Signs and publishes roster S+1 with `deviceId` marked inactive (`revokedAtMs = now`),
 * every other entry carried forward verbatim (§14.4), and persists the new roster into
 * this (authority) device's own stored enrollment before returning — the revoked device's
 * next `refreshOwnRoster` sees itself inactive there and its runtime refuses to send.
 * Authority-only, same gate as `approveLinkOffer`/`listLinkOffers`; revoking THIS device
 * is refused rather than mailed through — a device can never sign itself out from under
 * the caller mid-call, and the actual "I don't trust this computer anymore" path is
 * `rotateMessagingRoot` (a full identity change) or acting from a different device.
 */
export async function revokeLinkedDevice(
  input: RevokeLinkedDeviceInput,
): Promise<RevokeLinkedDeviceResult> {
  const nowMs = input.nowMs();
  const stored = await requireAuthority(input.vault, nowMs);
  if (input.deviceId === stored.identity.deviceId) {
    throw new DeviceLinkError('cannot-revoke-self');
  }

  const rootWire = await input.transport.getIdentityRoot(input.actorId);
  if (rootWire === undefined || rootWire.publicKey.length === 0) {
    throw new DeviceLinkError('not-authority');
  }
  const cryptoRoot = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  if (!bytesEqual(cryptoRoot.publicKey, stored.rootPublic)) {
    throw new DeviceLinkError('not-authority');
  }
  const rosterResponse = await input.transport.getDeviceRoster(input.actorId);
  if (rosterResponse.roster === undefined) throw new DeviceLinkError('not-authority');
  const currentRoster = verifyRosterSnapshot({
    rosterBytes: rosterResponse.roster.rosterBytes,
    rootSignature: rosterResponse.roster.rootSignature,
    root: cryptoRoot,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });
  const targetEntry = currentRoster.entries.find((entry) => entry.deviceId === input.deviceId);
  if (targetEntry === undefined || !targetEntry.active) {
    throw new DeviceLinkError('device-not-found');
  }

  const carriedEntries: DeviceRosterEntryTranscript[] = currentRoster.entries.map((entry) =>
    entry.deviceId === input.deviceId
      ? {
          deviceId: entry.deviceId,
          certificateDigest: entry.certificateDigest,
          active: false,
          addedAtMs: entry.addedAtMs,
          revokedAtMs: nowMs,
        }
      : {
          deviceId: entry.deviceId,
          certificateDigest: entry.certificateDigest,
          active: entry.active,
          addedAtMs: entry.addedAtMs,
          ...(entry.revokedAtMs === undefined ? {} : { revokedAtMs: entry.revokedAtMs }),
        },
  );
  const sequence = currentRoster.sequence + 1;
  const signedRoster = signDeviceRoster(stored.rootPrivate, {
    actorId: input.actorId,
    rootGeneration: currentRoster.rootGeneration,
    rootPublicKey: cryptoRoot.publicKey,
    sequence,
    previousDigest: currentRoster.rosterDigest,
    createdAtMs: nowMs,
    entries: sortRosterEntries(carriedEntries),
  });
  const verifiedRoster = verifyRosterSnapshot({
    rosterBytes: signedRoster.rosterBytes,
    rootSignature: signedRoster.rootSignature,
    root: cryptoRoot,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });

  await input.transport.revokeDevice(
    create(RevokeDeviceRequestSchema, {
      deviceId: input.deviceId,
      roster: buildRosterWire(verifiedRoster),
    }),
  );

  const updated: StoredEnrollment = {
    ...stored,
    identity: { ...stored.identity, ownRoster: verifiedRoster },
  };
  await saveStoredEnrollment(input.vault, updated);

  return { rosterSequence: BigInt(verifiedRoster.sequence) };
}

/** Offer validity window (ADR 0037 §1: "at most 10 minutes"). */
const LINK_OFFER_LIFETIME_MS = 10 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Errors — fixed copy only, never key/offer bytes (spec §194)
// ---------------------------------------------------------------------------

export type DeviceLinkErrorReason =
  | 'not-authority'
  | 'offer-unavailable'
  | 'no-remote-root'
  | 'cannot-revoke-self'
  | 'device-not-found';

/** Fixed, non-key-leaking copy for every {@link DeviceLinkError} reason (ADR 0037 §2's ethos
 * applied to the narrower link/rotation failures). */
export const DEVICE_LINK_ERROR_COPY: Readonly<Record<DeviceLinkErrorReason, string>> = {
  'not-authority':
    'This device does not hold this account’s messaging authority key, so it cannot ' +
    'approve another device or start a new identity.',
  'offer-unavailable':
    'That device-link request is no longer available — it may have expired or already been ' +
    'used. Ask the other device to start linking again.',
  'no-remote-root': 'This account has no published messaging identity to link against or rotate.',
  'cannot-revoke-self':
    'This device cannot revoke itself. Revoke it from a different enrolled device, or start a ' +
    'new messaging identity from this one instead.',
  'device-not-found': 'That device is not an active entry on this account’s roster.',
};

export class DeviceLinkError extends Error {
  readonly reason: DeviceLinkErrorReason;
  constructor(reason: DeviceLinkErrorReason) {
    super(DEVICE_LINK_ERROR_COPY[reason]);
    this.name = 'DeviceLinkError';
    this.reason = reason;
  }
}

/** Fixed copy a revoked device's runtime shows instead of sending (issue #277) — never a
 * raw crypto/authentication error, and never key or roster bytes (spec §194). */
export const E2EE_DEVICE_REVOKED_COPY =
  'This device has been revoked from this account and can no longer send messages. Link it ' +
  'again from an active device, or start a new messaging identity, to use it here.';

// ---------------------------------------------------------------------------
// Pending link offer — the new device's own resumable state (ADR 0037 §1)
// ---------------------------------------------------------------------------

/** Reserved vault record key, mirroring `ENROLLMENT_RECORD_KEY`'s NUL-prefix convention. */
export const LINK_OFFER_RECORD_KEY = '\0patches-e2ee-link-offer';

interface PendingLinkOffer {
  /** Empty until the node has assigned one (persisted before `beginDeviceLink` per ADR 0020
   * §4's commit-before-network rule; the offer material itself never changes on resume). */
  readonly linkId: string;
  readonly signing: KeyPair;
  readonly agreement: KeyPair;
  readonly offerBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
  readonly certificateCreatedAtMs: number;
  readonly certificateExpiresAtMs: number;
  readonly signedPreKeyId: number;
  readonly signedPreKeyPair: KeyPair;
  readonly signedPreKeyExpiresAtMs: number;
  readonly oneTimePreKeys: readonly LocalOneTimePreKey[];
  readonly prekeyBundleBytes: Uint8Array;
  readonly prekeyBundleSignature: Uint8Array;
}

const PENDING_LINK_OFFER_VERSION = 1;

function writeKey(writer: ByteWriter, key: KeyPair): void {
  writer.fixed(key.privateKey, KEY_BYTES).fixed(key.publicKey, KEY_BYTES);
}

function readKey(reader: ByteReader): KeyPair {
  return { privateKey: reader.fixed(KEY_BYTES), publicKey: reader.fixed(KEY_BYTES) };
}

function encodePendingLinkOffer(record: PendingLinkOffer): Uint8Array {
  const writer = new ByteWriter().u8(PENDING_LINK_OFFER_VERSION).string(record.linkId);
  writeKey(writer, record.signing);
  writeKey(writer, record.agreement);
  writer.bytes(record.offerBytes).fixed(record.deviceSignature, SIGNATURE_BYTES);
  writer.u64(record.certificateCreatedAtMs).u64(record.certificateExpiresAtMs);
  writer.u32(record.signedPreKeyId);
  writeKey(writer, record.signedPreKeyPair);
  writer.u64(record.signedPreKeyExpiresAtMs);
  writer.u32(record.oneTimePreKeys.length);
  for (const prekey of record.oneTimePreKeys) {
    writer.u32(prekey.id);
    writeKey(writer, prekey.keyPair);
  }
  writer.bytes(record.prekeyBundleBytes).fixed(record.prekeyBundleSignature, SIGNATURE_BYTES);
  return writer.finish();
}

function decodePendingLinkOffer(bytes: Uint8Array): PendingLinkOffer {
  const reader = new ByteReader(bytes);
  const version = reader.u8();
  if (version !== PENDING_LINK_OFFER_VERSION) {
    throw new Error('Unsupported pending link offer record version.');
  }
  const linkId = reader.string();
  const signing = readKey(reader);
  const agreement = readKey(reader);
  const offerBytes = reader.bytes();
  const deviceSignature = reader.fixed(SIGNATURE_BYTES);
  const certificateCreatedAtMs = reader.u64();
  const certificateExpiresAtMs = reader.u64();
  const signedPreKeyId = reader.u32();
  const signedPreKeyPair = readKey(reader);
  const signedPreKeyExpiresAtMs = reader.u64();
  const oneTimeCount = reader.u32();
  const oneTimePreKeys: LocalOneTimePreKey[] = [];
  for (let index = 0; index < oneTimeCount; index += 1) {
    const id = reader.u32();
    oneTimePreKeys.push({ id, keyPair: readKey(reader) });
  }
  const prekeyBundleBytes = reader.bytes();
  const prekeyBundleSignature = reader.fixed(SIGNATURE_BYTES);
  reader.end();
  return {
    linkId,
    signing,
    agreement,
    offerBytes,
    deviceSignature,
    certificateCreatedAtMs,
    certificateExpiresAtMs,
    signedPreKeyId,
    signedPreKeyPair,
    signedPreKeyExpiresAtMs,
    oneTimePreKeys,
    prekeyBundleBytes,
    prekeyBundleSignature,
  };
}

async function loadPendingLinkOffer(
  vault: RatchetSessionVault,
): Promise<PendingLinkOffer | undefined> {
  const bytes = await vault.getOpaqueRecord(LINK_OFFER_RECORD_KEY);
  if (bytes === undefined) return undefined;
  try {
    return decodePendingLinkOffer(bytes);
  } catch {
    // An undecodable record cannot be resumed or trusted; treat it as absent (ADR 0033 §3's
    // "fail closed rather than half-trust a stored record" rule, applied to link offers).
    return undefined;
  }
}

async function savePendingLinkOffer(
  vault: RatchetSessionVault,
  record: PendingLinkOffer,
): Promise<void> {
  await vault.putOpaqueRecord(LINK_OFFER_RECORD_KEY, encodePendingLinkOffer(record));
}

async function deletePendingLinkOffer(vault: RatchetSessionVault): Promise<void> {
  await vault.putOpaqueRecord(LINK_OFFER_RECORD_KEY, new Uint8Array(0));
}

function buildOfferWire(
  record: PendingLinkOffer,
  actorId: string,
  deviceId: string,
): E2eeDeviceLinkOffer {
  return create(E2eeDeviceLinkOfferSchema, {
    linkId: record.linkId,
    actorId,
    deviceId,
    offerBytes: record.offerBytes,
    deviceSignature: record.deviceSignature,
    signedPrekey: {
      keyId: BigInt(record.signedPreKeyId),
      publicKey: record.signedPreKeyPair.publicKey,
      signature: record.prekeyBundleSignature,
      createdAt: fromDate(new Date(record.certificateCreatedAtMs)),
      expiresAt: fromDate(new Date(record.signedPreKeyExpiresAtMs)),
    },
    oneTimePrekeys: record.oneTimePreKeys.map((prekey) => ({
      keyId: BigInt(prekey.id),
      publicKey: prekey.keyPair.publicKey,
    })),
    prekeyBundleBytes: record.prekeyBundleBytes,
    prekeyBundleSignature: record.prekeyBundleSignature,
  });
}

// ---------------------------------------------------------------------------
// New-device side (ADR 0037 §1 steps 1, 4)
// ---------------------------------------------------------------------------

export interface BeginDeviceLinkOfferInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs: () => number;
}

export interface BeginDeviceLinkOfferResult {
  readonly linkId: string;
  readonly sas: string;
  readonly expiresAtMs: number;
}

/**
 * Generates this device's key material, signs a link offer over it, and posts the offer to the
 * node via `BeginDeviceLink`. Idempotent: a stored, unexpired offer is re-used — and re-posted
 * only if the node no longer has it — rather than regenerated, so a crash or retry never mints a
 * second identity for the same physical device (mirrors `enrollThisDevice`'s resume rule).
 */
export async function beginDeviceLinkOffer(
  input: BeginDeviceLinkOfferInput,
): Promise<BeginDeviceLinkOfferResult> {
  const nowMs = input.nowMs();
  const existing = await loadPendingLinkOffer(input.vault);
  if (existing !== undefined) {
    const offerFields = decodeExistingOfferFields(existing.offerBytes);
    if (offerFields !== undefined && offerFields.expiresAtMs > nowMs) {
      let record = existing;
      if (record.linkId === '') {
        record = await postOffer(input, record, offerFields.deviceId);
      } else {
        const pending = await input.transport.listPendingDeviceLinks();
        const stillThere = pending.offers.some((offer) => offer.linkId === record.linkId);
        if (!stillThere) record = await postOffer(input, record, offerFields.deviceId);
      }
      return {
        linkId: record.linkId,
        sas: deviceLinkSas(record.offerBytes, input.actorId),
        expiresAtMs: offerFields.expiresAtMs,
      };
    }
  }

  const remoteRoot = await input.transport.getIdentityRoot(input.actorId);
  if (remoteRoot === undefined || remoteRoot.publicKey.length === 0) {
    throw new DeviceLinkError('no-remote-root');
  }

  const material = generateDeviceKeyMaterial(nowMs);
  const offerFields = {
    actorId: input.actorId,
    deviceId: material.deviceId,
    signingPublicKey: material.signing.publicKey,
    agreementPublicKey: material.agreement.publicKey,
    supportedProtocolVersions: material.supportedProtocolVersions,
    createdAtMs: material.createdAtMs,
    expiresAtMs: material.createdAtMs + LINK_OFFER_LIFETIME_MS,
  };
  const signedOffer = signDeviceLinkOffer(material.signing.privateKey, offerFields);

  // Predicts the certificate the authority will mint (ADR 0037 §1, `GenerateEnrollmentInput`'s
  // `deviceMaterial` doc comment): both sides derive `certificateCreatedAtMs`/
  // `certificateExpiresAtMs` from the offer's own `createdAtMs`, so no extra wire field is
  // needed to agree on them, and the offering device predicts the exact transcript the
  // authority will re-sign against the root it already knows (public information via
  // `GetIdentityRoot`).
  const certificateCreatedAtMs = material.createdAtMs;
  const certificateExpiresAtMs = certificateCreatedAtMs + CERTIFICATE_LIFETIME_MS;
  const predictedCertificateBytes = encodeDeviceCertificateTranscript({
    actorId: input.actorId,
    deviceId: material.deviceId,
    rootGeneration: remoteRoot.generation,
    rootPublicKey: remoteRoot.publicKey,
    certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
    signingPublicKey: material.signing.publicKey,
    agreementPublicKey: material.agreement.publicKey,
    supportedProtocolVersions: [...material.supportedProtocolVersions],
    createdAtMs: certificateCreatedAtMs,
    expiresAtMs: certificateExpiresAtMs,
  });
  const predictedCertificateDigest = identityTranscriptDigest(predictedCertificateBytes);

  const signedBundle = signPreKeyBundle(material.signing.privateKey, {
    actorId: input.actorId,
    deviceId: material.deviceId,
    certificateDigest: predictedCertificateDigest,
    signedPrekeyId: material.signedPreKeyId,
    signedPrekeyPublicKey: material.signedPreKeyPair.publicKey,
    createdAtMs: certificateCreatedAtMs,
    expiresAtMs: material.signedPreKeyExpiresAtMs,
  });

  let record: PendingLinkOffer = {
    linkId: '',
    signing: material.signing,
    agreement: material.agreement,
    offerBytes: signedOffer.offerBytes,
    deviceSignature: signedOffer.deviceSignature,
    certificateCreatedAtMs,
    certificateExpiresAtMs,
    signedPreKeyId: material.signedPreKeyId,
    signedPreKeyPair: material.signedPreKeyPair,
    signedPreKeyExpiresAtMs: material.signedPreKeyExpiresAtMs,
    oneTimePreKeys: material.oneTimePreKeys,
    prekeyBundleBytes: signedBundle.bundleBytes,
    prekeyBundleSignature: signedBundle.deviceSignature,
  };
  // Durable BEFORE the network call (ADR 0020 §4): a crash between here and `beginDeviceLink`
  // resumes with the identical offer material rather than minting a second device identity.
  await savePendingLinkOffer(input.vault, record);
  record = await postOffer(input, record, material.deviceId);

  return {
    linkId: record.linkId,
    sas: deviceLinkSas(record.offerBytes, input.actorId),
    expiresAtMs: offerFields.expiresAtMs,
  };
}

/** Decodes (never re-signs) a resumed offer's own bytes to read its `deviceId`/`expiresAtMs`
 * back out — `beginDeviceLinkOffer` never re-verifies its own prior signature on resume, only
 * reposts the identical bytes. Malformed stored bytes are treated as absent, never trusted. */
function decodeExistingOfferFields(
  offerBytes: Uint8Array,
): { readonly deviceId: string; readonly expiresAtMs: number } | undefined {
  try {
    return decodeDeviceLinkOffer(offerBytes);
  } catch {
    return undefined;
  }
}

async function postOffer(
  input: BeginDeviceLinkOfferInput,
  record: PendingLinkOffer,
  deviceId: string,
): Promise<PendingLinkOffer> {
  const offerWire = buildOfferWire(record, input.actorId, deviceId);
  const response = await input.transport.beginDeviceLink(
    create(E2eeServiceBeginDeviceLinkRequestSchema, { offer: offerWire }),
  );
  const posted: PendingLinkOffer = { ...record, linkId: response.linkId };
  await savePendingLinkOffer(input.vault, posted);
  return posted;
}
