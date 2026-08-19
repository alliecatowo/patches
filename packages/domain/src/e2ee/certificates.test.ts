import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  assertDeviceUsableForSend,
  classifyIdentityRootChange,
  requiresReverification,
  verifyDeviceCertificate,
  verifyIdentityRoot,
  type E2eeDeviceCertificateView,
  type E2eeIdentityRootView,
} from './certificates.js';
import { fakeDigest, fakeSign, fakeVerifier, rejectingVerifier, seededBytes } from './testing.js';
import { ED25519_PUBLIC_KEY_BYTES, X25519_PUBLIC_KEY_BYTES } from './types.js';

const NOW = new Date('2026-08-19T00:00:00.000Z');

function makeRoot(overrides: Partial<E2eeIdentityRootView> = {}): E2eeIdentityRootView {
  const publicKey = overrides.publicKey ?? seededBytes(ED25519_PUBLIC_KEY_BYTES, 1);
  const rootBytes = overrides.rootBytes ?? new TextEncoder().encode('root-transcript:1');
  return {
    actorId: 'actor-a',
    generation: 1,
    publicKey,
    rootBytes,
    selfSignature: fakeSign(publicKey, rootBytes),
    ...overrides,
  };
}

function makeCertificate(
  root: E2eeIdentityRootView,
  overrides: Partial<E2eeDeviceCertificateView> = {},
): E2eeDeviceCertificateView {
  const certificateBytes =
    overrides.certificateBytes ?? new TextEncoder().encode('cert-transcript:device-1');
  return {
    actorId: root.actorId,
    deviceId: 'device-1',
    rootGeneration: root.generation,
    certificateVersion: 1,
    signingPublicKey: seededBytes(ED25519_PUBLIC_KEY_BYTES, 2),
    agreementPublicKey: seededBytes(X25519_PUBLIC_KEY_BYTES, 3),
    supportedProtocolVersions: ['patches-e2ee-v1'],
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: new Date('2027-08-01T00:00:00.000Z'),
    certificateBytes,
    rootSignature: fakeSign(root.publicKey, certificateBytes),
    certificateDigest: fakeDigest(certificateBytes),
    status: 'ACTIVE',
    revokedAt: null,
    ...overrides,
  };
}

const deps = {
  verifier: fakeVerifier,
  digest: fakeDigest,
  now: NOW,
  decodedMatchesTranscript: true,
};

describe('identity root', () => {
  it('accepts a root that proves possession of its own key', () => {
    expect(() => verifyIdentityRoot(makeRoot(), { verifier: fakeVerifier })).not.toThrow();
  });

  it('rejects a root whose self-signature does not verify', () => {
    expect(() => verifyIdentityRoot(makeRoot(), { verifier: rejectingVerifier })).toThrow(
      'self-signature does not verify',
    );
  });

  it('rejects malformed keys, signatures, generations and empty transcripts', () => {
    const root = makeRoot();
    expect(() =>
      verifyIdentityRoot({ ...root, publicKey: seededBytes(31, 9) }, { verifier: fakeVerifier }),
    ).toThrow('must be 32 bytes');
    expect(() =>
      verifyIdentityRoot(
        { ...root, selfSignature: seededBytes(63, 9) },
        { verifier: fakeVerifier },
      ),
    ).toThrow('must be 64 bytes');
    expect(() =>
      verifyIdentityRoot({ ...root, generation: 0 }, { verifier: fakeVerifier }),
    ).toThrow('positive integer');
    expect(() =>
      verifyIdentityRoot(
        { ...root, rootBytes: new Uint8Array(0), selfSignature: root.selfSignature },
        { verifier: fakeVerifier },
      ),
    ).toThrow('transcript is empty');
  });
});

describe('device certificate chain', () => {
  it('accepts a root-signed certificate binding both device keys', () => {
    const root = makeRoot();
    expect(() => verifyDeviceCertificate(makeCertificate(root), root, deps)).not.toThrow();
  });

  it('is the fix for the unbound-identity finding: a swapped agreement key breaks the signature', () => {
    const root = makeRoot();
    const certificate = makeCertificate(root);
    // The attacker keeps the victim's signed transcript but substitutes their own X25519 key.
    // The decoded view no longer matches the signed bytes, and that is a rejection, not a warning.
    const attacked: E2eeDeviceCertificateView = {
      ...certificate,
      agreementPublicKey: seededBytes(X25519_PUBLIC_KEY_BYTES, 77),
    };
    expect(() =>
      verifyDeviceCertificate(attacked, root, { ...deps, decodedMatchesTranscript: false }),
    ).toThrow('disagree with the signed transcript');
  });

  it('rejects a certificate signed by a different root', () => {
    const root = makeRoot();
    const other = makeRoot({ publicKey: seededBytes(ED25519_PUBLIC_KEY_BYTES, 42) });
    const certificate = makeCertificate(other);
    expect(() =>
      verifyDeviceCertificate({ ...certificate, actorId: root.actorId }, root, deps),
    ).toThrow('not signed by this actor');
  });

  it('does not survive a root rotation', () => {
    const root = makeRoot();
    const certificate = makeCertificate(root);
    const rotated = makeRoot({ generation: 2, rootBytes: new TextEncoder().encode('root:2') });
    expect(() => verifyDeviceCertificate(certificate, rotated, deps)).toThrow(
      'superseded root generation',
    );
  });

  it('rejects an expired certificate, a reversed validity window, and a wrong version', () => {
    const root = makeRoot();
    const certificate = makeCertificate(root);
    expect(() =>
      verifyDeviceCertificate(
        {
          ...certificate,
          createdAt: new Date('2025-01-01T00:00:00Z'),
          expiresAt: new Date('2026-01-01T00:00:00Z'),
        },
        root,
        deps,
      ),
    ).toThrow('has expired');
    expect(() =>
      verifyDeviceCertificate(
        { ...certificate, createdAt: new Date('2028-01-01T00:00:00Z') },
        root,
        deps,
      ),
    ).toThrow('expires before it was created');
    expect(() =>
      verifyDeviceCertificate({ ...certificate, certificateVersion: 2 }, root, deps),
    ).toThrow('Unsupported device certificate version');
  });

  it('rejects a certificate whose signing and agreement keys are the same keypair', () => {
    const root = makeRoot();
    const shared = seededBytes(ED25519_PUBLIC_KEY_BYTES, 5);
    const certificate = makeCertificate(root, {
      signingPublicKey: shared,
      agreementPublicKey: shared,
    });
    expect(() => verifyDeviceCertificate(certificate, root, deps)).toThrow('independent keypairs');
  });

  it('rejects a certificate that does not advertise the protocol, or names another actor', () => {
    const root = makeRoot();
    expect(() =>
      verifyDeviceCertificate(makeCertificate(root, { supportedProtocolVersions: [] }), root, deps),
    ).toThrow('does not advertise');
    expect(() =>
      verifyDeviceCertificate(makeCertificate(root, { actorId: 'actor-b' }), root, deps),
    ).toThrow('names a different actor');
  });

  it('rejects a digest that does not cover the signed transcript', () => {
    const root = makeRoot();
    const certificate = makeCertificate(root, { certificateDigest: seededBytes(32, 8) });
    expect(() => verifyDeviceCertificate(certificate, root, deps)).toThrow(
      'digest does not match its transcript',
    );
  });

  it('refuses to encrypt to a revoked or inactive device', () => {
    const root = makeRoot();
    expect(() => assertDeviceUsableForSend(makeCertificate(root))).not.toThrow();
    expect(() => assertDeviceUsableForSend(makeCertificate(root, { status: 'REVOKED' }))).toThrow(
      'not active',
    );
    expect(() =>
      assertDeviceUsableForSend(
        makeCertificate(root, { revokedAt: new Date('2026-08-10T00:00:00Z') }),
      ),
    ).toThrow('revoked');
  });

  it('property: any transcript the root signed verifies, and any other transcript does not', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 96 }),
        fc.uint8Array({ minLength: 1, maxLength: 96 }),
        (signed, other) => {
          fc.pre(signed.length !== other.length || !signed.every((b, i) => b === other[i]));
          const root = makeRoot();
          const good = makeCertificate(root, { certificateBytes: signed });
          expect(() => verifyDeviceCertificate(good, root, deps)).not.toThrow();
          // Same signature and digest, different bytes: both checks must reject.
          const tampered: E2eeDeviceCertificateView = { ...good, certificateBytes: other };
          expect(() => verifyDeviceCertificate(tampered, root, deps)).toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('identity change classification', () => {
  it('reports no change for the same generation and key', () => {
    const root = makeRoot();
    expect(classifyIdentityRootChange(root, root, { verifier: fakeVerifier })).toBe('NONE');
    expect(classifyIdentityRootChange(null, root, { verifier: fakeVerifier })).toBe('NONE');
  });

  it('classifies a previous-root-signed transition as a planned rotation', () => {
    const previous = makeRoot();
    const nextBytes = new TextEncoder().encode('root-transcript:2');
    const next = makeRoot({
      generation: 2,
      publicKey: seededBytes(ED25519_PUBLIC_KEY_BYTES, 11),
      rootBytes: nextBytes,
      previousRootSignature: fakeSign(previous.publicKey, nextBytes),
    });
    expect(classifyIdentityRootChange(previous, next, { verifier: fakeVerifier })).toBe(
      'PLANNED_ROTATION',
    );
  });

  it('classifies an unsigned or badly signed transition as an unverified reset', () => {
    const previous = makeRoot();
    const next = makeRoot({
      generation: 2,
      publicKey: seededBytes(ED25519_PUBLIC_KEY_BYTES, 12),
      rootBytes: new TextEncoder().encode('root-transcript:2'),
    });
    expect(classifyIdentityRootChange(previous, next, { verifier: fakeVerifier })).toBe(
      'UNVERIFIED_RESET',
    );
    expect(
      classifyIdentityRootChange(
        previous,
        { ...next, previousRootSignature: seededBytes(64, 3) },
        { verifier: fakeVerifier },
      ),
    ).toBe('UNVERIFIED_RESET');
  });

  it('rejects a generation rollback and a cross-actor comparison', () => {
    const previous = makeRoot({ generation: 3 });
    const next = makeRoot({ generation: 2, publicKey: seededBytes(ED25519_PUBLIC_KEY_BYTES, 13) });
    expect(() => classifyIdentityRootChange(previous, next, { verifier: fakeVerifier })).toThrow(
      'rollback',
    );
    expect(() =>
      classifyIdentityRootChange(previous, makeRoot({ actorId: 'actor-z', generation: 4 }), {
        verifier: fakeVerifier,
      }),
    ).toThrow('different actors');
  });

  it('requires re-verification for every change, signed or not', () => {
    expect(requiresReverification('NONE')).toBe(false);
    expect(requiresReverification('PLANNED_ROTATION')).toBe(true);
    expect(requiresReverification('UNVERIFIED_RESET')).toBe(true);
  });
});
