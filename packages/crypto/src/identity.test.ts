import { describe, expect, it } from 'vitest';

import { rosterDigest, safetyNumber, signDeviceRoster, verifyDeviceRoster } from './identity.js';
import { certifyDevice, createSignedPreKey, verifyPreKeyBundle } from './identity.js';
import { keyAgreementKeyPairFromPrivate, signingKeyPairFromPrivate } from './primitives.js';
import {
  E2EE_PROTOCOL,
  E2EE_VERSION,
  type CertifiedDevice,
  type DeviceRoster,
  type PreKeyBundle,
  type SignedDeviceRoster,
} from './types.js';

const NOW = 10_000;

function bytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

function fixture(): {
  root: ReturnType<typeof signingKeyPairFromPrivate>;
  device: CertifiedDevice;
  roster: SignedDeviceRoster;
  bundle: PreKeyBundle;
} {
  const root = signingKeyPairFromPrivate(bytes(1));
  const signing = signingKeyPairFromPrivate(bytes(2));
  const agreement = keyAgreementKeyPairFromPrivate(bytes(3));
  const device = certifyDevice(root.privateKey, {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: 'user-a',
    deviceId: 'device-a',
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    generation: 1,
    createdAtMs: 1,
    expiresAtMs: 1_000_000,
  });
  const rosterValue: DeviceRoster = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: 'user-a',
    rootPublicKey: root.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    devices: [device],
    createdAtMs: 1,
  };
  const roster = signDeviceRoster(root.privateKey, rosterValue);
  const prekeyPair = keyAgreementKeyPairFromPrivate(bytes(4));
  const digest = rosterDigest(rosterValue);
  const signedPreKey = createSignedPreKey(signing.privateKey, device, digest, {
    id: 7,
    publicKey: prekeyPair.publicKey,
    createdAtMs: 1,
    expiresAtMs: 20_000,
  });
  return {
    root,
    device,
    roster,
    bundle: {
      protocol: E2EE_PROTOCOL,
      version: E2EE_VERSION,
      certifiedDevice: device,
      rosterDigest: digest,
      signedPreKey,
      oneTimePreKey: { id: 9, publicKey: keyAgreementKeyPairFromPrivate(bytes(5)).publicKey },
    },
  };
}

describe('certified device identity', () => {
  it('verifies signed monotonic roster links and rejects rollback/substitution', () => {
    const first = fixture();
    verifyDeviceRoster(first.roster, undefined, NOW);
    const secondRoster: DeviceRoster = {
      ...first.roster.roster,
      sequence: 2,
      previousDigest: rosterDigest(first.roster.roster),
      createdAtMs: 2,
    };
    const second = signDeviceRoster(first.root.privateKey, secondRoster);
    verifyDeviceRoster(second, first.roster, NOW);

    const rollback = signDeviceRoster(first.root.privateKey, {
      ...secondRoster,
      previousDigest: new Uint8Array(32),
    });
    expect(() => verifyDeviceRoster(rollback, first.roster, NOW)).toThrow('Roster does not extend');
  });

  it('binds signed prekeys to the certified device and roster digest', () => {
    const value = fixture();
    verifyPreKeyBundle(value.bundle, value.roster, NOW);
    const changed = {
      ...value.bundle,
      rosterDigest: new Uint8Array(32).fill(99),
    };
    expect(() => verifyPreKeyBundle(changed, value.roster, NOW)).toThrow('untrusted roster digest');
  });

  it('produces an order-independent 60-digit safety number', () => {
    const first = safetyNumber('a', bytes(10), 'b', bytes(20));
    const second = safetyNumber('b', bytes(20), 'a', bytes(10));
    expect(first).toMatch(/^\d{60}$/);
    expect(second).toBe(first);
  });
});
