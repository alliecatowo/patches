import { describe, expect, it } from 'vitest';

import {
  commitFranking,
  createFrankingOpeningKey,
  createNodeReportTag,
  encodeReportTranscript,
  verifyFrankingCommitment,
  verifyFrankingReport,
  verifyNodeReportTag,
  verifyNodeReportTagOverEncodedTranscript,
  type FrankingCommitmentContext,
  type FrankingReportEvidence,
  type FrankingReportTranscript,
} from './franking.js';
import { sha256Hash } from './primitives.js';

const encoder = new TextEncoder();

function digest(label: string): Uint8Array {
  return sha256Hash(encoder.encode(label));
}

const CONTEXT: FrankingCommitmentContext = {
  frankingProfile: 'patches-franking-v1',
  conversationId: 'conversation-1',
  membershipEpoch: 1,
  senderActorId: 'alice',
  senderDeviceId: 'alice-device',
};

function baseTranscript(commitment: Uint8Array): FrankingReportTranscript {
  return {
    frankingProfile: CONTEXT.frankingProfile,
    frankingKeyEra: 3,
    conversationId: 'conversation-1',
    membershipEpoch: 1,
    logicalMessageId: 'message-1',
    senderActorId: 'alice',
    senderDeviceId: 'alice-device',
    recipientFanoutDigest: digest('fanout'),
    acceptedAtMs: 1_700_000_000_000,
    commitment,
    ciphertextDigests: [digest('device-1'), digest('device-2')],
  };
}

describe('franking commitment', () => {
  it('binds a commitment to its exact plaintext and opening key', () => {
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('hello bob');
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    expect(verifyFrankingCommitment(opening, CONTEXT, plaintext, commitment)).toBe(true);
  });

  it('rejects a commitment check against different plaintext (forged evidence)', () => {
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, CONTEXT, encoder.encode('original'));
    expect(verifyFrankingCommitment(opening, CONTEXT, encoder.encode('forged'), commitment)).toBe(
      false,
    );
  });

  it('rejects a commitment check under the wrong opening key', () => {
    const plaintext = encoder.encode('hello bob');
    const commitment = commitFranking(createFrankingOpeningKey(), CONTEXT, plaintext);
    expect(
      verifyFrankingCommitment(createFrankingOpeningKey(), CONTEXT, plaintext, commitment),
    ).toBe(false);
  });

  it('rejects a truncated opening key or commitment', () => {
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('hi');
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    expect(() => commitFranking(opening.slice(0, 10), CONTEXT, plaintext)).toThrow(
      'Franking opening key has an invalid length.',
    );
    expect(() =>
      verifyFrankingCommitment(opening, CONTEXT, plaintext, commitment.slice(0, 4)),
    ).toThrow('Franking commitment has an invalid length.');
  });
});

describe('node report tag', () => {
  it('verifies a tag the node itself produced over the accepted transcript', () => {
    const nodeKey = digest('node-franking-key-era-3');
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('reported content');
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    const transcript = baseTranscript(commitment);
    const tag = createNodeReportTag(nodeKey, transcript);
    expect(verifyNodeReportTag(nodeKey, transcript, tag)).toBe(true);
  });

  it('rejects a tag verified under a different node franking-key era (rotated key)', () => {
    const nodeKey = digest('era-3');
    const otherEraKey = digest('era-4');
    const transcript = baseTranscript(digest('commitment'));
    const tag = createNodeReportTag(nodeKey, transcript);
    expect(verifyNodeReportTag(otherEraKey, transcript, tag)).toBe(false);
  });

  it('rejects a tag replayed against a transcript for a different logical message', () => {
    const nodeKey = digest('node-key');
    const transcript = baseTranscript(digest('commitment'));
    const tag = createNodeReportTag(nodeKey, transcript);
    const otherMessage = { ...transcript, logicalMessageId: 'message-2' };
    expect(verifyNodeReportTag(nodeKey, otherMessage, tag)).toBe(false);
  });

  it('rejects a tag whose ciphertext digest set was tampered after acceptance', () => {
    const nodeKey = digest('node-key');
    const transcript = baseTranscript(digest('commitment'));
    const tag = createNodeReportTag(nodeKey, transcript);
    const tampered = { ...transcript, ciphertextDigests: [digest('device-1')] };
    expect(verifyNodeReportTag(nodeKey, tampered, tag)).toBe(false);
  });

  it('rejects a transcript with no ciphertext digests', () => {
    const nodeKey = digest('node-key');
    expect(() =>
      createNodeReportTag(nodeKey, { ...baseTranscript(digest('c')), ciphertextDigests: [] }),
    ).toThrow('at least one ciphertext digest');
  });

  describe('canonicalization (field-boundary confusion)', () => {
    /**
     * Every string/variable-length field the transcript encoder writes is length-prefixed
     * (`ByteWriter#string`/`bytes`). If it were naive concatenation instead, two different
     * (conversationId, logicalMessageId) splits that concatenate to the same characters would
     * produce the same tag — letting a forger "borrow" a real tag for content the node never
     * actually accepted under those exact ids. This proves that attack is closed.
     */
    it('gives distinct transcripts to two different field splits that concatenate identically', () => {
      const nodeKey = digest('node-key');
      const shared = { conversationId: 'ab', logicalMessageId: 'c' } as const;
      const swapped = { conversationId: 'a', logicalMessageId: 'bc' } as const;
      const transcriptA = { ...baseTranscript(digest('commitment')), ...shared };
      const transcriptB = { ...baseTranscript(digest('commitment')), ...swapped };
      expect(encodeReportTranscript(transcriptA)).not.toEqual(encodeReportTranscript(transcriptB));
      const tagA = createNodeReportTag(nodeKey, transcriptA);
      const tagB = createNodeReportTag(nodeKey, transcriptB);
      expect(bytesToHex(tagA)).not.toEqual(bytesToHex(tagB));
      expect(verifyNodeReportTag(nodeKey, transcriptB, tagA)).toBe(false);
    });

    it('gives distinct transcripts when senderActorId/senderDeviceId are split differently', () => {
      const nodeKey = digest('node-key');
      const transcriptA = {
        ...baseTranscript(digest('commitment')),
        senderActorId: 'alice-dev',
        senderDeviceId: 'ice-1',
      };
      const transcriptB = {
        ...baseTranscript(digest('commitment')),
        senderActorId: 'alice-dev-i',
        senderDeviceId: 'ce-1',
      };
      expect(encodeReportTranscript(transcriptA)).not.toEqual(encodeReportTranscript(transcriptB));
      const tag = createNodeReportTag(nodeKey, transcriptA);
      expect(verifyNodeReportTag(nodeKey, transcriptB, tag)).toBe(false);
    });

    it('rejects a merged ciphertext digest that tries to fake a two-digest transcript as one field', () => {
      // A naive unprefixed concatenation of two 32-byte digests is indistinguishable from one
      // 64-byte field; `requireKeyBytes` (fixed 32-byte width) closes that off structurally
      // rather than relying on the count prefix alone.
      const nodeKey = digest('node-key');
      const merged = new Uint8Array([...digest('device-1'), ...digest('device-2')]);
      expect(() =>
        createNodeReportTag(nodeKey, {
          ...baseTranscript(digest('commitment')),
          ciphertextDigests: [merged],
        }),
      ).toThrow('Ciphertext digest has an invalid length.');
    });

    it('gives distinct tags for two orderings of the same ciphertext digests', () => {
      // ciphertextDigests order is part of the transcript (not sorted here) — a report tag
      // for one accepted order must not verify against a reshuffled replay.
      const nodeKey = digest('node-key');
      const [d1, d2] = [digest('device-1'), digest('device-2')];
      const forward = { ...baseTranscript(digest('commitment')), ciphertextDigests: [d1, d2] };
      const reversed = { ...baseTranscript(digest('commitment')), ciphertextDigests: [d2, d1] };
      const tag = createNodeReportTag(nodeKey, forward);
      expect(verifyNodeReportTag(nodeKey, reversed, tag)).toBe(false);
    });
  });
});

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('full report evidence verification', () => {
  function acceptedEvidence(): { nodeKey: Uint8Array; evidence: FrankingReportEvidence } {
    const nodeKey = digest('node-key');
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('evidence body');
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    const transcript = baseTranscript(commitment);
    const nodeReportTag = createNodeReportTag(nodeKey, transcript);
    return {
      nodeKey,
      evidence: { plaintext, openingKey: opening, commitment, transcript, nodeReportTag },
    };
  }

  it('accepts genuine, unmodified evidence', () => {
    const { nodeKey, evidence } = acceptedEvidence();
    expect(() => verifyFrankingReport(nodeKey, evidence)).not.toThrow();
  });

  it('rejects evidence with a forged plaintext', () => {
    const { nodeKey, evidence } = acceptedEvidence();
    expect(() =>
      verifyFrankingReport(nodeKey, { ...evidence, plaintext: encoder.encode('forged body') }),
    ).toThrow('sender commitment');
  });

  it('rejects evidence with a forged opening key', () => {
    const { nodeKey, evidence } = acceptedEvidence();
    expect(() =>
      verifyFrankingReport(nodeKey, { ...evidence, openingKey: createFrankingOpeningKey() }),
    ).toThrow('sender commitment');
  });

  it('rejects evidence whose disclosed commitment does not match the accepted transcript', () => {
    const { nodeKey, evidence } = acceptedEvidence();
    expect(() =>
      verifyFrankingReport(nodeKey, { ...evidence, commitment: digest('other-commitment') }),
    ).toThrow('accepted transcript');
  });

  it('rejects evidence with a forged or truncated node report tag', () => {
    const { nodeKey, evidence } = acceptedEvidence();
    const forgedTag = evidence.nodeReportTag.slice();
    forgedTag[0] = (forgedTag[0] ?? 0) ^ 1;
    expect(() => verifyFrankingReport(nodeKey, { ...evidence, nodeReportTag: forgedTag })).toThrow(
      'Node report tag',
    );
    expect(() =>
      verifyFrankingReport(nodeKey, {
        ...evidence,
        nodeReportTag: evidence.nodeReportTag.slice(0, 8),
      }),
    ).toThrow('Node report tag has an invalid length.');
  });

  it('rejects replayed evidence presented against a different accepted transcript', () => {
    const { nodeKey, evidence } = acceptedEvidence();
    const replayedTranscript = { ...evidence.transcript, logicalMessageId: 'message-elsewhere' };
    expect(() =>
      verifyFrankingReport(nodeKey, { ...evidence, transcript: replayedTranscript }),
    ).toThrow('accepted transcript');
  });
});

describe('commitment context binding (ADR 0025 §1)', () => {
  const plaintext = encoder.encode('the reported message');

  function commitmentUnder(context: FrankingCommitmentContext, opening: Uint8Array): Uint8Array {
    return commitFranking(opening, context, plaintext);
  }

  it.each([
    ['franking profile', { frankingProfile: 'patches-franking-v2' }],
    ['conversation', { conversationId: 'conversation-2' }],
    ['membership epoch', { membershipEpoch: 2 }],
    ['sender actor', { senderActorId: 'mallory' }],
    ['sender device', { senderDeviceId: 'alice-other-device' }],
  ])('does not verify when the %s differs from the one committed to', (_label, override) => {
    const opening = createFrankingOpeningKey();
    const commitment = commitmentUnder(CONTEXT, opening);
    const elsewhere: FrankingCommitmentContext = { ...CONTEXT, ...override };
    expect(verifyFrankingCommitment(opening, elsewhere, plaintext, commitment)).toBe(false);
    expect(verifyFrankingCommitment(opening, CONTEXT, plaintext, commitment)).toBe(true);
  });

  /**
   * ADR 0024's B-052: `franking_profile` used not to be bound anywhere, so a future
   * `patches-franking-v2` with a similar layout would have been cross-acceptable with v1. The
   * profile is now the first field after the domain separator, so it cannot be.
   */
  it('gives a v2 profile a different commitment for identical content', () => {
    const opening = createFrankingOpeningKey();
    expect(bytesToHex(commitmentUnder(CONTEXT, opening))).not.toEqual(
      bytesToHex(commitmentUnder({ ...CONTEXT, frankingProfile: 'patches-franking-v2' }, opening)),
    );
  });

  it('gives distinct commitments to context field splits that concatenate identically', () => {
    const opening = createFrankingOpeningKey();
    const left = commitmentUnder({ ...CONTEXT, senderActorId: 'ab', senderDeviceId: 'c' }, opening);
    const right = commitmentUnder(
      { ...CONTEXT, senderActorId: 'a', senderDeviceId: 'bc' },
      opening,
    );
    expect(bytesToHex(left)).not.toEqual(bytesToHex(right));
  });

  /**
   * The load-bearing anti-Grubbs/Lu/Ristenpart invariant, pinned as a test rather than left to a
   * comment: RFC 2104 reduces any key longer than the 64-byte block with `SHA256(K)`, so a
   * 65-byte opening and its digest would open the same commitment. Widening `requireKeyBytes` is
   * the change that silently reopens that attack, and this fails the moment someone does.
   */
  it.each([16, 31, 33, 64, 65])('refuses a %d-byte opening key outright', (length) => {
    expect(() => commitFranking(new Uint8Array(length), CONTEXT, plaintext)).toThrow(
      'Franking opening key has an invalid length.',
    );
  });
});

describe('verifyNodeReportTagOverEncodedTranscript (ADR 0024 B-050)', () => {
  const nodeKey = digest('node-key');

  it('accepts the same bytes verifyNodeReportTag accepts', () => {
    const transcript = baseTranscript(digest('commitment'));
    const tag = createNodeReportTag(nodeKey, transcript);
    expect(
      verifyNodeReportTagOverEncodedTranscript(nodeKey, encodeReportTranscript(transcript), tag),
    ).toBe(true);
  });

  /**
   * The defect this replaces was a raw `hmacSha256` under the node's long-term franking key over
   * untyped bytes — an equality oracle that would happily MAC a commitment transcript, a fanout
   * transcript, or anything else a caller handed it. Requiring the report domain separator means
   * the only strings this key ever MACs are report transcripts.
   */
  it('refuses bytes that are not a canonical report transcript', () => {
    const transcript = baseTranscript(digest('commitment'));
    const encoded = encodeReportTranscript(transcript);
    const tag = createNodeReportTag(nodeKey, transcript);
    const reDomained = encoded.slice();
    reDomained[8] = (reDomained[8] ?? 0) ^ 0xff;
    expect(verifyNodeReportTagOverEncodedTranscript(nodeKey, reDomained, tag)).toBe(false);
    expect(verifyNodeReportTagOverEncodedTranscript(nodeKey, new Uint8Array(4), tag)).toBe(false);
    expect(verifyNodeReportTagOverEncodedTranscript(nodeKey, new Uint8Array(0), tag)).toBe(false);
  });
});
