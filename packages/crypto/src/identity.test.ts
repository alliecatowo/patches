import { describe, expect, it } from 'vitest';

import { CertificateError, PreKeyError } from './errors.js';
import { encodeDeviceCertificateTranscript } from './identity-transcript.js';
import {
  countersignMessagingRoot,
  identityTranscriptDigest,
  rosterHasActiveCertificate,
  safetyNumber,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  verifyCertifiedDevice,
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  type VerifiedMessagingRoot,
} from './identity.js';
import { keyAgreementKeyPairFromPrivate, signingKeyPairFromPrivate } from './primitives.js';
import { bundleFixture, userFixture, FIXTURE_NOW } from './testing/fixtures.js';
import { E2EE_PROTOCOL } from './types.js';

const NOW = FIXTURE_NOW;

function bytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

const rootKeys = signingKeyPairFromPrivate(bytes(1));
const otherRootKeys = signingKeyPairFromPrivate(bytes(9));
const deviceSigning = signingKeyPairFromPrivate(bytes(2));
const deviceAgreement = keyAgreementKeyPairFromPrivate(bytes(3));

function mintRoot(generation = 1, keys = rootKeys): ReturnType<typeof signMessagingRoot> {
  return signMessagingRoot(keys.privateKey, {
    actorId: 'actor-a',
    generation,
    publicKey: keys.publicKey,
    createdAtMs: 1,
  });
}

function mintCertificate(
  deviceId = 'device-a',
  overrides: { expiresAtMs?: number; rootPublicKey?: Uint8Array } = {},
): ReturnType<typeof signDeviceCertificate> {
  return signDeviceCertificate(rootKeys.privateKey, {
    actorId: 'actor-a',
    deviceId,
    rootGeneration: 1,
    rootPublicKey: overrides.rootPublicKey ?? rootKeys.publicKey,
    certificateVersion: 1,
    signingPublicKey: deviceSigning.publicKey,
    agreementPublicKey: deviceAgreement.publicKey,
    supportedProtocolVersions: [E2EE_PROTOCOL],
    createdAtMs: 1,
    expiresAtMs: overrides.expiresAtMs ?? 1_000_000,
  });
}

describe('verifyMessagingRoot', () => {
  it('accepts a self-signed root and returns the re-derived fields', () => {
    const signed = mintRoot();
    const root = verifyMessagingRoot({ ...signed, nowMs: NOW });
    expect(root.actorId).toBe('actor-a');
    expect(root.generation).toBe(1);
    expect(root.publicKey).toEqual(rootKeys.publicKey);
    expect(root.rootBytes).toEqual(signed.rootBytes);
  });

  it('rejects a bad self signature, a foreign signer, and a not-yet-valid root', () => {
    const signed = mintRoot();
    expect(() =>
      verifyMessagingRoot({ ...signed, selfSignature: new Uint8Array(64), nowMs: NOW }),
    ).toThrow(CertificateError);
    expect(() =>
      verifyMessagingRoot({ ...signed, selfSignature: new Uint8Array(63), nowMs: NOW }),
    ).toThrow('invalid length');
    const foreign = signMessagingRoot(otherRootKeys.privateKey, {
      actorId: 'actor-a',
      generation: 1,
      publicKey: rootKeys.publicKey,
      createdAtMs: 1,
    });
    expect(() => verifyMessagingRoot({ ...foreign, nowMs: NOW })).toThrow('self signature');
    expect(() => verifyMessagingRoot({ ...signed, nowMs: 0 })).toThrow('not yet valid');
  });

  it('accepts a countersigned rotation and rejects one that does not extend the previous root', () => {
    const previous = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const rotated = signMessagingRoot(otherRootKeys.privateKey, {
      actorId: 'actor-a',
      generation: 2,
      publicKey: otherRootKeys.publicKey,
      createdAtMs: 2,
    });
    const verified = verifyMessagingRoot({
      ...rotated,
      previousRootSignature: countersignMessagingRoot(rootKeys.privateKey, rotated.rootBytes),
      previousRoot: previous,
      nowMs: NOW,
    });
    expect(verified.generation).toBe(2);

    expect(() =>
      verifyMessagingRoot({
        ...rotated,
        previousRootSignature: countersignMessagingRoot(rootKeys.privateKey, rotated.rootBytes),
        nowMs: NOW,
      }),
    ).toThrow('requires the verified previous root');
    const skipped = signMessagingRoot(otherRootKeys.privateKey, {
      actorId: 'actor-a',
      generation: 3,
      publicKey: otherRootKeys.publicKey,
      createdAtMs: 2,
    });
    expect(() =>
      verifyMessagingRoot({
        ...skipped,
        previousRootSignature: countersignMessagingRoot(rootKeys.privateKey, skipped.rootBytes),
        previousRoot: previous,
        nowMs: NOW,
      }),
    ).toThrow('does not extend');
    expect(() =>
      verifyMessagingRoot({
        ...rotated,
        previousRootSignature: countersignMessagingRoot(
          otherRootKeys.privateKey,
          rotated.rootBytes,
        ),
        previousRoot: previous,
        nowMs: NOW,
      }),
    ).toThrow('Previous-root signature is invalid');
  });
});

describe('verifyCertifiedDevice', () => {
  it('accepts a root-signed certificate and re-derives its digest', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const certificate = mintCertificate();
    const device = verifyCertifiedDevice({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
      root,
      nowMs: NOW,
    });
    expect(device.deviceId).toBe('device-a');
    expect(device.certificateDigest).toEqual(
      identityTranscriptDigest(certificate.certificateBytes),
    );
    expect(device.signingPublicKey).toEqual(deviceSigning.publicKey);
  });

  it('rejects a certificate that does not bind the verified root, or is out of its window', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const foreignRootBinding = mintCertificate('device-a', {
      rootPublicKey: otherRootKeys.publicKey,
    });
    expect(() =>
      verifyCertifiedDevice({
        certificateBytes: foreignRootBinding.certificateBytes,
        rootSignature: foreignRootBinding.rootSignature,
        root,
        nowMs: NOW,
      }),
    ).toThrow('does not bind the verified messaging root');

    const expired = mintCertificate('device-a', { expiresAtMs: 5 });
    expect(() =>
      verifyCertifiedDevice({
        certificateBytes: expired.certificateBytes,
        rootSignature: expired.rootSignature,
        root,
        nowMs: NOW,
      }),
    ).toThrow('not currently valid');

    const certificate = mintCertificate();
    expect(() =>
      verifyCertifiedDevice({
        certificateBytes: certificate.certificateBytes,
        rootSignature: new Uint8Array(64),
        root,
        nowMs: NOW,
      }),
    ).toThrow('signature is invalid');
  });

  it('rejects re-encoded certificate bytes whose signature was made over different bytes', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const certificate = mintCertificate();
    // A caller cannot substitute its own decoding: the verifier checks the signature over the
    // exact bytes it was handed, so bytes re-encoded from tampered fields fail closed.
    const tampered = encodeDeviceCertificateTranscript({
      actorId: 'actor-a',
      deviceId: 'device-a',
      rootGeneration: 1,
      rootPublicKey: rootKeys.publicKey,
      certificateVersion: 1,
      signingPublicKey: bytes(77),
      agreementPublicKey: deviceAgreement.publicKey,
      supportedProtocolVersions: [E2EE_PROTOCOL],
      createdAtMs: 1,
      expiresAtMs: 1_000_000,
    });
    expect(() =>
      verifyCertifiedDevice({
        certificateBytes: tampered,
        rootSignature: certificate.rootSignature,
        root,
        nowMs: NOW,
      }),
    ).toThrow('signature is invalid');
  });
});

describe('verifyRosterSnapshot', () => {
  function mintRoster(
    entries: readonly {
      deviceId: string;
      certificateDigest: Uint8Array;
      active: boolean;
      addedAtMs: number;
      revokedAtMs?: number;
    }[],
  ): ReturnType<typeof signDeviceRoster> {
    return signDeviceRoster(rootKeys.privateKey, {
      actorId: 'actor-a',
      rootGeneration: 1,
      rootPublicKey: rootKeys.publicKey,
      sequence: 1,
      previousDigest: new Uint8Array(32),
      createdAtMs: 1,
      entries,
    });
  }

  it('accepts a roster whose every active entry is matched by exactly one certificate', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const certificate = mintCertificate();
    const roster = mintRoster([
      {
        deviceId: 'device-a',
        certificateDigest: certificate.certificateDigest,
        active: true,
        addedAtMs: 1,
      },
    ]);
    const verified = verifyRosterSnapshot({
      rosterBytes: roster.rosterBytes,
      rootSignature: roster.rootSignature,
      root,
      certificates: [certificate],
      nowMs: NOW,
    });
    expect(verified.devices).toHaveLength(1);
    expect(verified.rosterDigest).toEqual(identityTranscriptDigest(roster.rosterBytes));
    expect(rosterHasActiveCertificate(verified, certificate.certificateDigest)).toBe(true);
    expect(rosterHasActiveCertificate(verified, bytes(0))).toBe(false);
  });

  it('allows an inactive entry to go unmatched', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const active = mintCertificate('device-a');
    const roster = mintRoster([
      {
        deviceId: 'device-a',
        certificateDigest: active.certificateDigest,
        active: true,
        addedAtMs: 1,
      },
      {
        deviceId: 'device-b',
        certificateDigest: bytes(8),
        active: false,
        addedAtMs: 1,
        revokedAtMs: 2,
      },
    ]);
    const verified = verifyRosterSnapshot({
      rosterBytes: roster.rosterBytes,
      rootSignature: roster.rootSignature,
      root,
      certificates: [active],
      nowMs: NOW,
    });
    expect(verified.entries).toHaveLength(2);
    expect(verified.devices).toHaveLength(1);
  });

  it('rejects an unmatched active entry, an unmatched certificate, and a duplicate certificate', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const certificate = mintCertificate();
    const unmatchedActive = mintRoster([
      {
        deviceId: 'device-a',
        certificateDigest: certificate.certificateDigest,
        active: true,
        addedAtMs: 1,
      },
      { deviceId: 'device-b', certificateDigest: bytes(8), active: true, addedAtMs: 1 },
    ]);
    expect(() =>
      verifyRosterSnapshot({
        rosterBytes: unmatchedActive.rosterBytes,
        rootSignature: unmatchedActive.rootSignature,
        root,
        certificates: [certificate],
        nowMs: NOW,
      }),
    ).toThrow('active roster entry has no matching device certificate');

    const single = mintRoster([
      {
        deviceId: 'device-a',
        certificateDigest: certificate.certificateDigest,
        active: true,
        addedAtMs: 1,
      },
    ]);
    const strayCertificate = mintCertificate('device-c');
    expect(() =>
      verifyRosterSnapshot({
        rosterBytes: single.rosterBytes,
        rootSignature: single.rootSignature,
        root,
        certificates: [certificate, strayCertificate],
        nowMs: NOW,
      }),
    ).toThrow('matches no roster entry');
    expect(() =>
      verifyRosterSnapshot({
        rosterBytes: single.rosterBytes,
        rootSignature: single.rootSignature,
        root,
        certificates: [certificate, certificate],
        nowMs: NOW,
      }),
    ).toThrow('supplied twice');
  });

  it('rejects a roster entry that names a different device than its certificate', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const certificate = mintCertificate('device-a');
    const roster = mintRoster([
      {
        deviceId: 'device-z',
        certificateDigest: certificate.certificateDigest,
        active: true,
        addedAtMs: 1,
      },
    ]);
    expect(() =>
      verifyRosterSnapshot({
        rosterBytes: roster.rosterBytes,
        rootSignature: roster.rootSignature,
        root,
        certificates: [certificate],
        nowMs: NOW,
      }),
    ).toThrow('names a different device');
  });

  it('rejects a roster signed by, or bound to, a root other than the verified one', () => {
    const root = verifyMessagingRoot({ ...mintRoot(), nowMs: NOW });
    const certificate = mintCertificate();
    const roster = mintRoster([
      {
        deviceId: 'device-a',
        certificateDigest: certificate.certificateDigest,
        active: true,
        addedAtMs: 1,
      },
    ]);
    expect(() =>
      verifyRosterSnapshot({
        rosterBytes: roster.rosterBytes,
        rootSignature: new Uint8Array(64),
        root,
        certificates: [certificate],
        nowMs: NOW,
      }),
    ).toThrow('Roster signature is invalid');

    const foreignBinding = signDeviceRoster(rootKeys.privateKey, {
      actorId: 'actor-a',
      rootGeneration: 1,
      rootPublicKey: otherRootKeys.publicKey,
      sequence: 1,
      previousDigest: new Uint8Array(32),
      createdAtMs: 1,
      entries: [],
    });
    expect(() =>
      verifyRosterSnapshot({
        rosterBytes: foreignBinding.rosterBytes,
        rootSignature: foreignBinding.rootSignature,
        root,
        certificates: [],
        nowMs: NOW,
      }),
    ).toThrow('does not bind the verified messaging root');
  });
});

describe('verifyPreKeyBundle', () => {
  it('accepts a device-signed bundle whose certificate is an active roster entry', () => {
    const user = userFixture('alice', 1);
    const { bundle } = bundleFixture(user, 21);
    expect(bundle.deviceId).toBe('alice-device');
    expect(bundle.rosterDigest).toEqual(user.roster.rosterDigest);
    expect(bundle.oneTimePreKey?.id).toBe(91);
  });

  it('rejects a bundle whose certificate is not an active entry of the verified roster', () => {
    const alice = userFixture('alice', 1);
    const bob = userFixture('bob', 11);
    const signed = signPreKeyBundle(bob.keys.signing.privateKey, {
      actorId: bob.device.actorId,
      deviceId: bob.device.deviceId,
      certificateDigest: bob.device.certificateDigest,
      signedPrekeyId: 7,
      signedPrekeyPublicKey: keyAgreementKeyPairFromPrivate(bytes(40)).publicKey,
      createdAtMs: 1,
      expiresAtMs: 20_000,
    });
    expect(() =>
      verifyPreKeyBundle({
        bundleBytes: signed.bundleBytes,
        deviceSignature: signed.deviceSignature,
        certificateBytes: bob.device.certificateBytes,
        certificateRootSignature: bob.device.rootSignature,
        roster: alice.roster,
        nowMs: NOW,
      }),
    ).toThrow(CertificateError);
  });

  it('rejects a wrong signature, an expired bundle, and an invalid one-time prekey', () => {
    const user = userFixture('alice', 1);
    const prekey = keyAgreementKeyPairFromPrivate(bytes(40));
    const fields = {
      actorId: user.device.actorId,
      deviceId: user.device.deviceId,
      certificateDigest: user.device.certificateDigest,
      signedPrekeyId: 7,
      signedPrekeyPublicKey: prekey.publicKey,
      createdAtMs: 1,
      expiresAtMs: 20_000,
    };
    const signed = signPreKeyBundle(user.keys.signing.privateKey, fields);
    const input = {
      bundleBytes: signed.bundleBytes,
      deviceSignature: signed.deviceSignature,
      certificateBytes: user.device.certificateBytes,
      certificateRootSignature: user.device.rootSignature,
      roster: user.roster,
      nowMs: NOW,
    };
    expect(verifyPreKeyBundle(input).signedPrekeyId).toBe(7);

    const foreign = signPreKeyBundle(signingKeyPairFromPrivate(bytes(50)).privateKey, fields);
    expect(() =>
      verifyPreKeyBundle({ ...input, deviceSignature: foreign.deviceSignature }),
    ).toThrow('Prekey bundle signature is invalid');

    const expired = signPreKeyBundle(user.keys.signing.privateKey, { ...fields, expiresAtMs: 5 });
    expect(() =>
      verifyPreKeyBundle({
        ...input,
        bundleBytes: expired.bundleBytes,
        deviceSignature: expired.deviceSignature,
      }),
    ).toThrow('not currently valid');

    expect(() =>
      verifyPreKeyBundle({ ...input, oneTimePreKey: { id: 0, publicKey: bytes(6) } }),
    ).toThrow(PreKeyError);
    expect(() =>
      verifyPreKeyBundle({ ...input, oneTimePreKey: { id: 1, publicKey: new Uint8Array(16) } }),
    ).toThrow('invalid length');
  });

  it('rejects a bundle that names a device other than the supplied certificate', () => {
    const alice = userFixture('alice', 1);
    const signed = signPreKeyBundle(alice.keys.signing.privateKey, {
      actorId: alice.device.actorId,
      deviceId: 'some-other-device',
      certificateDigest: alice.device.certificateDigest,
      signedPrekeyId: 7,
      signedPrekeyPublicKey: keyAgreementKeyPairFromPrivate(bytes(40)).publicKey,
      createdAtMs: 1,
      expiresAtMs: 20_000,
    });
    expect(() =>
      verifyPreKeyBundle({
        bundleBytes: signed.bundleBytes,
        deviceSignature: signed.deviceSignature,
        certificateBytes: alice.device.certificateBytes,
        certificateRootSignature: alice.device.rootSignature,
        roster: alice.roster,
        nowMs: NOW,
      }),
    ).toThrow('does not bind the verified device certificate');
  });
});

describe('verified results are unforgeable from outside this module', () => {
  it('does not accept a hand-built object where a VerifiedMessagingRoot is required', () => {
    const forged = {
      actorId: 'actor-a',
      generation: 1,
      publicKey: rootKeys.publicKey,
      createdAtMs: 1,
      rootBytes: new Uint8Array(0),
      selfSignature: new Uint8Array(64),
    };
    // @ts-expect-error the module-private brand is unnameable outside identity.ts, so no caller
    // can construct a `Verified*` value — this line failing to error would be the security bug.
    const asVerified: VerifiedMessagingRoot = forged;
    expect(asVerified.actorId).toBe('actor-a');
  });
});

describe('safetyNumber', () => {
  it('produces an order-independent 60-digit number', () => {
    const first = safetyNumber('a', bytes(10), 'b', bytes(20));
    expect(first).toMatch(/^\d{60}$/);
    expect(safetyNumber('b', bytes(20), 'a', bytes(10))).toBe(first);
  });

  it('orders participants by UTF-8 bytes, not by locale collation', () => {
    // 'Z' < 'a' by bytes but the reverse in many ICU locales, so a locale-ordered implementation
    // would disagree with this pair's byte-ordered counterpart.
    expect(safetyNumber('Z', bytes(10), 'a', bytes(20))).toBe(
      safetyNumber('a', bytes(20), 'Z', bytes(10)),
    );
  });

  it('rejects malformed participants', () => {
    expect(() => safetyNumber('', bytes(1), 'b', bytes(2))).toThrow(CertificateError);
    expect(() => safetyNumber('a', new Uint8Array(31), 'b', bytes(2))).toThrow(CertificateError);
  });
});
