import { describe, expect, it } from 'vitest';

import { ByteWriter, concatBytes } from './codec.js';
import { MalformedInputError } from './errors.js';
import {
  decodeDeviceCertificateTranscript,
  decodeDeviceRosterTranscript,
  decodeMessagingRootTranscript,
  decodePreKeyBundleTranscript,
  encodeDeviceCertificateTranscript,
  encodeDeviceRosterTranscript,
  encodeMessagingRootTranscript,
  encodePreKeyBundleTranscript,
  E2EE_IDENTITY_TRANSCRIPT_DOMAIN,
  E2EE_IDENTITY_TRANSCRIPT_TAGS,
  E2EE_IDENTITY_TRANSCRIPT_VERSION,
  sortByUtf8Bytes,
  sortRosterEntries,
  type DeviceCertificateTranscript,
  type DeviceRosterTranscript,
  type MessagingRootTranscript,
  type PreKeyBundleTranscript,
} from './identity-transcript.js';

function bytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

const root: MessagingRootTranscript = {
  actorId: 'actor-a',
  generation: 1,
  publicKey: bytes(1),
  createdAtMs: 1_700_000_000_000,
};

const certificate: DeviceCertificateTranscript = {
  actorId: 'actor-a',
  deviceId: 'device-a',
  rootGeneration: 1,
  rootPublicKey: bytes(1),
  certificateVersion: 1,
  signingPublicKey: bytes(2),
  agreementPublicKey: bytes(3),
  supportedProtocolVersions: ['patches-e2ee-v1', 'patches-e2ee-v2'],
  createdAtMs: 1_700_000_000_000,
  expiresAtMs: 1_800_000_000_000,
};

const roster: DeviceRosterTranscript = {
  actorId: 'actor-a',
  rootGeneration: 1,
  rootPublicKey: bytes(1),
  sequence: 1,
  previousDigest: new Uint8Array(32),
  createdAtMs: 1_700_000_000_000,
  entries: [
    { deviceId: 'device-a', certificateDigest: bytes(4), active: true, addedAtMs: 1 },
    {
      deviceId: 'device-b',
      certificateDigest: bytes(5),
      active: false,
      addedAtMs: 2,
      revokedAtMs: 3,
    },
  ],
};

const bundle: PreKeyBundleTranscript = {
  actorId: 'actor-a',
  deviceId: 'device-a',
  certificateDigest: bytes(4),
  signedPrekeyId: 7,
  signedPrekeyPublicKey: bytes(6),
  createdAtMs: 1_700_000_000_000,
  expiresAtMs: 1_700_000_100_000,
};

interface RawRosterEntry {
  readonly deviceId: string;
  readonly digest: Uint8Array;
  readonly active: number;
  readonly addedAtMs: number;
  readonly hasRevokedAt: number;
  readonly revokedAtMs: number;
}

function rawEntry(deviceId: string, overrides: Partial<RawRosterEntry> = {}): RawRosterEntry {
  return {
    deviceId,
    digest: bytes(4),
    active: 1,
    addedAtMs: 1,
    hasRevokedAt: 0,
    revokedAtMs: 0,
    ...overrides,
  };
}

/**
 * Hand-writes a T3 with each slot supplied as raw bytes, so a test can plant a value the encoder
 * itself would refuse (an unsafe u64, a boolean byte of 2) and prove the *decoder* refuses it too.
 */
function handWrittenRoster(overrides: {
  domain?: string;
  version?: number;
  tag?: number;
  sequence?: Uint8Array;
  previousDigest?: Uint8Array;
  entries?: readonly RawRosterEntry[];
}): Uint8Array {
  const entries = overrides.entries ?? [rawEntry('device-a')];
  const writer = new ByteWriter()
    .string(overrides.domain ?? E2EE_IDENTITY_TRANSCRIPT_DOMAIN)
    .u8(overrides.version ?? E2EE_IDENTITY_TRANSCRIPT_VERSION)
    .u8(overrides.tag ?? E2EE_IDENTITY_TRANSCRIPT_TAGS.deviceRoster)
    .string(roster.actorId)
    .u32(roster.rootGeneration)
    .fixed(roster.rootPublicKey, 32)
    .fixed(overrides.sequence ?? Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 1), 8)
    .fixed(overrides.previousDigest ?? roster.previousDigest, 32)
    .u64(roster.createdAtMs)
    .u32(entries.length);
  for (const entry of entries) {
    writer
      .string(entry.deviceId)
      .fixed(entry.digest, 32)
      .u8(entry.active)
      .u64(entry.addedAtMs)
      .u8(entry.hasRevokedAt)
      .u64(entry.revokedAtMs);
  }
  return writer.finish();
}

describe('identity transcript codec: round trips', () => {
  it('round-trips all four transcripts', () => {
    expect(decodeMessagingRootTranscript(encodeMessagingRootTranscript(root))).toEqual(root);
    expect(
      decodeDeviceCertificateTranscript(encodeDeviceCertificateTranscript(certificate)),
    ).toEqual(certificate);
    expect(decodeDeviceRosterTranscript(encodeDeviceRosterTranscript(roster))).toEqual(roster);
    expect(decodePreKeyBundleTranscript(encodePreKeyBundleTranscript(bundle))).toEqual(bundle);
  });

  it('gives every transcript type the same prefix and a distinct tag', () => {
    const encoded = [
      encodeMessagingRootTranscript(root),
      encodeDeviceCertificateTranscript(certificate),
      encodeDeviceRosterTranscript(roster),
      encodePreKeyBundleTranscript(bundle),
    ];
    const prefixLength = 4 + new TextEncoder().encode(E2EE_IDENTITY_TRANSCRIPT_DOMAIN).length + 1;
    for (const [index, value] of encoded.entries()) {
      expect(Array.from(value.slice(0, prefixLength))).toEqual(
        Array.from(encoded[0]?.slice(0, prefixLength) ?? []),
      );
      expect(value[prefixLength]).toBe(index + 1);
    }
  });

  it('sorts into the strictly ascending byte order the encoder demands', () => {
    expect(sortByUtf8Bytes(['b', 'A', 'a'])).toEqual(['A', 'a', 'b']);
    // 'Z' (0x5a) sorts before 'a' (0x61) by bytes; many ICU locales would order these the other way.
    expect(sortByUtf8Bytes(['a', 'Z'])).toEqual(['Z', 'a']);
    expect(
      sortRosterEntries([
        { deviceId: 'b', certificateDigest: bytes(1), active: true, addedAtMs: 1 },
        { deviceId: 'a', certificateDigest: bytes(2), active: true, addedAtMs: 1 },
      ]).map((entry) => entry.deviceId),
    ).toEqual(['a', 'b']);
  });
});

describe('identity transcript codec: encoder constraints', () => {
  it('rejects out-of-range counters and empty identifiers', () => {
    expect(() => encodeMessagingRootTranscript({ ...root, generation: 0 })).toThrow(
      MalformedInputError,
    );
    expect(() => encodeMessagingRootTranscript({ ...root, actorId: '' })).toThrow(
      MalformedInputError,
    );
    expect(() => encodeMessagingRootTranscript({ ...root, createdAtMs: -1 })).toThrow(
      MalformedInputError,
    );
    expect(() => encodeDeviceRosterTranscript({ ...roster, sequence: 0 })).toThrow(
      MalformedInputError,
    );
    expect(() => encodePreKeyBundleTranscript({ ...bundle, signedPrekeyId: 0 })).toThrow(
      MalformedInputError,
    );
  });

  it('rejects wrong key widths', () => {
    expect(() => encodeMessagingRootTranscript({ ...root, publicKey: new Uint8Array(31) })).toThrow(
      MalformedInputError,
    );
    expect(() =>
      encodeDeviceRosterTranscript({ ...roster, previousDigest: new Uint8Array(16) }),
    ).toThrow(MalformedInputError);
  });

  it('rejects a non-positive validity window', () => {
    expect(() =>
      encodeDeviceCertificateTranscript({ ...certificate, expiresAtMs: certificate.createdAtMs }),
    ).toThrow(MalformedInputError);
    expect(() => encodePreKeyBundleTranscript({ ...bundle, expiresAtMs: 1 })).toThrow(
      MalformedInputError,
    );
  });

  it('rejects unsorted or duplicated protocol versions and device ids', () => {
    expect(() =>
      encodeDeviceCertificateTranscript({
        ...certificate,
        supportedProtocolVersions: ['patches-e2ee-v2', 'patches-e2ee-v1'],
      }),
    ).toThrow('not sorted');
    expect(() =>
      encodeDeviceCertificateTranscript({
        ...certificate,
        supportedProtocolVersions: ['patches-e2ee-v1', 'patches-e2ee-v1'],
      }),
    ).toThrow('duplicate');
    expect(() =>
      encodeDeviceRosterTranscript({ ...roster, entries: [...roster.entries].reverse() }),
    ).toThrow('not sorted');
    const first = roster.entries[0];
    if (first === undefined) throw new Error('fixture roster is empty');
    expect(() => encodeDeviceRosterTranscript({ ...roster, entries: [first, first] })).toThrow(
      'duplicate',
    );
  });

  it('rejects a sequence-1 roster with a non-zero previousDigest', () => {
    expect(() =>
      encodeDeviceRosterTranscript({ ...roster, sequence: 1, previousDigest: bytes(9) }),
    ).toThrow('all-zero at sequence 1');
    // Sequence > 1 is unaffected: a non-zero previousDigest is exactly what it's for.
    expect(() =>
      encodeDeviceRosterTranscript({ ...roster, sequence: 2, previousDigest: bytes(9) }),
    ).not.toThrow();
  });
});

describe('identity transcript codec: decoder fails closed', () => {
  it('rejects a wrong domain, version, or tag', () => {
    expect(() =>
      decodeDeviceRosterTranscript(handWrittenRoster({ domain: 'patches-e2ee/identity-v2' })),
    ).toThrow('wrong domain separator');
    expect(() => decodeDeviceRosterTranscript(handWrittenRoster({ version: 2 }))).toThrow(
      'unsupported version',
    );
    expect(() => decodeDeviceRosterTranscript(handWrittenRoster({ tag: 4 }))).toThrow(
      'wrong type tag',
    );
    // Cross-type confusion: a valid T2 must never decode as a T3, and vice versa.
    expect(() =>
      decodeDeviceRosterTranscript(encodeDeviceCertificateTranscript(certificate)),
    ).toThrow('wrong type tag');
    expect(() => decodeMessagingRootTranscript(encodePreKeyBundleTranscript(bundle))).toThrow(
      'wrong type tag',
    );
  });

  it('rejects trailing bytes and truncation', () => {
    const encoded = encodeMessagingRootTranscript(root);
    expect(() => decodeMessagingRootTranscript(concatBytes(encoded, Uint8Array.of(0)))).toThrow(
      'Trailing bytes',
    );
    expect(() => decodeMessagingRootTranscript(encoded.slice(0, encoded.length - 1))).toThrow(
      'Truncated input',
    );
  });

  it('rejects non-ascending and duplicate roster entries', () => {
    const descending = handWrittenRoster({
      entries: [rawEntry('device-b'), rawEntry('device-a')],
    });
    expect(() => decodeDeviceRosterTranscript(descending)).toThrow('not sorted');
    const duplicated = handWrittenRoster({
      entries: [rawEntry('device-a'), rawEntry('device-a')],
    });
    expect(() => decodeDeviceRosterTranscript(duplicated)).toThrow('duplicate');
  });

  it('rejects boolean bytes outside {0,1}', () => {
    expect(() =>
      decodeDeviceRosterTranscript(
        handWrittenRoster({ entries: [rawEntry('device-a', { active: 2 })] }),
      ),
    ).toThrow('active is not a canonical boolean byte');
    expect(() =>
      decodeDeviceRosterTranscript(
        handWrittenRoster({ entries: [rawEntry('device-a', { hasRevokedAt: 255 })] }),
      ),
    ).toThrow('hasRevokedAt is not a canonical boolean byte');
  });

  it('rejects a revocation time an entry does not claim', () => {
    expect(() =>
      decodeDeviceRosterTranscript(
        handWrittenRoster({ entries: [rawEntry('device-a', { active: 0, revokedAtMs: 5 })] }),
      ),
    ).toThrow('revocation time it does not claim');
  });

  it('rejects a u64 outside the safe-integer range', () => {
    const unsafeSequence = Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
    expect(() =>
      decodeDeviceRosterTranscript(handWrittenRoster({ sequence: unsafeSequence })),
    ).toThrow('safe-integer range');
  });

  it('rejects a sequence of zero even though the bytes are well formed', () => {
    expect(() =>
      decodeDeviceRosterTranscript(
        handWrittenRoster({ sequence: Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0) }),
      ),
    ).toThrow('sequence must be a positive integer');
  });

  it('rejects a sequence-1 roster with a non-zero previousDigest, even hand-written', () => {
    expect(() =>
      decodeDeviceRosterTranscript(handWrittenRoster({ previousDigest: bytes(9) })),
    ).toThrow('all-zero at sequence 1');
    // Sequence 2 with the same non-zero digest decodes fine — the constraint is specific to
    // sequence 1, not previousDigest in general.
    expect(() =>
      decodeDeviceRosterTranscript(
        handWrittenRoster({
          sequence: Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 2),
          previousDigest: bytes(9),
        }),
      ),
    ).not.toThrow();
  });
});
