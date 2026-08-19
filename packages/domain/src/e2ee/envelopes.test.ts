import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  assertEnvelopeShape,
  assertFanoutCovers,
  assertFanoutDigest,
  assertGroupFanoutBounds,
  assertMailboxPageOrdering,
  assertMembershipEpochCurrent,
  canonicalFanoutTranscript,
  compareMailboxKeys,
  sortFanoutTargets,
  type E2eeDeviceEnvelopeView,
  type E2eeFanoutTarget,
  type E2eeLogicalMessageView,
} from './envelopes.js';
import { E2EE_MAX_ENVELOPE_BYTES } from './modes.js';
import { fakeDigest, seededBytes } from './testing.js';

function envelope(
  actorId: string,
  deviceId: string,
  seed: number,
  overrides: Partial<E2eeDeviceEnvelopeView> = {},
): E2eeDeviceEnvelopeView {
  const ciphertext = seededBytes(128, seed);
  return {
    recipientActorId: actorId,
    recipientDeviceId: deviceId,
    encryptedHeader: seededBytes(48, seed + 1000),
    ciphertext,
    openingCiphertext: seededBytes(64, seed + 2000),
    ciphertextDigest: fakeDigest(ciphertext),
    ...overrides,
  };
}

function logical(
  envelopes: readonly E2eeDeviceEnvelopeView[],
  overrides: Partial<E2eeLogicalMessageView> = {},
): E2eeLogicalMessageView {
  return {
    membershipEpoch: 1n,
    frankingCommitment: seededBytes(32, 900),
    frankingProfile: 'patches-franking-v1',
    fanoutDigest: fakeDigest(canonicalFanoutTranscript(envelopes)),
    deviceEnvelopes: envelopes,
    ...overrides,
  };
}

describe('envelope shape', () => {
  it('accepts a complete sealed envelope', () => {
    expect(() => assertEnvelopeShape(envelope('a', 'd1', 1))).not.toThrow();
  });

  it('rejects a missing header, ciphertext, sealed opening, or recipient', () => {
    expect(() =>
      assertEnvelopeShape(envelope('a', 'd1', 1, { encryptedHeader: new Uint8Array(0) })),
    ).toThrow('no encrypted header');
    expect(() =>
      assertEnvelopeShape(envelope('a', 'd1', 1, { ciphertext: new Uint8Array(0) })),
    ).toThrow('no ciphertext');
    expect(() =>
      assertEnvelopeShape(envelope('a', 'd1', 1, { openingCiphertext: new Uint8Array(0) })),
    ).toThrow('no sealed franking opening');
    expect(() => assertEnvelopeShape(envelope('a', '', 1))).toThrow('missing a recipient');
    expect(() =>
      assertEnvelopeShape(envelope('a', 'd1', 1, { ciphertextDigest: seededBytes(31, 3) })),
    ).toThrow('must be 32 bytes');
  });

  it('enforces the size ceiling locally rather than trusting the node to', () => {
    const oversized = envelope('a', 'd1', 1, {
      ciphertext: seededBytes(E2EE_MAX_ENVELOPE_BYTES, 4),
    });
    expect(() => assertEnvelopeShape(oversized)).toThrow('above the 65536-byte limit');
  });
});

describe('fanout transcript and digest', () => {
  it('is order-independent: the same set of envelopes digests identically', () => {
    const a = envelope('actor-a', 'd1', 1);
    const b = envelope('actor-a', 'd2', 2);
    const c = envelope('actor-b', 'd1', 3);
    expect(canonicalFanoutTranscript([a, b, c])).toEqual(canonicalFanoutTranscript([c, a, b]));
  });

  it('distinguishes the same device id under a different actor', () => {
    const underA = canonicalFanoutTranscript([envelope('actor-a', 'd1', 1)]);
    const underB = canonicalFanoutTranscript([envelope('actor-b', 'd1', 1)]);
    expect(underA).not.toEqual(underB);
  });

  it('is unambiguous across field boundaries (length-prefixed, not concatenated)', () => {
    // "ab" + "c" and "a" + "bc" would collide under naive concatenation.
    const left = canonicalFanoutTranscript([envelope('ab', 'c', 1)]);
    const right = canonicalFanoutTranscript([envelope('a', 'bc', 1)]);
    expect(left).not.toEqual(right);
  });

  it('accepts a correct digest and rejects a tampered ciphertext digest', () => {
    const envelopes = [envelope('actor-a', 'd1', 1), envelope('actor-b', 'd1', 2)];
    const message = logical(envelopes);
    expect(() => assertFanoutDigest(message, { digest: fakeDigest })).not.toThrow();

    const swapped = [envelopes[0]!, { ...envelopes[1]!, ciphertextDigest: seededBytes(32, 77) }];
    expect(() =>
      assertFanoutDigest({ ...message, deviceEnvelopes: swapped }, { digest: fakeDigest }),
    ).toThrow('does not match the envelopes');
    expect(() =>
      assertFanoutDigest({ ...message, fanoutDigest: seededBytes(31, 1) }, { digest: fakeDigest }),
    ).toThrow('must be 32 bytes');
  });

  it('sorts targets deterministically', () => {
    const targets: E2eeFanoutTarget[] = [
      { actorId: 'b', deviceId: '1' },
      { actorId: 'a', deviceId: '2' },
      { actorId: 'a', deviceId: '1' },
    ];
    expect(sortFanoutTargets(targets)).toEqual([
      { actorId: 'a', deviceId: '1' },
      { actorId: 'a', deviceId: '2' },
      { actorId: 'b', deviceId: '1' },
    ]);
  });
});

describe('fanout exactness', () => {
  const targets: E2eeFanoutTarget[] = [
    { actorId: 'actor-a', deviceId: 'd1' },
    { actorId: 'actor-a', deviceId: 'd2' },
    { actorId: 'actor-b', deviceId: 'd1' },
  ];
  const envelopes = [
    envelope('actor-a', 'd1', 1),
    envelope('actor-a', 'd2', 2),
    envelope('actor-b', 'd1', 3),
  ];

  it('accepts a fanout that covers every active device exactly once', () => {
    expect(() => assertFanoutCovers(logical(envelopes), targets)).not.toThrow();
  });

  it("rejects a silent exclusion — the sender's own second device dropped", () => {
    expect(() => assertFanoutCovers(logical([envelopes[0]!, envelopes[2]!]), targets)).toThrow(
      'omits active device(s) d2',
    );
  });

  it('rejects delivery to a device nobody certified', () => {
    const extra = [...envelopes, envelope('actor-c', 'd9', 4)];
    expect(() => assertFanoutCovers(logical(extra), targets)).toThrow('uncertified device(s) d9');
  });

  it('rejects two envelopes for one device', () => {
    const duplicated = [...envelopes, envelope('actor-a', 'd1', 5)];
    expect(() => assertFanoutCovers(logical(duplicated), targets)).toThrow('twice');
  });

  it('rejects duplicate or empty expected targets', () => {
    expect(() => assertFanoutCovers(logical(envelopes), [...targets, targets[0]!])).toThrow(
      'duplicate device',
    );
    expect(() => assertFanoutCovers(logical([]), [])).toThrow('at least one device');
  });

  it('rejects a fanout beyond the 64-device bound', () => {
    const many: E2eeFanoutTarget[] = Array.from({ length: 65 }, (_, i) => ({
      actorId: `actor-${String(Math.floor(i / 9))}`,
      deviceId: `d${String(i)}`,
    }));
    const manyEnvelopes = many.map((t, i) => envelope(t.actorId, t.deviceId, 100 + i));
    expect(() => assertFanoutCovers(logical(manyEnvelopes), many)).toThrow(
      'exceeds the 64-device bound',
    );
  });

  it('property: dropping any single envelope from a valid fanout is always detected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 0, max: 11 }),
        (n, rawDrop) => {
          const built: E2eeFanoutTarget[] = Array.from({ length: n }, (_, i) => ({
            actorId: `actor-${String(i % 3)}`,
            deviceId: `dev-${String(i)}`,
          }));
          const full = built.map((t, i) => envelope(t.actorId, t.deviceId, 300 + i));
          expect(() => assertFanoutCovers(logical(full), built)).not.toThrow();
          const dropIndex = rawDrop % n;
          const reduced = full.filter((_, i) => i !== dropIndex);
          expect(() => assertFanoutCovers(logical(reduced), built)).toThrow();
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('membership epoch and group bounds', () => {
  it('rejects a stale epoch rather than delivering to a departed member', () => {
    expect(() => assertMembershipEpochCurrent(3n, 3n)).not.toThrow();
    expect(() => assertMembershipEpochCurrent(2n, 3n)).toThrow('must be re-composed');
    expect(() => assertMembershipEpochCurrent(4n, 3n)).toThrow('has not reached');
    expect(() => assertMembershipEpochCurrent(0n, 1n)).toThrow('start at 1');
  });

  it('bounds members and devices together', () => {
    expect(() => assertGroupFanoutBounds(2, 4)).not.toThrow();
    expect(() => assertGroupFanoutBounds(8, 64)).not.toThrow();
    expect(() => assertGroupFanoutBounds(9, 9)).toThrow('2..8 members');
    expect(() => assertGroupFanoutBounds(1, 1)).toThrow('2..8 members');
    expect(() => assertGroupFanoutBounds(2, 1)).toThrow('outside the bound');
    expect(() => assertGroupFanoutBounds(2, 17)).toThrow('outside the bound');
  });
});

describe('mailbox keyset ordering', () => {
  const at = (ms: number, id: string) => ({ receivedAt: new Date(ms), envelopeId: id });

  it('orders by received_at then envelope id', () => {
    expect(compareMailboxKeys(at(1, 'a'), at(2, 'a'))).toBeLessThan(0);
    expect(compareMailboxKeys(at(2, 'a'), at(1, 'a'))).toBeGreaterThan(0);
    expect(compareMailboxKeys(at(1, 'a'), at(1, 'b'))).toBeLessThan(0);
    expect(compareMailboxKeys(at(1, 'a'), at(1, 'a'))).toBe(0);
  });

  it('requires a strictly ascending page strictly after the cursor', () => {
    expect(() => assertMailboxPageOrdering([at(1, 'a'), at(2, 'b')], null)).not.toThrow();
    expect(() => assertMailboxPageOrdering([at(2, 'b'), at(1, 'a')], null)).toThrow(
      'not strictly ascending',
    );
    expect(() => assertMailboxPageOrdering([at(1, 'a'), at(1, 'a')], null)).toThrow(
      'not strictly ascending',
    );
    // A node re-serving the cursor row itself would make acknowledge-then-fetch loop forever.
    expect(() => assertMailboxPageOrdering([at(1, 'a')], at(1, 'a'))).toThrow(
      'not strictly ascending',
    );
  });

  it('property: sorting by compareMailboxKeys always yields an acceptable page', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            ms: fc.integer({ min: 0, max: 50 }),
            id: fc.string({ minLength: 1, maxLength: 4 }),
          }),
          { minLength: 1, maxLength: 20, selector: (r) => `${String(r.ms)}:${r.id}` },
        ),
        (rows) => {
          const keys = rows.map((r) => at(r.ms, r.id)).sort(compareMailboxKeys);
          expect(() => assertMailboxPageOrdering(keys, null)).not.toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});
