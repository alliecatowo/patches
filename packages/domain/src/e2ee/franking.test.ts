import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  assertReporterConsent,
  assertReportEvidenceShape,
  E2EE_FRANKING_MODERATOR_DISCLOSURE,
  E2EE_REPORT_MAX_EVIDENCE_ITEMS,
  verifyReportEvidence,
  type E2eeFrankingTagView,
  type E2eeReportEvidenceItemView,
  type FrankingVerifier,
} from './franking.js';
import {
  assertFrankingProfileApproved,
  E2EE_APPROVED_FRANKING_PROFILES,
  E2EE_FRANKING_PROFILE_V1,
} from './modes.js';
import { fakeDigest, seededBytes } from './testing.js';
import { bytesEqual, E2EE_DIGEST_BYTES, type Bytes } from './types.js';

const TEST_PROFILE = 'test-franking';
const TEST_ERA = 3;

/**
 * A binding fake: the commitment is the digest of `opening || plaintext`, so a second plaintext
 * cannot open the same commitment. Not cryptography — just enough structure that the binding
 * property is what the tests actually exercise.
 */
function commit(opening: Bytes, plaintext: Bytes): Bytes {
  const combined = new Uint8Array(opening.length + plaintext.length);
  combined.set(opening, 0);
  combined.set(plaintext, opening.length);
  return fakeDigest(combined);
}

const verifier: FrankingVerifier = {
  verifyCommitment: ({ commitment, opening, plaintext }) =>
    bytesEqual(commitment, commit(opening, plaintext)),
  verifyNodeTag: ({ tag, transcript }) => bytesEqual(tag.tag, fakeDigest(transcript)),
};

const deps = {
  verifier,
  acceptedProfiles: [TEST_PROFILE],
  knownKeyEras: [TEST_ERA],
  digest: fakeDigest,
};

function tag(overrides: Partial<E2eeFrankingTagView> = {}): E2eeFrankingTagView {
  const transcript = seededBytes(64, 5);
  return {
    profile: TEST_PROFILE,
    keyEra: TEST_ERA,
    tag: fakeDigest(transcript),
    transcriptDigest: fakeDigest(transcript),
    ...overrides,
  };
}

function item(
  position: number,
  plaintextText = 'the reported message',
  overrides: Partial<E2eeReportEvidenceItemView> = {},
): E2eeReportEvidenceItemView {
  const plaintext = new TextEncoder().encode(plaintextText);
  const opening = seededBytes(32, 100 + position);
  return {
    position,
    logicalMessageId: `msg-${String(position)}`,
    disclosedPlaintext: plaintext,
    opening,
    commitment: commit(opening, plaintext),
    envelopeTranscript: seededBytes(64, 5),
    frankingTag: tag(),
    participantTranscript: seededBytes(96, 6),
    rosterDigest: seededBytes(E2EE_DIGEST_BYTES, 7),
    ...overrides,
  };
}

describe('the franking ship gate', () => {
  it('approves no profile yet, so E2EE cannot be enabled in production', () => {
    expect(E2EE_APPROVED_FRANKING_PROFILES).toEqual([]);
    expect(() => assertFrankingProfileApproved(E2EE_FRANKING_PROFILE_V1)).toThrow(
      'independent review',
    );
    expect(() => assertFrankingProfileApproved(TEST_PROFILE)).toThrow('independent review');
  });

  it('keeps the approved-profile list immutable at runtime', () => {
    expect(() => {
      (E2EE_APPROVED_FRANKING_PROFILES as string[]).push(TEST_PROFILE);
    }).toThrow();
    expect(E2EE_APPROVED_FRANKING_PROFILES).toEqual([]);
  });
});

describe('reporter consent', () => {
  it('requires an explicit yes', () => {
    expect(() => assertReporterConsent(true)).not.toThrow();
    expect(() => assertReporterConsent(false)).toThrow('never a default');
  });

  it('is checked before any evidence is examined', () => {
    expect(() =>
      verifyReportEvidence({ reporterConsented: false, items: [item(0)] }, deps),
    ).toThrow('never a default');
  });
});

describe('evidence shape', () => {
  it('accepts the reported message plus bounded context', () => {
    const items = Array.from({ length: E2EE_REPORT_MAX_EVIDENCE_ITEMS }, (_, i) => item(i));
    expect(() => assertReportEvidenceShape(items)).not.toThrow();
  });

  it('refuses to become an unbounded plaintext-extraction channel', () => {
    const tooMany = Array.from({ length: E2EE_REPORT_MAX_EVIDENCE_ITEMS + 1 }, (_, i) =>
      item(i, `m${String(i)}`, { position: i }),
    );
    expect(() => assertReportEvidenceShape(tooMany)).toThrow('limited to 11 messages');
    expect(() => assertReportEvidenceShape([item(11)])).toThrow('outside the disclosed window');
  });

  it('requires the reported message itself, exactly once', () => {
    expect(() => assertReportEvidenceShape([item(1)])).toThrow('must include position 0');
    expect(() => assertReportEvidenceShape([item(0), item(0, 'again')])).toThrow(
      'two items at position 0',
    );
    expect(() => assertReportEvidenceShape([])).toThrow('at least the reported message');
  });

  it('rejects malformed items', () => {
    expect(() => assertReportEvidenceShape([item(0, 'x', { logicalMessageId: '' })])).toThrow(
      'no logical message id',
    );
    expect(() =>
      assertReportEvidenceShape([item(0, 'x', { rosterDigest: seededBytes(31, 1) })]),
    ).toThrow('roster digest has the wrong length');
    expect(() => assertReportEvidenceShape([item(0, 'x', { opening: new Uint8Array(0) })])).toThrow(
      'missing its franking commitment or opening',
    );
    expect(() => assertReportEvidenceShape([item(0, 'x', { position: 1.5 })])).toThrow(
      'non-negative integers',
    );
  });
});

describe('evidence verification', () => {
  it('verifies a well-formed disclosure', () => {
    const result = verifyReportEvidence(
      { reporterConsented: true, items: [item(0), item(1, 'context')] },
      deps,
    );
    expect(result).toEqual({ status: 'VERIFIED', verifiedItemCount: 2, partialContext: true });
  });

  it('always reports the disclosure as partial context, even when everything verifies', () => {
    const result = verifyReportEvidence({ reporterConsented: true, items: [item(0)] }, deps);
    expect(result.partialContext).toBe(true);
    expect(E2EE_FRANKING_MODERATOR_DISCLOSURE).toContain('not proof to anyone outside this node');
    expect(E2EE_FRANKING_MODERATOR_DISCLOSURE).toContain('only the messages the reporter chose');
  });

  it('marks a substituted plaintext unverifiable rather than accepting it', () => {
    const forged = item(0, 'the reported message', {
      disclosedPlaintext: new TextEncoder().encode('something they never said'),
    });
    const result = verifyReportEvidence({ reporterConsented: true, items: [forged] }, deps);
    expect(result.status).toBe('UNVERIFIABLE');
    expect(result.failureCode).toBe('COMMITMENT_MISMATCH');
  });

  it('marks a transcript that does not match its declared digest unverifiable, before spending a MAC check on it', () => {
    const mismatched = item(0, 'x', {
      frankingTag: tag({ transcriptDigest: seededBytes(32, 249) }),
    });
    const result = verifyReportEvidence({ reporterConsented: true, items: [mismatched] }, deps);
    expect(result.status).toBe('UNVERIFIABLE');
    expect(result.failureCode).toBe('TRANSCRIPT_MISMATCH');
  });

  it('marks a forged node tag unverifiable', () => {
    const forged = item(0, 'x', { frankingTag: tag({ tag: seededBytes(32, 250) }) });
    const result = verifyReportEvidence({ reporterConsented: true, items: [forged] }, deps);
    expect(result.failureCode).toBe('NODE_TAG_MISMATCH');
  });

  it('keeps evidence from an unknown profile or retired key era, marked unverifiable', () => {
    const unknownProfile = item(0, 'x', { frankingTag: tag({ profile: 'other-profile' }) });
    expect(
      verifyReportEvidence({ reporterConsented: true, items: [unknownProfile] }, deps),
    ).toEqual({
      status: 'UNVERIFIABLE',
      verifiedItemCount: 0,
      failureCode: 'UNKNOWN_FRANKING_PROFILE',
      partialContext: true,
    });

    const unknownEra = item(0, 'x', { frankingTag: tag({ keyEra: 99 }) });
    expect(
      verifyReportEvidence({ reporterConsented: true, items: [unknownEra] }, deps).failureCode,
    ).toBe('UNKNOWN_KEY_ERA');
  });

  it('does not throw on a cryptographic failure — a failed check is not a finding of innocence', () => {
    const forged = item(0, 'x', { commitment: seededBytes(32, 251) });
    expect(() =>
      verifyReportEvidence({ reporterConsented: true, items: [forged] }, deps),
    ).not.toThrow();
  });

  it('counts the items that did verify alongside the first failure', () => {
    const result = verifyReportEvidence(
      {
        reporterConsented: true,
        items: [item(0), item(1, 'context', { commitment: seededBytes(32, 252) }), item(2, 'more')],
      },
      deps,
    );
    expect(result.status).toBe('UNVERIFIABLE');
    expect(result.verifiedItemCount).toBe(2);
    expect(result.failureCode).toBe('COMMITMENT_MISMATCH');
  });

  it('property: no failure code and no thrown message ever carries disclosed plaintext', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 40 }),
        fc.boolean(),
        fc.boolean(),
        (secret, breakCommitment, consented) => {
          // A distinctive plaintext: if any diagnostic echoed it, this would catch it.
          const marked = `SECRET-${secret}-SECRET`;
          const base = item(0, marked);
          const evidence = breakCommitment ? { ...base, commitment: seededBytes(32, 253) } : base;
          let text: string;
          try {
            const result = verifyReportEvidence(
              { reporterConsented: consented, items: [evidence] },
              deps,
            );
            text = JSON.stringify({ ...result, failureCode: result.failureCode ?? null });
          } catch (error) {
            text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          }
          expect(text).not.toContain('SECRET');
          expect(text).not.toContain(secret);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: only the committed plaintext opens a commitment', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.string({ minLength: 1, maxLength: 40 }),
        (a, b) => {
          fc.pre(a !== b);
          const honest = item(0, a);
          expect(
            verifyReportEvidence({ reporterConsented: true, items: [honest] }, deps).status,
          ).toBe('VERIFIED');
          const swapped = { ...honest, disclosedPlaintext: new TextEncoder().encode(b) };
          expect(
            verifyReportEvidence({ reporterConsented: true, items: [swapped] }, deps).status,
          ).toBe('UNVERIFIABLE');
        },
      ),
      { numRuns: 200 },
    );
  });
});
