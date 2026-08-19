import { describe, expect, it } from 'vitest';

import {
  commitFranking,
  createFrankingOpeningKey,
  createNodeReportTag,
  verifyFrankingCommitment,
  verifyFrankingReport,
  verifyNodeReportTag,
  type FrankingReportEvidence,
  type FrankingReportTranscript,
} from './franking.js';
import { sha256Hash } from './primitives.js';

const encoder = new TextEncoder();

function digest(label: string): Uint8Array {
  return sha256Hash(encoder.encode(label));
}

function baseTranscript(commitment: Uint8Array): FrankingReportTranscript {
  return {
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
    const commitment = commitFranking(opening, plaintext);
    expect(verifyFrankingCommitment(opening, plaintext, commitment)).toBe(true);
  });

  it('rejects a commitment check against different plaintext (forged evidence)', () => {
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, encoder.encode('original'));
    expect(verifyFrankingCommitment(opening, encoder.encode('forged'), commitment)).toBe(false);
  });

  it('rejects a commitment check under the wrong opening key', () => {
    const plaintext = encoder.encode('hello bob');
    const commitment = commitFranking(createFrankingOpeningKey(), plaintext);
    expect(verifyFrankingCommitment(createFrankingOpeningKey(), plaintext, commitment)).toBe(false);
  });

  it('rejects a truncated opening key or commitment', () => {
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('hi');
    const commitment = commitFranking(opening, plaintext);
    expect(() => commitFranking(opening.slice(0, 10), plaintext)).toThrow(
      'Franking opening key has an invalid length.',
    );
    expect(() => verifyFrankingCommitment(opening, plaintext, commitment.slice(0, 4))).toThrow(
      'Franking commitment has an invalid length.',
    );
  });
});

describe('node report tag', () => {
  it('verifies a tag the node itself produced over the accepted transcript', () => {
    const nodeKey = digest('node-franking-key-era-3');
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('reported content');
    const commitment = commitFranking(opening, plaintext);
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
});

describe('full report evidence verification', () => {
  function acceptedEvidence(): { nodeKey: Uint8Array; evidence: FrankingReportEvidence } {
    const nodeKey = digest('node-key');
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('evidence body');
    const commitment = commitFranking(opening, plaintext);
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
