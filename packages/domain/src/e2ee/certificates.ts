/**
 * Account-root and device certificate contract (ADR 0020 §2–§3).
 *
 * This is the fix for the spike's critical finding (`docs/research/e2ee-dms.md` §4.1): an
 * Ed25519 signing identity and an X25519 agreement identity that are not cryptographically bound
 * let an attacker supply its own agreement key while naming someone else's signing identity. The
 * binding is the root-signed device certificate, and these validators are what refuse to accept
 * anything that is not bound.
 */
import { E2eeContractError, E2EE_DEVICE_CERTIFICATE_VERSION, E2EE_PROTOCOL_V1 } from './modes.js';
import {
  bytesEqual,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  E2EE_DIGEST_BYTES,
  X25519_PUBLIC_KEY_BYTES,
  type Bytes,
  type DigestFunction,
  type SignatureVerifier,
} from './types.js';

/** Device lifecycle as observed from a signed roster and the certificate's own expiry. */
export const E2EE_DEVICE_STATUSES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type E2eeDeviceStatus = (typeof E2EE_DEVICE_STATUSES)[number];

/**
 * An actor's messaging identity root: a long-lived Ed25519 key separate from every login
 * credential, and the stable input to that actor's safety number.
 */
export interface E2eeIdentityRootView {
  readonly actorId: string;
  /** Strictly increasing. A new generation is a hard identity change. */
  readonly generation: number;
  readonly publicKey: Bytes;
  /** The canonical transcript the signatures cover. Authoritative; the fields above are a view. */
  readonly rootBytes: Bytes;
  /** The new root signing its own transcript — proof of possession. */
  readonly selfSignature: Bytes;
  /** Present only when the previous root signed the transition (a planned rotation). */
  readonly previousRootSignature?: Bytes | undefined;
}

/** A root-signed certificate binding both of a device's public keys to one actor and device id. */
export interface E2eeDeviceCertificateView {
  readonly actorId: string;
  readonly deviceId: string;
  readonly rootGeneration: number;
  readonly certificateVersion: number;
  /** Ed25519. Signs this device's prekey bundles and control records. */
  readonly signingPublicKey: Bytes;
  /** X25519. Used for X3DH and device-to-device sessions. */
  readonly agreementPublicKey: Bytes;
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** The exact canonical bytes `rootSignature` covers. Authoritative. */
  readonly certificateBytes: Bytes;
  readonly rootSignature: Bytes;
  readonly certificateDigest: Bytes;
  readonly status: E2eeDeviceStatus;
  readonly revokedAt?: Date | null | undefined;
}

function assertLength(label: string, value: Bytes, expected: number): void {
  if (value.length !== expected) {
    throw new E2eeContractError(`${label} must be ${String(expected)} bytes.`);
  }
}

/**
 * Verifies a messaging identity root's proof of possession.
 *
 * A node that could publish a root for an actor who does not hold the private key could
 * substitute an identity at first contact and never be caught by anything but a safety-number
 * comparison. The self-signature closes the server-side half of that.
 */
export function verifyIdentityRoot(
  root: E2eeIdentityRootView,
  deps: { readonly verifier: SignatureVerifier },
): void {
  assertLength('Identity root public key', root.publicKey, ED25519_PUBLIC_KEY_BYTES);
  assertLength('Identity root self-signature', root.selfSignature, ED25519_SIGNATURE_BYTES);
  if (!Number.isInteger(root.generation) || root.generation < 1) {
    throw new E2eeContractError('Identity root generation must be a positive integer.');
  }
  if (root.rootBytes.length === 0) {
    throw new E2eeContractError('Identity root transcript is empty.');
  }
  if (
    !deps.verifier.verifyEd25519({
      publicKey: root.publicKey,
      message: root.rootBytes,
      signature: root.selfSignature,
    })
  ) {
    throw new E2eeContractError('Identity root self-signature does not verify.');
  }
}

/**
 * Verifies the chain root → device certificate.
 *
 * `certificateBytes` is the only authoritative content: the signature is checked over those
 * bytes, and the decoded convenience fields are then required to agree with the transcript the
 * caller decoded. A verifier must never trust a server-supplied decoding of signed bytes, which
 * is why `decodedMatchesTranscript` is a required input rather than an assumption.
 */
export function verifyDeviceCertificate(
  certificate: E2eeDeviceCertificateView,
  root: E2eeIdentityRootView,
  deps: {
    readonly verifier: SignatureVerifier;
    readonly digest: DigestFunction;
    readonly now: Date;
    readonly decodedMatchesTranscript: boolean;
  },
): void {
  assertLength('Device signing key', certificate.signingPublicKey, ED25519_PUBLIC_KEY_BYTES);
  assertLength('Device agreement key', certificate.agreementPublicKey, X25519_PUBLIC_KEY_BYTES);
  assertLength('Device certificate signature', certificate.rootSignature, ED25519_SIGNATURE_BYTES);
  assertLength('Device certificate digest', certificate.certificateDigest, E2EE_DIGEST_BYTES);

  if (certificate.certificateVersion !== E2EE_DEVICE_CERTIFICATE_VERSION) {
    throw new E2eeContractError('Unsupported device certificate version.');
  }
  if (certificate.actorId !== root.actorId) {
    throw new E2eeContractError('Device certificate names a different actor than its root.');
  }
  if (certificate.rootGeneration !== root.generation) {
    throw new E2eeContractError(
      'Device certificate was signed by a superseded root generation; it does not survive a root rotation.',
    );
  }
  if (certificate.deviceId.length === 0) {
    throw new E2eeContractError('Device certificate has no device id.');
  }
  if (!certificate.supportedProtocolVersions.includes(E2EE_PROTOCOL_V1)) {
    throw new E2eeContractError(`Device certificate does not advertise ${E2EE_PROTOCOL_V1}.`);
  }
  if (certificate.expiresAt.getTime() <= certificate.createdAt.getTime()) {
    throw new E2eeContractError('Device certificate expires before it was created.');
  }
  if (certificate.expiresAt.getTime() <= deps.now.getTime()) {
    throw new E2eeContractError('Device certificate has expired.');
  }
  if (bytesEqual(certificate.signingPublicKey, certificate.agreementPublicKey)) {
    throw new E2eeContractError('Device signing and agreement keys must be independent keypairs.');
  }
  if (!deps.decodedMatchesTranscript) {
    throw new E2eeContractError(
      'Decoded device certificate fields disagree with the signed transcript.',
    );
  }
  if (!bytesEqual(deps.digest(certificate.certificateBytes), certificate.certificateDigest)) {
    throw new E2eeContractError('Device certificate digest does not match its transcript.');
  }
  if (
    !deps.verifier.verifyEd25519({
      publicKey: root.publicKey,
      message: certificate.certificateBytes,
      signature: certificate.rootSignature,
    })
  ) {
    throw new E2eeContractError('Device certificate is not signed by this actor’s messaging root.');
  }
}

/** A certificate is usable for a *send* only while it is active and unrevoked. */
export function assertDeviceUsableForSend(certificate: E2eeDeviceCertificateView): void {
  if (certificate.status !== 'ACTIVE') {
    throw new E2eeContractError('Device is not active; encrypting to it is not permitted.');
  }
  if (certificate.revokedAt !== null && certificate.revokedAt !== undefined) {
    throw new E2eeContractError('Device is revoked; encrypting to it is not permitted.');
  }
}

/**
 * How a client must treat a change to a contact's messaging root (ADR 0020 §3).
 *
 * `PLANNED_ROTATION` and `UNVERIFIED_RESET` differ only in what the UI may *say*. Both pause new
 * sends until the user acknowledges, and both invalidate prior verification. A client never
 * silently trusts a new root, which is why there is no fourth "trusted" outcome here.
 */
export const E2EE_IDENTITY_CHANGES = ['NONE', 'PLANNED_ROTATION', 'UNVERIFIED_RESET'] as const;
export type E2eeIdentityChange = (typeof E2EE_IDENTITY_CHANGES)[number];

export function classifyIdentityRootChange(
  previous: E2eeIdentityRootView | null,
  next: E2eeIdentityRootView,
  deps: { readonly verifier: SignatureVerifier },
): E2eeIdentityChange {
  if (previous === null) return 'NONE';
  if (previous.actorId !== next.actorId) {
    throw new E2eeContractError('Cannot compare identity roots belonging to different actors.');
  }
  if (next.generation === previous.generation && bytesEqual(next.publicKey, previous.publicKey)) {
    return 'NONE';
  }
  if (next.generation <= previous.generation) {
    throw new E2eeContractError('Identity root generation went backwards; this is a rollback.');
  }
  const transition = next.previousRootSignature;
  if (
    transition !== undefined &&
    deps.verifier.verifyEd25519({
      publicKey: previous.publicKey,
      message: next.rootBytes,
      signature: transition,
    })
  ) {
    return 'PLANNED_ROTATION';
  }
  return 'UNVERIFIED_RESET';
}

/**
 * Both identity-change kinds require the user to re-verify. Stated as its own function so no
 * client can accidentally treat a signed rotation as "already trusted".
 */
export function requiresReverification(change: E2eeIdentityChange): boolean {
  return change !== 'NONE';
}
