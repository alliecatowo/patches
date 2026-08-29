/**
 * Chain-verification tests for M4: `verifyActorChain` must reject a served roster or
 * certificate whose decoded convenience fields disagree with the root key, timestamps, or
 * revocation state their own signed transcript names (ADR 0033 §2). Fixtures are built with
 * `@patches/crypto`'s real signers so verification is pinned to what a real node signs, never
 * hand-rolled bytes.
 */
import { describe, expect, it } from 'vitest';

import {
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  sign,
  signDeviceCertificate,
  signDeviceRoster,
  signingKeyPairFromPrivate,
} from '@patches/crypto';
import { E2EE_DEVICE_CERTIFICATE_VERSION } from '@patches/domain';

import { E2EE_DEVICE_STATUS } from '../src/api/wire/enums.js';
import { fromDate } from '../src/api/wire/time.js';
import type {
  E2eeDeviceCertificate,
  E2eeDeviceRoster,
  E2eeIdentityRoot,
} from '../src/api/wire/types.js';
import { verifyActorChain } from '../src/e2ee/chain.js';

const CREATED = new Date('2026-08-01T00:00:00Z');
const EXPIRES = new Date('2027-08-01T00:00:00Z');

function seed32(text: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(text).subarray(0, 32));
  return out;
}

interface ChainFixture {
  readonly rootWire: E2eeIdentityRoot;
  readonly rosterWire: E2eeDeviceRoster;
  readonly certificatesWire: E2eeDeviceCertificate[];
}

function buildChain(actorId: string, deviceId: string, rootSeedText: string): ChainFixture {
  const rootPair = signingKeyPairFromPrivate(seed32(rootSeedText));
  const deviceSigning = generateSigningKeyPair();
  const deviceAgreement = generateKeyAgreementKeyPair();
  const signedCertificate = signDeviceCertificate(rootPair.privateKey, {
    actorId,
    deviceId,
    rootGeneration: 1,
    rootPublicKey: rootPair.publicKey,
    certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
    signingPublicKey: deviceSigning.publicKey,
    agreementPublicKey: deviceAgreement.publicKey,
    supportedProtocolVersions: ['patches-e2ee-v1'],
    createdAtMs: CREATED.getTime(),
    expiresAtMs: EXPIRES.getTime(),
  });
  const certificateDigest = signedCertificate.certificateDigest;
  const certificatesWire: E2eeDeviceCertificate[] = [
    {
      $typeName: 'patches.v1.E2eeDeviceCertificate',
      actorId,
      deviceId,
      rootGeneration: 1,
      certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
      signingPublicKey: deviceSigning.publicKey,
      agreementPublicKey: deviceAgreement.publicKey,
      supportedProtocolVersions: ['patches-e2ee-v1'],
      createdAt: fromDate(CREATED),
      expiresAt: fromDate(EXPIRES),
      certificateBytes: signedCertificate.certificateBytes,
      rootSignature: signedCertificate.rootSignature,
      certificateDigest,
      status: E2EE_DEVICE_STATUS.ACTIVE,
    },
  ];
  const signedRoster = signDeviceRoster(rootPair.privateKey, {
    actorId,
    rootGeneration: 1,
    rootPublicKey: rootPair.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    createdAtMs: CREATED.getTime(),
    entries: [
      {
        deviceId,
        certificateDigest,
        active: true,
        addedAtMs: CREATED.getTime(),
      },
    ],
  });
  const rosterWire: E2eeDeviceRoster = {
    $typeName: 'patches.v1.E2eeDeviceRoster',
    actorId,
    sequence: 1n,
    rootGeneration: 1,
    previousDigest: new Uint8Array(32),
    digest: signedRoster.rosterDigest,
    rosterBytes: signedRoster.rosterBytes,
    rootSignature: signedRoster.rootSignature,
    entries: [
      {
        $typeName: 'patches.v1.E2eeRosterEntry',
        deviceId,
        certificateDigest,
        active: true,
        addedAt: fromDate(CREATED),
      },
    ],
    createdAt: fromDate(CREATED),
  };
  const rootBytes = new TextEncoder().encode(`patches-root:${actorId}:1`);
  const rootWire: E2eeIdentityRoot = {
    $typeName: 'patches.v1.E2eeIdentityRoot',
    actorId,
    generation: 1,
    publicKey: rootPair.publicKey,
    rootBytes,
    selfSignature: sign(rootPair.privateKey, rootBytes),
    previousRootSignature: new Uint8Array(0),
    createdAt: fromDate(CREATED),
  };
  return { rootWire, rosterWire, certificatesWire };
}

describe('verifyActorChain — transcript/root-key and timestamp binding (M4)', () => {
  it('accepts a well-formed published chain', () => {
    const fix = buildChain('actor-m4', 'device-m4', 'seed-m4-base');
    const chain = verifyActorChain({
      rootWire: fix.rootWire,
      rosterWire: fix.rosterWire,
      certificatesWire: fix.certificatesWire,
      now: CREATED,
    });
    expect(chain.activeDevices.get('device-m4')?.signingPublicKey).toBeDefined();
  });

  it('rejects a certificate whose transcript names a root other than the verifying root', () => {
    // Everything about this chain (root, roster, roster signature) is genuine and internally
    // consistent EXCEPT the device certificate itself, which is signed by a different root's
    // private key. The roster is re-signed over the tampered certificate's real digest so the
    // roster-transcript check passes and the failure is isolated to the certificate's own
    // root-key binding — without ADR 0033 §2's check, the deep signature verifier
    // (`verifyDeviceCertificate`) would still catch this because it checks the signature
    // against `root.publicKey` too, so the assertion below is on *which* check fires: the
    // transcript match, before the signature verifier ever runs.
    const actorId = 'actor-m4';
    const deviceId = 'device-m4-cert';
    const rootPair = signingKeyPairFromPrivate(seed32('seed-m4-cert-root'));
    const otherRoot = signingKeyPairFromPrivate(seed32('seed-m4-other-root'));
    const deviceSigning = generateSigningKeyPair();
    const deviceAgreement = generateKeyAgreementKeyPair();
    const wrongRootCertificate = signDeviceCertificate(otherRoot.privateKey, {
      actorId,
      deviceId,
      rootGeneration: 1,
      rootPublicKey: otherRoot.publicKey,
      certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
      signingPublicKey: deviceSigning.publicKey,
      agreementPublicKey: deviceAgreement.publicKey,
      supportedProtocolVersions: ['patches-e2ee-v1'],
      createdAtMs: CREATED.getTime(),
      expiresAtMs: EXPIRES.getTime(),
    });
    const certificatesWire: E2eeDeviceCertificate[] = [
      {
        $typeName: 'patches.v1.E2eeDeviceCertificate',
        actorId,
        deviceId,
        rootGeneration: 1,
        certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
        signingPublicKey: deviceSigning.publicKey,
        agreementPublicKey: deviceAgreement.publicKey,
        supportedProtocolVersions: ['patches-e2ee-v1'],
        createdAt: fromDate(CREATED),
        expiresAt: fromDate(EXPIRES),
        certificateBytes: wrongRootCertificate.certificateBytes,
        rootSignature: wrongRootCertificate.rootSignature,
        certificateDigest: wrongRootCertificate.certificateDigest,
        status: E2EE_DEVICE_STATUS.ACTIVE,
      },
    ];
    const signedRoster = signDeviceRoster(rootPair.privateKey, {
      actorId,
      rootGeneration: 1,
      rootPublicKey: rootPair.publicKey,
      sequence: 1,
      previousDigest: new Uint8Array(32),
      createdAtMs: CREATED.getTime(),
      entries: [
        {
          deviceId,
          certificateDigest: wrongRootCertificate.certificateDigest,
          active: true,
          addedAtMs: CREATED.getTime(),
        },
      ],
    });
    const rosterWire: E2eeDeviceRoster = {
      $typeName: 'patches.v1.E2eeDeviceRoster',
      actorId,
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: new Uint8Array(32),
      digest: signedRoster.rosterDigest,
      rosterBytes: signedRoster.rosterBytes,
      rootSignature: signedRoster.rootSignature,
      entries: [
        {
          $typeName: 'patches.v1.E2eeRosterEntry',
          deviceId,
          certificateDigest: wrongRootCertificate.certificateDigest,
          active: true,
          addedAt: fromDate(CREATED),
        },
      ],
      createdAt: fromDate(CREATED),
    };
    const rootBytes = new TextEncoder().encode(`patches-root:${actorId}:1`);
    const rootWire: E2eeIdentityRoot = {
      $typeName: 'patches.v1.E2eeIdentityRoot',
      actorId,
      generation: 1,
      publicKey: rootPair.publicKey,
      rootBytes,
      selfSignature: sign(rootPair.privateKey, rootBytes),
      previousRootSignature: new Uint8Array(0),
      createdAt: fromDate(CREATED),
    };
    expect(() =>
      verifyActorChain({ rootWire, rosterWire, certificatesWire, now: CREATED }),
    ).toThrow(/certificate disagrees with its signed transcript/);
  });

  it('rejects a served roster whose wire createdAt disagrees with its signed transcript', () => {
    const fix = buildChain('actor-m4', 'device-m4-created', 'seed-m4-created');
    const tamperedRoster: E2eeDeviceRoster = {
      ...fix.rosterWire,
      createdAt: fromDate(new Date(CREATED.getTime() + 1_000)),
    };
    expect(() =>
      verifyActorChain({
        rootWire: fix.rootWire,
        rosterWire: tamperedRoster,
        certificatesWire: fix.certificatesWire,
        now: CREATED,
      }),
    ).toThrow(/roster disagrees with its signed transcript/);
  });

  it('rejects a served roster entry whose wire revokedAt disagrees with its signed transcript', () => {
    const actorId = 'actor-m4';
    const deviceId = 'device-m4-revoked';
    const rootPair = signingKeyPairFromPrivate(seed32('seed-m4-revoked-root'));
    const deviceSigning = generateSigningKeyPair();
    const deviceAgreement = generateKeyAgreementKeyPair();
    const signedCertificate = signDeviceCertificate(rootPair.privateKey, {
      actorId,
      deviceId,
      rootGeneration: 1,
      rootPublicKey: rootPair.publicKey,
      certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
      signingPublicKey: deviceSigning.publicKey,
      agreementPublicKey: deviceAgreement.publicKey,
      supportedProtocolVersions: ['patches-e2ee-v1'],
      createdAtMs: CREATED.getTime(),
      expiresAtMs: EXPIRES.getTime(),
    });
    // The transcript's entry has no revocation (matches the node's real "never revoked" shape);
    // the served wire entry claims one was applied. Kept active on the wire so the chain reaches
    // certificate verification, isolating the check to the roster-transcript comparison.
    const signedRoster = signDeviceRoster(rootPair.privateKey, {
      actorId,
      rootGeneration: 1,
      rootPublicKey: rootPair.publicKey,
      sequence: 1,
      previousDigest: new Uint8Array(32),
      createdAtMs: CREATED.getTime(),
      entries: [
        {
          deviceId,
          certificateDigest: signedCertificate.certificateDigest,
          active: true,
          addedAtMs: CREATED.getTime(),
        },
      ],
    });
    const rootBytes = new TextEncoder().encode(`patches-root:${actorId}:1`);
    const rootWire: E2eeIdentityRoot = {
      $typeName: 'patches.v1.E2eeIdentityRoot',
      actorId,
      generation: 1,
      publicKey: rootPair.publicKey,
      rootBytes,
      selfSignature: sign(rootPair.privateKey, rootBytes),
      previousRootSignature: new Uint8Array(0),
      createdAt: fromDate(CREATED),
    };
    const rosterWire: E2eeDeviceRoster = {
      $typeName: 'patches.v1.E2eeDeviceRoster',
      actorId,
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: new Uint8Array(32),
      digest: signedRoster.rosterDigest,
      rosterBytes: signedRoster.rosterBytes,
      rootSignature: signedRoster.rootSignature,
      entries: [
        {
          $typeName: 'patches.v1.E2eeRosterEntry',
          deviceId,
          certificateDigest: signedCertificate.certificateDigest,
          active: true,
          addedAt: fromDate(CREATED),
          revokedAt: fromDate(CREATED),
        },
      ],
      createdAt: fromDate(CREATED),
    };
    const certificatesWire: E2eeDeviceCertificate[] = [
      {
        $typeName: 'patches.v1.E2eeDeviceCertificate',
        actorId,
        deviceId,
        rootGeneration: 1,
        certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
        signingPublicKey: deviceSigning.publicKey,
        agreementPublicKey: deviceAgreement.publicKey,
        supportedProtocolVersions: ['patches-e2ee-v1'],
        createdAt: fromDate(CREATED),
        expiresAt: fromDate(EXPIRES),
        certificateBytes: signedCertificate.certificateBytes,
        rootSignature: signedCertificate.rootSignature,
        certificateDigest: signedCertificate.certificateDigest,
        status: E2EE_DEVICE_STATUS.ACTIVE,
      },
    ];
    expect(() =>
      verifyActorChain({ rootWire, rosterWire, certificatesWire, now: CREATED }),
    ).toThrow(/roster disagrees with its signed transcript/);
  });
});
