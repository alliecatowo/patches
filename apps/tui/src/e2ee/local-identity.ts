/**
 * A locally held, enrolled messaging-device identity (ADR 0020 §2).
 *
 * The TUI has no enrollment flow yet (no `EnrollDevice` caller exists anywhere in
 * `apps/tui`), so production runs identity-less: the send/receive pipeline reports
 * "needs an enrolled device" instead of pretending. Everything downstream of this type
 * is real, tested code — a future enrollment slice produces one of these objects and
 * the pipeline lights up without further changes.
 *
 * These are the *crypto-native* types (`@patches/crypto`), not wire views: X3DH
 * (`initiateX3dh`/`respondX3dh`) verifies and transcribes certificates through that
 * package's own canonical encoders, so sessions established by this client are
 * crypto-native end to end.
 */
import {
  rosterDigest,
  type CertifiedDevice,
  type DevicePrivateKeys,
  type KeyPair,
  type PreKeyBundle,
  type SignedDeviceRoster,
} from '@patches/crypto';

export interface LocalSignedPreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly signature: Uint8Array;
}

export interface LocalOneTimePreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
}

export interface LocalDeviceIdentity {
  readonly actorId: string;
  readonly deviceId: string;
  readonly keys: DevicePrivateKeys;
  /** This device's root-certified certificate, as listed in `ownRoster`. */
  readonly selfDevice: CertifiedDevice;
  /** This account's signed device roster, containing `selfDevice`. */
  readonly ownRoster: SignedDeviceRoster;
  readonly signedPreKey: LocalSignedPreKey;
  readonly oneTimePreKeys: readonly LocalOneTimePreKey[];
}

/** The bundle a peer must see to run X3DH against this device (crypto-native encodings). */
export function selfPrekeyBundle(identity: LocalDeviceIdentity): PreKeyBundle {
  return {
    protocol: identity.selfDevice.certificate.protocol,
    version: identity.selfDevice.certificate.version,
    certifiedDevice: identity.selfDevice,
    rosterDigest: rosterDigest(identity.ownRoster.roster),
    signedPreKey: {
      id: identity.signedPreKey.id,
      publicKey: identity.signedPreKey.keyPair.publicKey,
      createdAtMs: identity.signedPreKey.createdAtMs,
      expiresAtMs: identity.signedPreKey.expiresAtMs,
      signature: identity.signedPreKey.signature,
    },
    ...(identity.oneTimePreKeys[0] === undefined
      ? {}
      : {
          oneTimePreKey: {
            id: identity.oneTimePreKeys[0].id,
            publicKey: identity.oneTimePreKeys[0].keyPair.publicKey,
          },
        }),
  };
}
