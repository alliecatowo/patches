import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  decodeCertificateTranscript,
  decodeRosterTranscript,
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from './e2ee.codec.js';

function bytes(seed: number, length = 32): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = (seed + i) & 0xff;
  return out;
}

describe('e2ee.codec certificate transcript', () => {
  const fields = {
    actorId: 'actor-1',
    deviceId: 'device-1',
    rootGeneration: 1,
    rootPublicKey: bytes(9),
    certificateVersion: 1,
    signingPublicKey: bytes(1),
    agreementPublicKey: bytes(2),
    supportedProtocolVersions: ['patches-e2ee-v1'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('round-trips through encode/decode', () => {
    const encoded = encodeCertificateTranscript(fields);
    const decoded = decodeCertificateTranscript(encoded);
    expect(decoded.actorId).toBe(fields.actorId);
    expect(decoded.deviceId).toBe(fields.deviceId);
    expect(decoded.rootGeneration).toBe(fields.rootGeneration);
    expect([...decoded.rootPublicKey]).toEqual([...fields.rootPublicKey]);
    expect(decoded.certificateVersion).toBe(fields.certificateVersion);
    expect([...decoded.signingPublicKey]).toEqual([...fields.signingPublicKey]);
    expect([...decoded.agreementPublicKey]).toEqual([...fields.agreementPublicKey]);
    expect(decoded.supportedProtocolVersions).toEqual(fields.supportedProtocolVersions);
    expect(decoded.createdAt.getTime()).toBe(fields.createdAt.getTime());
    expect(decoded.expiresAt.getTime()).toBe(fields.expiresAt.getTime());
  });

  it('produces different bytes for different device ids (no field-boundary collision)', () => {
    const a = encodeCertificateTranscript(fields);
    const b = encodeCertificateTranscript({ ...fields, deviceId: 'device-2' });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects a corrupt stored transcript rather than silently misdecoding it', () => {
    expect(() => decodeCertificateTranscript(new Uint8Array([1, 2, 3]))).toThrow(AppError);
  });
});

describe('e2ee.codec roster transcript', () => {
  const entries = [
    {
      deviceId: 'device-1',
      certificateDigest: bytes(3),
      active: true,
      addedAt: new Date('2026-01-01T00:00:00.000Z'),
      revokedAt: undefined,
    },
    {
      deviceId: 'device-2',
      certificateDigest: bytes(4),
      active: false,
      addedAt: new Date('2026-01-02T00:00:00.000Z'),
      revokedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  ];

  it('round-trips entries, rootGeneration, rootPublicKey, and createdAt through encode/decode', () => {
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    const encoded = encodeRosterTranscript({
      actorId: 'actor-1',
      sequence: 2n,
      rootGeneration: 3,
      rootPublicKey: bytes(9),
      previousDigest: bytes(5),
      createdAt,
      entries,
    });
    const decoded = decodeRosterTranscript(encoded);
    expect(decoded.actorId).toBe('actor-1');
    expect(decoded.sequence).toBe(2n);
    expect(decoded.rootGeneration).toBe(3);
    expect([...decoded.rootPublicKey]).toEqual([...bytes(9)]);
    expect(decoded.createdAt.getTime()).toBe(createdAt.getTime());
    expect(decoded.entries).toHaveLength(2);
    expect(decoded.entries[0]?.active).toBe(true);
    expect(decoded.entries[1]?.active).toBe(false);
    expect(decoded.entries[1]?.revokedAt?.getTime()).toBe(entries[1]?.revokedAt?.getTime());
    expect(decoded.entries[0]?.revokedAt).toBeUndefined();
  });
});

describe('e2ee.codec prekey bundle transcript', () => {
  it('changes when the signed prekey id changes (anti-replay binding)', () => {
    const base = {
      certificateDigest: bytes(6),
      actorId: 'actor-1',
      deviceId: 'device-1',
      signedPrekeyId: 1n,
      signedPrekeyPublicKey: bytes(8),
      signedPrekeyCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      signedPrekeyExpiresAt: new Date('2026-01-08T00:00:00.000Z'),
    };
    const a = encodePrekeyBundleTranscript(base);
    const b = encodePrekeyBundleTranscript({ ...base, signedPrekeyId: 2n });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('refuses a wrong-width digest or key rather than silently shifting every later field (ADR 0024 B-051)', () => {
    const base = {
      certificateDigest: bytes(6),
      actorId: 'actor-1',
      deviceId: 'device-1',
      signedPrekeyId: 1n,
      signedPrekeyPublicKey: bytes(8),
      signedPrekeyCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      signedPrekeyExpiresAt: new Date('2026-01-08T00:00:00.000Z'),
    };
    // Before B-051, these `fixed()` fields were unvalidated in the encoder and injective only
    // because unrelated `octet_length(...) = 32` database CHECK constraints happened to hold for
    // every persisted caller — a signed transcript should not depend on that.
    expect(() =>
      encodePrekeyBundleTranscript({ ...base, certificateDigest: bytes(6, 31) }),
    ).toThrow();
    expect(() =>
      encodePrekeyBundleTranscript({ ...base, signedPrekeyPublicKey: bytes(8, 16) }),
    ).toThrow();
  });
});
