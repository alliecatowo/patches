import { describe, expect, it } from 'vitest';

import {
  E2EE_HISTORY_TRANSFER_DOMAIN,
  assertHistoryEntryFields,
  assertHistoryTransferDigest,
  assertHistoryTransferShape,
  canonicalHistoryTransferTranscript,
  decodeHistoryTransfer,
  encodeHistoryTransfer,
  E2EE_HISTORY_TRANSFER_MAX_ENTRIES,
  E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES,
  E2EE_HISTORY_TRANSFER_MAX_RECORD_BYTES,
} from './history-transfer.js';
import { fakeDigest, seededBytes } from './testing.js';
import type { E2eeHistoryEntryFields } from './history-transfer.js';

const digest = fakeDigest;

/**
 * Generated fixtures only (seeded filler bytes, never real conversation content):
 * every plaintext in this suite is `seededBytes`, which is what the no-secrets-in-tests
 * rule looks like at the unit layer.
 */
function entry(overrides: Partial<E2eeHistoryEntryFields> = {}): E2eeHistoryEntryFields {
  return {
    conversationId: 'conv-1',
    logicalMessageId: 'msg-1',
    senderActorId: 'actor-1',
    senderDeviceId: 'device-1',
    membershipEpoch: 1n,
    acceptedAtMs: 1_000,
    plaintext: seededBytes(16, 1),
    ...overrides,
  };
}

function batch(entries: readonly E2eeHistoryEntryFields[]) {
  return {
    conversationId: 'conv-1',
    fromActorId: 'actor-2',
    fromDeviceId: 'device-2',
    entries,
  };
}

describe('assertHistoryEntryFields', () => {
  it('accepts a well-formed entry', () => {
    expect(() => assertHistoryEntryFields(entry())).not.toThrow();
  });

  it('rejects an empty plaintext and an oversize plaintext', () => {
    expect(() => assertHistoryEntryFields(entry({ plaintext: new Uint8Array() }))).toThrow(/empty/);
    expect(() =>
      assertHistoryEntryFields(
        entry({ plaintext: seededBytes(E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES + 1, 2) }),
      ),
    ).toThrow(/exceeds/);
  });

  it('rejects a zero membership epoch', () => {
    expect(() => assertHistoryEntryFields(entry({ membershipEpoch: 0n }))).toThrow(/start at 1/);
  });

  it('rejects ids it must bind', () => {
    for (const field of ['conversationId', 'logicalMessageId', 'senderActorId', 'senderDeviceId']) {
      expect(() => assertHistoryEntryFields(entry({ [field]: '' }))).toThrow(/invalid/);
    }
  });
});

describe('assertHistoryTransferShape', () => {
  it('rejects an empty batch and an over-max batch', () => {
    expect(() => assertHistoryTransferShape(batch([]))).toThrow(/at least one/);
    const tooMany = Array.from({ length: E2EE_HISTORY_TRANSFER_MAX_ENTRIES + 1 }, (_, i) =>
      entry({ logicalMessageId: `msg-${String(i)}`, acceptedAtMs: 1_000 + i }),
    );
    expect(() => assertHistoryTransferShape(batch(tooMany))).toThrow(/at most/);
  });

  it('rejects an entry from another conversation', () => {
    expect(() => assertHistoryTransferShape(batch([entry({ conversationId: 'conv-2' })]))).toThrow(
      /other than the batch/,
    );
  });

  it('rejects a duplicated logical message id', () => {
    expect(() =>
      assertHistoryTransferShape(batch([entry(), entry({ acceptedAtMs: 2_000 })])),
    ).toThrow(/more than once/);
  });

  it('rejects entries that are not strictly ascending', () => {
    const later = entry({ logicalMessageId: 'msg-0', acceptedAtMs: 2_000 });
    expect(() => assertHistoryTransferShape(batch([later, entry()]))).toThrow(/strictly ascending/);
    // Same accepted-at must disambiguate by logical id, not collide.
    const sameTime = entry({ logicalMessageId: 'msg-0', acceptedAtMs: 1_000 });
    expect(() => assertHistoryTransferShape(batch([sameTime, entry()]))).not.toThrow();
  });
});

describe('canonicalHistoryTransferTranscript', () => {
  it('is deterministic and sensitive to every bound field', () => {
    const base = canonicalHistoryTransferTranscript(batch([entry()]));
    expect([...canonicalHistoryTransferTranscript(batch([entry()]))]).toEqual([...base]);
    expect([
      ...canonicalHistoryTransferTranscript(batch([entry({ plaintext: seededBytes(16, 99) })])),
    ]).not.toEqual([...base]);
    expect([
      ...canonicalHistoryTransferTranscript(batch([entry({ acceptedAtMs: 1_001 })])),
    ]).not.toEqual([...base]);
    expect([
      ...canonicalHistoryTransferTranscript({ ...batch([entry()]), fromDeviceId: 'device-9' }),
    ]).not.toEqual([...base]);
  });

  it('encodes entries in canonical order and rejects an unsorted batch', () => {
    const ascending = batch([
      entry({ logicalMessageId: 'a', acceptedAtMs: 1 }),
      entry({ logicalMessageId: 'b', acceptedAtMs: 1 }),
      entry({ logicalMessageId: 'c', acceptedAtMs: 2 }),
    ]);
    const shuffled = { ...ascending, entries: [...ascending.entries].slice().reverse() };
    expect(() => canonicalHistoryTransferTranscript(shuffled)).toThrow(/strictly ascending/);
    expect([...canonicalHistoryTransferTranscript(ascending)]).toEqual([
      ...canonicalHistoryTransferTranscript(ascending),
    ]);
  });
});

describe('encode/decode roundtrip', () => {
  it('round-trips a batch and recomputes the digest identically', () => {
    const view = encodeHistoryTransfer(
      batch([
        entry({ logicalMessageId: 'a', acceptedAtMs: 1 }),
        entry({ logicalMessageId: 'b', acceptedAtMs: 2, plaintext: seededBytes(64, 7) }),
      ]),
      { digest },
    );
    const decoded = decodeHistoryTransfer(view.recordBytes, { digest });
    expect(decoded.conversationId).toBe(view.conversationId);
    expect(decoded.fromActorId).toBe(view.fromActorId);
    expect(decoded.fromDeviceId).toBe(view.fromDeviceId);
    expect(decoded.entries).toEqual(view.entries);
    expect([...decoded.recordBytes]).toEqual([...view.recordBytes]);
    expect(() => assertHistoryTransferDigest(decoded, { digest })).not.toThrow();
  });

  it('rejects a foreign domain separator', () => {
    const view = encodeHistoryTransfer(batch([entry()]), { digest });
    const tampered = view.recordBytes.slice();
    // Overwrite the domain string's first byte inside the first length-prefixed part.
    tampered[5] = 0x58;
    expect(() => decodeHistoryTransfer(tampered, { digest })).toThrow(/foreign domain/);
  });

  it('rejects an unknown version', () => {
    const view = encodeHistoryTransfer(batch([entry()]), { digest });
    // The version is the second length-prefixed part: 4-byte prefix, domain bytes, 4-byte
    // prefix (value 1), then the version byte itself.
    const tampered = view.recordBytes.slice();
    const versionOffset = 4 + new TextEncoder().encode(E2EE_HISTORY_TRANSFER_DOMAIN).length + 4;
    tampered[versionOffset] = 2;
    expect(() => decodeHistoryTransfer(tampered, { digest })).toThrow(/version/);
  });

  it('rejects truncated and trailing bytes', () => {
    const view = encodeHistoryTransfer(batch([entry()]), { digest });
    expect(() => decodeHistoryTransfer(view.recordBytes.slice(0, -1), { digest })).toThrow(
      /truncated/,
    );
    const trailing = new Uint8Array(view.recordBytes.length + 1);
    trailing.set(view.recordBytes, 0);
    expect(() => decodeHistoryTransfer(trailing, { digest })).toThrow(/trailing/);
  });

  it('rejects a shape violation hiding inside well-framed bytes', () => {
    // The encoder refuses to mint a cross-conversation batch, so smuggle one: take valid
    // canonical bytes and patch only the *entry-level* conversation id (second occurrence
    // of 'conv-1' — the first is the batch header's) to a same-length foreign value. Decode
    // must run the full shape check on the well-framed result, not just parse it.
    const view = encodeHistoryTransfer(batch([entry()]), { digest });
    const marker = new TextEncoder().encode('conv-1');
    let second = -1;
    for (let i = 0; i < 2; i += 1) {
      second = indexOfSequence(view.recordBytes, marker, second + 1);
      expect(second).toBeGreaterThan(-1);
    }
    const patched = view.recordBytes.slice();
    patched.set(new TextEncoder().encode('conv-9'), second);
    expect(() => decodeHistoryTransfer(patched, { digest })).toThrow(/other than the batch/);
  });

  it('enforces the whole-record ceiling', () => {
    const bigEntries = Array.from({ length: 10 }, (_, i) =>
      entry({
        logicalMessageId: `msg-${String(i)}`,
        acceptedAtMs: 1_000 + i,
        plaintext: seededBytes(E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES, i + 1),
      }),
    );
    expect(() => encodeHistoryTransfer(batch(bigEntries), { digest })).toThrow(/ceiling|exceeds/);
  });

  it('rejects a digest that does not match the transcript', () => {
    const view = encodeHistoryTransfer(batch([entry()]), { digest });
    const forged = { ...view, transferDigest: seededBytes(32, 42) };
    expect(() => assertHistoryTransferDigest(forged, { digest })).toThrow(/does not match/);
    expect(() =>
      assertHistoryTransferDigest({ ...view, transferDigest: seededBytes(31, 3) }, { digest }),
    ).toThrow(/32 bytes/);
  });

  it('bounds record size below the envelope ceiling', () => {
    expect(E2EE_HISTORY_TRANSFER_MAX_RECORD_BYTES).toBeLessThan(64 * 1_024);
  });
});

/** First index of `needle` in `haystack` at or after `from`, or -1. */
function indexOfSequence(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  scan: for (let i = Math.max(0, from); i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue scan;
    }
    return i;
  }
  return -1;
}
