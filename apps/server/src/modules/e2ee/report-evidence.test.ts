import {
  commitFranking,
  createFrankingOpeningKey,
  createNodeReportTag,
  sha256Hash,
  type FrankingReportTranscript,
} from '@patches/crypto';
import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import {
  E2eeLogicalMessage,
  E2eeMailboxEnvelope,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
  Report,
} from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import {
  attachReportEvidence,
  EnvNodeFrankingKeyRing,
  type NodeFrankingKeyRing,
} from './report-evidence.js';

const encoder = new TextEncoder();
const NODE_KEY_ERA_1 = sha256Hash(encoder.encode('node-key-era-1'));

/** A `NodeFrankingKeyRing` fake that knows exactly one key, for era 1. */
function fakeKeyRing(): NodeFrankingKeyRing {
  return {
    keyForEra: (era) => (era === 1 ? NODE_KEY_ERA_1 : undefined),
    knownEras: () => [1],
    currentEra: () => 1,
  };
}

function digest(label: string): Uint8Array {
  return sha256Hash(encoder.encode(label));
}

interface Row {
  [key: string]: unknown;
}

/** Bare in-memory `EntityManager` fake: one findOne/find table per entity class, plus a `save`
 * spy per class so tests can assert exactly what was persisted. */
function fakeManager(tables: {
  report: Row | null;
  existingEvidence: Row | null;
  logicalMessages: Map<string, Row>;
  envelopesByMessage: Map<string, Row[]>;
}) {
  const evidenceSaves: Row[] = [];
  const itemSaves: Row[] = [];

  const repos = new Map<unknown, unknown>([
    [
      Report,
      {
        findOne: vi.fn().mockResolvedValue(tables.report),
      },
    ],
    [
      E2eeReportEvidence,
      {
        findOne: vi.fn().mockResolvedValue(tables.existingEvidence),
        save: vi.fn((row: Row) => {
          evidenceSaves.push(row);
          return Promise.resolve(row);
        }),
      },
    ],
    [
      E2eeReportEvidenceItem,
      {
        save: vi.fn((row: Row) => {
          itemSaves.push(row);
          return Promise.resolve(row);
        }),
      },
    ],
    [
      E2eeLogicalMessage,
      {
        findOne: vi.fn(({ where }: { where: { id: string; conversationId: string } }) => {
          const row = tables.logicalMessages.get(where.id);
          if (row === undefined || row.conversationId !== where.conversationId) return null;
          return Promise.resolve(row);
        }),
      },
    ],
    [
      E2eeMailboxEnvelope,
      {
        find: vi.fn(({ where }: { where: { logicalMessageId: string } }) =>
          Promise.resolve(tables.envelopesByMessage.get(where.logicalMessageId) ?? []),
        ),
      },
    ],
  ]);

  const manager = {
    getRepository: vi.fn((entity: unknown) => {
      const repo = repos.get(entity);
      if (repo === undefined)
        throw new Error(`No fake repository registered for ${String(entity)}`);
      return repo;
    }),
  } as unknown as EntityManager;

  return { manager, evidenceSaves, itemSaves };
}

/** Builds a logical-message row and matching mailbox envelopes whose stored `frankingTag` is a
 * genuine node tag over the exact transcript `attachReportEvidence` will reconstruct — i.e. what
 * a real accepted send would have left behind. */
function acceptedMessage(input: {
  id: string;
  conversationId: string;
  commitment: Uint8Array;
  senderActorId?: string;
  senderDeviceId?: string;
  acceptedAt?: Date;
}) {
  const acceptedAt = input.acceptedAt ?? new Date('2026-08-01T00:00:00.000Z');
  const ciphertextDigests = [digest(`${input.id}-device-1`), digest(`${input.id}-device-2`)];
  const fanoutDigest = digest(`${input.id}-fanout`);
  const transcript: FrankingReportTranscript = {
    frankingKeyEra: 1,
    conversationId: input.conversationId,
    membershipEpoch: 1,
    logicalMessageId: input.id,
    senderActorId: input.senderActorId ?? 'alice',
    senderDeviceId: input.senderDeviceId ?? 'alice-device',
    recipientFanoutDigest: fanoutDigest,
    acceptedAtMs: acceptedAt.getTime(),
    commitment: input.commitment,
    ciphertextDigests,
  };
  const frankingTag = createNodeReportTag(NODE_KEY_ERA_1, transcript);

  const messageRow: Row = {
    id: input.id,
    conversationId: input.conversationId,
    epoch: '1',
    senderActorId: transcript.senderActorId,
    senderDeviceId: transcript.senderDeviceId,
    fanoutDigest: Buffer.from(fanoutDigest),
    frankingCommitment: Buffer.from(input.commitment),
    frankingProfile: E2EE_FRANKING_PROFILE_V1,
    frankingKeyEra: 1,
    frankingTag: Buffer.from(frankingTag),
    acceptedAt,
  };
  const envelopeRows: Row[] = ciphertextDigests.map((d) => ({ ciphertextDigest: Buffer.from(d) }));
  return { messageRow, envelopeRows };
}

function reportEvidenceItem(overrides: Partial<Row> = {}): Row {
  return {
    position: 0,
    logicalMessageId: 'msg-1',
    disclosedPlaintext: Buffer.alloc(0),
    opening: Buffer.alloc(0),
    envelopeTranscript: Buffer.alloc(0),
    frankingTag: Buffer.alloc(0),
    participantTranscript: Buffer.from('sender+recipient certs'),
    rosterDigest: Buffer.from(digest('roster')),
    ...overrides,
  };
}

const REPORT_ROW: Row = { id: 'report-1', reporterActorId: 'reporter-actor' };

describe('attachReportEvidence (ADR 0020 §9, P13-009)', () => {
  it('verifies genuine, unmodified evidence end to end', async () => {
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('the actual message body');
    const commitment = commitFranking(opening, plaintext);
    const { messageRow, envelopeRows } = acceptedMessage({
      id: 'msg-1',
      conversationId: 'conv-1',
      commitment,
    });
    const { manager, evidenceSaves, itemSaves } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map([['msg-1', messageRow]]),
      envelopesByMessage: new Map([['msg-1', envelopeRows]]),
    });

    const response = await attachReportEvidence(
      manager,
      'reporter-actor',
      {
        reportId: 'report-1',
        conversationId: 'conv-1',
        reporterConsented: true,
        items: [
          reportEvidenceItem({
            disclosedPlaintext: Buffer.from(plaintext),
            opening: Buffer.from(opening),
          }),
        ],
      } as never,
      fakeKeyRing(),
    );

    expect(response.status).toBe('E2EE_EVIDENCE_VERIFICATION_STATUS_VERIFIED');
    expect(response.verifiedItemCount).toBe(1);
    expect(response.verificationFailureCode).toBe('');
    expect(evidenceSaves).toHaveLength(1);
    expect(evidenceSaves[0]).toMatchObject({ verificationStatus: 'VERIFIED' });
    expect(itemSaves).toHaveLength(1);
    // The stored plaintext is exactly what the reporter disclosed — nothing else, nothing less.
    expect((itemSaves[0]?.disclosedPlaintext as Buffer).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('rejects forged evidence: a plaintext that does not open the accepted commitment', async () => {
    const opening = createFrankingOpeningKey();
    const realPlaintext = encoder.encode('what alice actually sent');
    const commitment = commitFranking(opening, realPlaintext);
    const { messageRow, envelopeRows } = acceptedMessage({
      id: 'msg-1',
      conversationId: 'conv-1',
      commitment,
    });
    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map([['msg-1', messageRow]]),
      envelopesByMessage: new Map([['msg-1', envelopeRows]]),
    });

    const response = await attachReportEvidence(
      manager,
      'reporter-actor',
      {
        reportId: 'report-1',
        conversationId: 'conv-1',
        reporterConsented: true,
        items: [
          reportEvidenceItem({
            // A fabricated, more damning message the reporter never actually received.
            disclosedPlaintext: Buffer.from(encoder.encode('something alice never said')),
            opening: Buffer.from(opening),
          }),
        ],
      } as never,
      fakeKeyRing(),
    );

    expect(response.status).toBe('E2EE_EVIDENCE_VERIFICATION_STATUS_UNVERIFIABLE');
    expect(response.verificationFailureCode).toBe('COMMITMENT_MISMATCH');
    expect(response.verifiedItemCount).toBe(0);
  });

  it('rejects truncated evidence: a node tag shortened by the disclosing client', async () => {
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('reported content');
    const commitment = commitFranking(opening, plaintext);
    const { messageRow, envelopeRows } = acceptedMessage({
      id: 'msg-1',
      conversationId: 'conv-1',
      commitment,
    });
    // Corrupt the node's own stored tag as if it had been truncated on the way in — the node
    // must not treat a shortened tag as a smaller-but-valid one.
    messageRow.frankingTag = (messageRow.frankingTag as Buffer).subarray(0, 8);
    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map([['msg-1', messageRow]]),
      envelopesByMessage: new Map([['msg-1', envelopeRows]]),
    });

    const response = await attachReportEvidence(
      manager,
      'reporter-actor',
      {
        reportId: 'report-1',
        conversationId: 'conv-1',
        reporterConsented: true,
        items: [
          reportEvidenceItem({
            disclosedPlaintext: Buffer.from(plaintext),
            opening: Buffer.from(opening),
          }),
        ],
      } as never,
      fakeKeyRing(),
    );

    expect(response.status).toBe('E2EE_EVIDENCE_VERIFICATION_STATUS_UNVERIFIABLE');
    expect(response.verificationFailureCode).toBe('NODE_TAG_MISMATCH');
  });

  it('rejects a replayed tag: evidence for one logical message presented under another', async () => {
    const openingA = createFrankingOpeningKey();
    const plaintextA = encoder.encode('message A');
    const commitmentA = commitFranking(openingA, plaintextA);
    const a = acceptedMessage({ id: 'msg-a', conversationId: 'conv-1', commitment: commitmentA });

    const openingB = createFrankingOpeningKey();
    const plaintextB = encoder.encode('message B');
    const commitmentB = commitFranking(openingB, plaintextB);
    const b = acceptedMessage({ id: 'msg-b', conversationId: 'conv-1', commitment: commitmentB });

    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map([
        ['msg-a', a.messageRow],
        ['msg-b', b.messageRow],
      ]),
      envelopesByMessage: new Map([
        ['msg-a', a.envelopeRows],
        ['msg-b', b.envelopeRows],
      ]),
    });

    // Reporter claims message B's id but replays message A's disclosed plaintext/opening/tag —
    // the node re-derives everything from its own `msg-b` row, so A's material cannot pass.
    const response = await attachReportEvidence(
      manager,
      'reporter-actor',
      {
        reportId: 'report-1',
        conversationId: 'conv-1',
        reporterConsented: true,
        items: [
          reportEvidenceItem({
            logicalMessageId: 'msg-b',
            disclosedPlaintext: Buffer.from(plaintextA),
            opening: Buffer.from(openingA),
          }),
        ],
      } as never,
      fakeKeyRing(),
    );

    expect(response.status).toBe('E2EE_EVIDENCE_VERIFICATION_STATUS_UNVERIFIABLE');
    expect(response.verificationFailureCode).toBe('COMMITMENT_MISMATCH');
  });

  it('rejects evidence for a logical message id this node never accepted, without discarding it', async () => {
    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map(),
      envelopesByMessage: new Map(),
    });

    const response = await attachReportEvidence(
      manager,
      'reporter-actor',
      {
        reportId: 'report-1',
        conversationId: 'conv-1',
        reporterConsented: true,
        items: [
          reportEvidenceItem({
            logicalMessageId: 'never-existed',
            disclosedPlaintext: Buffer.from(encoder.encode('claimed content')),
            opening: Buffer.from(createFrankingOpeningKey()),
          }),
        ],
      } as never,
      fakeKeyRing(),
    );

    expect(response.status).toBe('E2EE_EVIDENCE_VERIFICATION_STATUS_UNVERIFIABLE');
    expect(response.verificationFailureCode).toBe('UNKNOWN_KEY_ERA');
  });

  it('detects post-acceptance tampering with mailbox envelope digests', async () => {
    const opening = createFrankingOpeningKey();
    const plaintext = encoder.encode('reported content');
    const commitment = commitFranking(opening, plaintext);
    const { messageRow, envelopeRows } = acceptedMessage({
      id: 'msg-1',
      conversationId: 'conv-1',
      commitment,
    });
    // Simulate a dropped/substituted envelope after the node already issued its tag: the
    // reconstructed transcript no longer matches what the tag actually covers.
    envelopeRows.pop();
    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map([['msg-1', messageRow]]),
      envelopesByMessage: new Map([['msg-1', envelopeRows]]),
    });

    const response = await attachReportEvidence(
      manager,
      'reporter-actor',
      {
        reportId: 'report-1',
        conversationId: 'conv-1',
        reporterConsented: true,
        items: [
          reportEvidenceItem({
            disclosedPlaintext: Buffer.from(plaintext),
            opening: Buffer.from(opening),
          }),
        ],
      } as never,
      fakeKeyRing(),
    );

    expect(response.status).toBe('E2EE_EVIDENCE_VERIFICATION_STATUS_UNVERIFIABLE');
    expect(response.verificationFailureCode).toBe('NODE_TAG_MISMATCH');
  });

  it('requires explicit reporter consent before reading anything', async () => {
    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: null,
      logicalMessages: new Map(),
      envelopesByMessage: new Map(),
    });

    await expect(
      attachReportEvidence(
        manager,
        'reporter-actor',
        {
          reportId: 'report-1',
          conversationId: 'conv-1',
          reporterConsented: false,
          items: [reportEvidenceItem()],
        } as never,
        fakeKeyRing(),
      ),
    ).rejects.toThrow('never a default');
  });

  it('refuses to attach evidence to another actor’s report (no existence oracle)', async () => {
    const { manager } = fakeManager({
      report: { id: 'report-1', reporterActorId: 'someone-else' },
      existingEvidence: null,
      logicalMessages: new Map(),
      envelopesByMessage: new Map(),
    });

    await expect(
      attachReportEvidence(
        manager,
        'reporter-actor',
        {
          reportId: 'report-1',
          conversationId: 'conv-1',
          reporterConsented: true,
          items: [reportEvidenceItem()],
        } as never,
        fakeKeyRing(),
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a second evidence submission for the same report', async () => {
    const { manager } = fakeManager({
      report: REPORT_ROW,
      existingEvidence: { reportId: 'report-1', verificationStatus: 'VERIFIED' },
      logicalMessages: new Map(),
      envelopesByMessage: new Map(),
    });

    await expect(
      attachReportEvidence(
        manager,
        'reporter-actor',
        {
          reportId: 'report-1',
          conversationId: 'conv-1',
          reporterConsented: true,
          items: [reportEvidenceItem()],
        } as never,
        fakeKeyRing(),
      ),
    ).rejects.toThrow('already been attached');
  });
});

describe('EnvNodeFrankingKeyRing', () => {
  it('is empty — and therefore fails every era closed — when unset', () => {
    const ring = new EnvNodeFrankingKeyRing({});
    expect(ring.knownEras()).toEqual([]);
    expect(ring.keyForEra(1)).toBeUndefined();
  });

  it('parses a well-formed era → base64 key map', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const ring = new EnvNodeFrankingKeyRing({
      E2EE_NODE_FRANKING_KEYS: JSON.stringify({ '1': key }),
    });
    expect(ring.knownEras()).toEqual([1]);
    expect(ring.keyForEra(1)).toEqual(new Uint8Array(32).fill(7));
  });

  it('refuses to start with a key of the wrong length rather than silently truncating it', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    expect(
      () =>
        new EnvNodeFrankingKeyRing({ E2EE_NODE_FRANKING_KEYS: JSON.stringify({ '1': shortKey }) }),
    ).toThrow('32-byte key');
  });

  it('refuses malformed JSON rather than starting with no keys silently', () => {
    expect(() => new EnvNodeFrankingKeyRing({ E2EE_NODE_FRANKING_KEYS: 'not json' })).toThrow(
      'not valid JSON',
    );
  });
});
