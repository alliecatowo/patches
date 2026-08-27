/**
 * Client-side certificate-chain verification over node-served data (ADR 0020 §2, §3) —
 * web port of the TUI module.
 *
 * These are the first production callers of `@patches/domain`'s
 * `verifyIdentityRoot`/`verifyDeviceCertificate`/`verifyRosterSignature` on the web
 * client: everything a thread-open, a safety-number screen, or a group-control
 * transcript renders is checked here first, against the authoritative bytes and with
 * strict RFC 8032 semantics — never against the node's decoded convenience views alone.
 *
 * Every function fails closed by throwing `E2eeContractError`; callers render a warning,
 * they never fall back to "probably fine".
 */
import {
  decodeDeviceCertificateTranscript,
  decodeDeviceRosterTranscript,
  sha256Hash,
  verifyStrict,
} from '@patches/crypto';
import {
  assertDeviceUsableForSend,
  assertRosterShape,
  bytesEqual,
  E2eeContractError,
  verifyDeviceCertificate,
  verifyIdentityRoot,
  verifyRosterSignature,
  type Bytes,
  type DigestFunction,
  type E2eeDeviceCertificateView,
  type E2eeDeviceRosterView,
  type E2eeIdentityRootView,
  type SignatureVerifier,
} from '@patches/domain';
import {
  E2eeDeviceStatus,
  type E2eeDeviceCertificate,
  type E2eeDeviceRoster,
  type E2eeIdentityRoot,
} from '@patches/proto/es';

import { toDate } from './wire-time.js';

/**
 * True when every decoded convenience field of the served certificate agrees with what
 * its own signed transcript says, decoded with `@patches/crypto`'s ONE canonical
 * identity-transcript codec (ADR 0033 §1 — the node and every client share this decoder,
 * so there is nothing left to reconcile between two encodings), including the exact root
 * key the transcript names (ADR 0033 §2). Any disagreement — or any malformed transcript
 * — is a failed match, never an exception leaking into trust decisions.
 */
function wireCertificateMatchesTranscript(
  certificate: E2eeDeviceCertificate,
  rootPublicKey: Bytes,
): boolean {
  if (certificate.certificateBytes.length === 0) return false;
  let decoded: ReturnType<typeof decodeDeviceCertificateTranscript>;
  try {
    decoded = decodeDeviceCertificateTranscript(certificate.certificateBytes);
  } catch {
    return false;
  }
  if (!bytesEqual(sha256Hash(certificate.certificateBytes), certificate.certificateDigest)) {
    return false;
  }
  if (
    !bytesEqual(decoded.rootPublicKey, rootPublicKey) ||
    !bytesEqual(decoded.signingPublicKey, certificate.signingPublicKey) ||
    !bytesEqual(decoded.agreementPublicKey, certificate.agreementPublicKey) ||
    decoded.rootGeneration !== certificate.rootGeneration ||
    decoded.certificateVersion !== certificate.certificateVersion ||
    decoded.actorId !== certificate.actorId ||
    decoded.deviceId !== certificate.deviceId ||
    decoded.createdAtMs !== (toDate(certificate.createdAt)?.getTime() ?? -1) ||
    decoded.expiresAtMs !== (toDate(certificate.expiresAt)?.getTime() ?? -1)
  ) {
    return false;
  }
  return (
    decoded.supportedProtocolVersions.join(' ') === certificate.supportedProtocolVersions.join(' ')
  );
}

/** Same rule as {@link wireCertificateMatchesTranscript}, for the roster transcript. */
function wireRosterMatchesTranscript(roster: E2eeDeviceRoster, rootPublicKey: Bytes): boolean {
  if (roster.rosterBytes.length === 0) return false;
  let decoded: ReturnType<typeof decodeDeviceRosterTranscript>;
  try {
    decoded = decodeDeviceRosterTranscript(roster.rosterBytes);
  } catch {
    return false;
  }
  if (
    !bytesEqual(sha256Hash(roster.rosterBytes), roster.digest) ||
    !bytesEqual(decoded.rootPublicKey, rootPublicKey) ||
    decoded.actorId !== roster.actorId ||
    BigInt(decoded.sequence) !== roster.sequence ||
    decoded.rootGeneration !== roster.rootGeneration ||
    !bytesEqual(decoded.previousDigest, roster.previousDigest) ||
    decoded.createdAtMs !== (toDate(roster.createdAt)?.getTime() ?? -1) ||
    decoded.entries.length !== roster.entries.length
  ) {
    return false;
  }
  return decoded.entries.every((entry, index) => {
    const wireEntry = roster.entries[index];
    if (wireEntry === undefined) return false;
    return (
      entry.deviceId === wireEntry.deviceId &&
      bytesEqual(entry.certificateDigest, wireEntry.certificateDigest) &&
      entry.active === wireEntry.active &&
      entry.addedAtMs === (toDate(wireEntry.addedAt)?.getTime() ?? Number.NaN) &&
      entry.revokedAtMs === toDate(wireEntry.revokedAt)?.getTime()
    );
  });
}

/**
 * The domain contract's injected Ed25519 seam, backed by `@patches/crypto`'s strict
 * (RFC 8032, non-ZIP-215) verifier. Returns `false` on malformed input rather than
 * throwing, exactly as `SignatureVerifier` requires.
 */
export const strictVerifier: SignatureVerifier = {
  verifyEd25519(input): boolean {
    return verifyStrict(input.publicKey, input.message, input.signature);
  },
};

/** The repo's one digest implementation, bridged into the domain contract's seam. */
export const sha256Digest: DigestFunction = (input: Bytes): Bytes => sha256Hash(input);

function requireDate(value: Date | undefined, label: string): Date {
  if (value === undefined) throw new E2eeContractError(`${label} timestamp is missing.`);
  return value;
}

export function identityRootFromWire(wire: E2eeIdentityRoot | undefined): E2eeIdentityRootView {
  if (
    wire === undefined ||
    wire.rootBytes.length === 0 ||
    wire.selfSignature.length === 0 ||
    wire.publicKey.length === 0
  ) {
    throw new E2eeContractError('Identity root is missing required fields.');
  }
  return {
    actorId: wire.actorId,
    generation: wire.generation,
    publicKey: wire.publicKey,
    rootBytes: wire.rootBytes,
    selfSignature: wire.selfSignature,
    ...(wire.previousRootSignature.length > 0
      ? { previousRootSignature: wire.previousRootSignature }
      : {}),
  };
}

export function deviceCertificateFromWire(wire: E2eeDeviceCertificate): E2eeDeviceCertificateView {
  const status =
    wire.status === E2eeDeviceStatus.ACTIVE
      ? 'ACTIVE'
      : wire.status === E2eeDeviceStatus.REVOKED
        ? 'REVOKED'
        : wire.status === E2eeDeviceStatus.EXPIRED
          ? 'EXPIRED'
          : undefined;
  if (status === undefined) {
    // An unknown lifecycle state is not "active" — fail closed rather than guessing.
    throw new E2eeContractError('Device certificate has an unrecognized lifecycle state.');
  }
  return {
    actorId: wire.actorId,
    deviceId: wire.deviceId,
    rootGeneration: wire.rootGeneration,
    certificateVersion: wire.certificateVersion,
    signingPublicKey: wire.signingPublicKey,
    agreementPublicKey: wire.agreementPublicKey,
    supportedProtocolVersions: wire.supportedProtocolVersions,
    createdAt: requireDate(toDate(wire.createdAt), 'Certificate createdAt'),
    expiresAt: requireDate(toDate(wire.expiresAt), 'Certificate expiresAt'),
    certificateBytes: wire.certificateBytes,
    rootSignature: wire.rootSignature,
    certificateDigest: wire.certificateDigest,
    status,
    revokedAt: toDate(wire.revokedAt),
  };
}

export function rosterViewFromWire(wire: E2eeDeviceRoster): E2eeDeviceRosterView {
  return {
    actorId: wire.actorId,
    sequence: wire.sequence,
    rootGeneration: wire.rootGeneration,
    previousDigest: wire.previousDigest,
    digest: wire.digest,
    rosterBytes: wire.rosterBytes,
    rootSignature: wire.rootSignature,
    entries: wire.entries.map((entry) => ({
      deviceId: entry.deviceId,
      certificateDigest: entry.certificateDigest,
      active: entry.active,
      addedAt: requireDate(toDate(entry.addedAt), 'Roster entry addedAt'),
      ...(entry.revokedAt === undefined ? {} : { revokedAt: toDate(entry.revokedAt) }),
    })),
    createdAt: requireDate(toDate(wire.createdAt), 'Roster createdAt'),
  };
}

export interface VerifiedPeerChain {
  readonly root: E2eeIdentityRootView;
  readonly roster: E2eeDeviceRosterView;
  /** Active devices only — signing key is what verifies control events and bundles. */
  readonly activeDevices: ReadonlyMap<
    string,
    { readonly signingPublicKey: Bytes; readonly agreementPublicKey: Bytes }
  >;
}

/**
 * Verifies one actor's full published chain: root proof-of-possession → roster shape →
 * roster signature over `roster_bytes` → each *active* device's certificate chain.
 *
 * Revoked/expired devices are not verified (they are never encryption targets); their
 * entries still had to survive the roster's structural rules. A certificate whose
 * decoded fields disagree with its signed transcript fails the whole chain.
 */
export function verifyActorChain(input: {
  readonly rootWire: E2eeIdentityRoot;
  readonly rosterWire: E2eeDeviceRoster;
  readonly certificatesWire: readonly E2eeDeviceCertificate[];
  readonly now: Date;
}): VerifiedPeerChain {
  const root = identityRootFromWire(input.rootWire);
  verifyIdentityRoot(root, { verifier: strictVerifier });

  if (!wireRosterMatchesTranscript(input.rosterWire, root.publicKey)) {
    throw new E2eeContractError('Served device roster disagrees with its signed transcript.');
  }
  const roster = rosterViewFromWire(input.rosterWire);
  assertRosterShape(roster);
  verifyRosterSignature(roster, root, { verifier: strictVerifier, digest: sha256Digest });

  const activeDevices = new Map<
    string,
    { readonly signingPublicKey: Bytes; readonly agreementPublicKey: Bytes }
  >();
  for (const entry of roster.entries) {
    if (!entry.active) continue;
    const wireCert = input.certificatesWire.find((candidate) =>
      bytesEqual(sha256Hash(candidate.certificateBytes), entry.certificateDigest),
    );
    if (wireCert === undefined) {
      throw new E2eeContractError(`Active device ${entry.deviceId} has no served certificate.`);
    }
    if (wireCert.deviceId !== entry.deviceId) {
      throw new E2eeContractError(
        'Served certificate names a different device than its roster entry.',
      );
    }
    if (!wireCertificateMatchesTranscript(wireCert, root.publicKey)) {
      throw new E2eeContractError(
        'Served device certificate disagrees with its signed transcript.',
      );
    }
    const certificate = deviceCertificateFromWire(wireCert);
    verifyDeviceCertificate(certificate, root, {
      verifier: strictVerifier,
      digest: sha256Digest,
      now: input.now,
      decodedMatchesTranscript: true,
    });
    if (certificate.deviceId !== entry.deviceId) {
      throw new E2eeContractError('Verified certificate does not match its roster entry.');
    }
    assertDeviceUsableForSend(certificate);
    activeDevices.set(certificate.deviceId, {
      signingPublicKey: certificate.signingPublicKey,
      agreementPublicKey: certificate.agreementPublicKey,
    });
  }
  return { root, roster, activeDevices };
}
