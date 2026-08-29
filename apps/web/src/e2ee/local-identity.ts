/**
 * A locally held, enrolled messaging-device identity (ADR 0020 §2, ADR 0033) — web port
 * of the TUI module, unchanged: the type is pure data over `@patches/crypto` primitives.
 *
 * Every field is `@patches/crypto`'s one canonical identity-transcript family
 * (ADR 0033 §1): `selfDevice` and `ownRoster` are branded `Verified*` values, which can
 * only exist by having already been checked through `verifyCertifiedDevice`/
 * `verifyRosterSnapshot`, including for material this device minted itself. There is no
 * second, node-canonical encoding anywhere in this type.
 */
import {
  verifyPreKeyBundle,
  type DevicePrivateKeys,
  type KeyPair,
  type OneTimePreKey,
  type VerifiedCertifiedDevice,
  type VerifiedPreKeyBundle,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';

export interface LocalSignedPreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export interface LocalOneTimePreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
}

/**
 * A signed prekey this device retired by rotation (ADR 0020 §5, issue #278), kept only long
 * enough to open an initial message a peer sealed against it before rotation reached them —
 * the mailbox's max latency window (`E2EE_MAILBOX_MAX_LATENCY_MS`). `bundleBytes`/
 * `deviceSignature` are the exact signed transcript this device published for the key while it
 * was current — retained verbatim, since `session-setup.ts` re-verifies against them rather
 * than trusting a bare keypair (ADR 0033 §3 applies to retained material too).
 */
export interface LocalPreviousSignedPreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly bundleBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
  readonly retiredAtMs: number;
}

/**
 * This device's own signed prekey-bundle transcript (T4) and the device signature over
 * it — the raw material {@link selfPrekeyBundle} re-verifies on every call, so even
 * locally minted material is never trusted without running the same check a peer's
 * bundle would have to pass (ADR 0033 §3).
 */
export interface LocalSignedPreKeyBundle {
  readonly bundleBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
}

export interface LocalDeviceIdentity {
  readonly actorId: string;
  readonly deviceId: string;
  readonly keys: DevicePrivateKeys;
  /** This device's root-certified certificate, as listed in `ownRoster`. */
  readonly selfDevice: VerifiedCertifiedDevice;
  /** This account's signed device roster, containing `selfDevice`. */
  readonly ownRoster: VerifiedRosterSnapshot;
  readonly signedPreKey: LocalSignedPreKey;
  readonly ownBundle: LocalSignedPreKeyBundle;
  readonly oneTimePreKeys: readonly LocalOneTimePreKey[];
}

/**
 * The bundle a peer must see to run X3DH against this device, re-verified through the
 * same `verifyPreKeyBundle` a peer runs, over this device's own stored transcript bytes.
 * `oneTimePreKey` is supplied by the caller because one bundle covers at most one
 * one-time prekey, chosen dynamically per responder attempt — `undefined` for the
 * fallback-with-no-one-time-prekey path.
 */
export function selfPrekeyBundle(
  identity: LocalDeviceIdentity,
  oneTimePreKey: OneTimePreKey | undefined,
  nowMs: number,
): VerifiedPreKeyBundle {
  return verifyPreKeyBundle({
    bundleBytes: identity.ownBundle.bundleBytes,
    deviceSignature: identity.ownBundle.deviceSignature,
    certificateBytes: identity.selfDevice.certificateBytes,
    certificateRootSignature: identity.selfDevice.rootSignature,
    ...(oneTimePreKey === undefined ? {} : { oneTimePreKey }),
    roster: identity.ownRoster,
    nowMs,
  });
}
