/**
 * Deterministic fixtures shared by the unit, property, and vector-replay tests. Not exported
 * from `index.ts` — this module never ships in `dist`, it only exists to keep every test file
 * deriving the same synthetic identities/handshakes from the same small set of seed rules.
 */
import { certifyDevice, createSignedPreKey, rosterDigest, signDeviceRoster } from '../identity.js';
import { initializeInitiatorRatchet, initializeResponderRatchet } from '../double-ratchet.js';
import { keyAgreementKeyPairFromPrivate, signingKeyPairFromPrivate } from '../primitives.js';
import {
  E2EE_PROTOCOL,
  E2EE_VERSION,
  type CertifiedDevice,
  type DevicePrivateKeys,
  type DeviceRoster,
  type DoubleRatchetState,
  type KeyPair,
  type PreKeyBundle,
  type PrivatePreKey,
  type RatchetRandomSource,
  type SignedDeviceRoster,
} from '../types.js';
import {
  initiateX3dh,
  respondX3dh,
  type InitiateX3dhResult,
  type RespondX3dhResult,
} from '../x3dh.js';

export const FIXTURE_NOW = 10_000;

/** A raw 32-byte scalar built from a single repeated seed byte (`value` wraps mod 256). */
export function fixtureBytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

export interface UserFixture {
  readonly root: KeyPair;
  readonly keys: DevicePrivateKeys;
  readonly device: CertifiedDevice;
  readonly roster: SignedDeviceRoster;
}

export function userFixture(userId: string, seed: number): UserFixture {
  const root = signingKeyPairFromPrivate(fixtureBytes(seed));
  const signing = signingKeyPairFromPrivate(fixtureBytes(seed + 1));
  const agreement = keyAgreementKeyPairFromPrivate(fixtureBytes(seed + 2));
  const device = certifyDevice(root.privateKey, {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId,
    deviceId: `${userId}-device`,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    generation: 1,
    createdAtMs: 1,
    expiresAtMs: 1_000_000,
  });
  const rosterValue: DeviceRoster = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId,
    rootPublicKey: root.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    devices: [device],
    createdAtMs: 1,
  };
  return {
    root,
    keys: { signing, agreement },
    device,
    roster: signDeviceRoster(root.privateKey, rosterValue),
  };
}

export interface BundleFixture {
  readonly bundle: PreKeyBundle;
  readonly signedPreKey: PrivatePreKey;
  readonly oneTimePreKey: PrivatePreKey;
}

export function bundleFixture(user: UserFixture, seed: number): BundleFixture {
  const signedPreKey = { id: 71, keyPair: keyAgreementKeyPairFromPrivate(fixtureBytes(seed)) };
  const oneTimePreKey = { id: 91, keyPair: keyAgreementKeyPairFromPrivate(fixtureBytes(seed + 1)) };
  const digest = rosterDigest(user.roster.roster);
  return {
    signedPreKey,
    oneTimePreKey,
    bundle: {
      protocol: E2EE_PROTOCOL,
      version: E2EE_VERSION,
      certifiedDevice: user.device,
      rosterDigest: digest,
      signedPreKey: createSignedPreKey(user.keys.signing.privateKey, user.device, digest, {
        id: signedPreKey.id,
        publicKey: signedPreKey.keyPair.publicKey,
        createdAtMs: 1,
        expiresAtMs: 20_000,
      }),
      oneTimePreKey: { id: oneTimePreKey.id, publicKey: oneTimePreKey.keyPair.publicKey },
    },
  };
}

/** A `RatchetRandomSource` whose output is a pure function of `seed`, for reproducible tests. */
export function deterministicSource(seed: number): RatchetRandomSource {
  let counter = 0;
  return {
    randomBytes(length: number): Uint8Array {
      counter += 1;
      return new Uint8Array(length).fill((seed + counter) & 0xff);
    },
    generateKeyAgreementKeyPair(): KeyPair {
      counter += 1;
      return keyAgreementKeyPairFromPrivate(fixtureBytes((seed + counter) & 0xff));
    },
  };
}

export interface EstablishedFixture {
  readonly alice: UserFixture;
  readonly bob: UserFixture;
  readonly bobPrekeys: BundleFixture;
  readonly initiated: InitiateX3dhResult;
  readonly responded: RespondX3dhResult;
}

/** Runs a full transcript-bound X3DH handshake between two synthetic users derived from `seed`. */
export function establishedFixture(seed = 1): EstablishedFixture {
  const alice = userFixture('alice', seed);
  const bob = userFixture('bob', seed + 10);
  const bobPrekeys = bundleFixture(bob, seed + 20);
  const initiated = initiateX3dh({
    initiatorKeys: alice.keys,
    initiatorDevice: alice.device,
    initiatorRoster: alice.roster,
    responderBundle: bobPrekeys.bundle,
    responderRoster: bob.roster,
    nowMs: FIXTURE_NOW,
    ephemeralKey: keyAgreementKeyPairFromPrivate(fixtureBytes(seed + 30)),
  });
  const responded = respondX3dh({
    responderKeys: bob.keys,
    responderBundle: bobPrekeys.bundle,
    responderRoster: bob.roster,
    initiatorRoster: alice.roster,
    signedPreKey: bobPrekeys.signedPreKey,
    oneTimePreKey: bobPrekeys.oneTimePreKey,
    handshake: initiated.handshake,
    nowMs: FIXTURE_NOW,
  });
  return { alice, bob, bobPrekeys, initiated, responded };
}

export interface RatchetPairFixture {
  readonly fixture: EstablishedFixture;
  readonly aliceState: DoubleRatchetState;
  readonly bobState: DoubleRatchetState;
}

/** A fresh, independently keyed Double Ratchet session pair, both sides initialized post-X3DH. */
export function establishedRatchetPair(seed: number): RatchetPairFixture {
  const fixture = establishedFixture(seed);
  const aliceState = initializeInitiatorRatchet(
    fixture.initiated.secrets,
    fixture.initiated.initiatorRatchetKey,
    fixture.bobPrekeys.signedPreKey.keyPair.publicKey,
  );
  const bobState = initializeResponderRatchet(
    fixture.responded.secrets,
    fixture.responded.responderRatchetKey,
  );
  return { fixture, aliceState, bobState };
}
