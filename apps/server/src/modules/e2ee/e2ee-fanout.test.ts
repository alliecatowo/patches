import {
  E2eeMailboxEnvelope as E2eeMailboxEnvelopeEntity,
  type E2eeLogicalMessage as E2eeLogicalMessageEntity,
} from '@patches/database';
import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { describe, expect, it, vi } from 'vitest';
import { type EntityManager } from 'typeorm';

import {
  acceptE2eeLogicalMessage,
  transcriptDigestForStoredMessage,
  transcriptDigestsForStoredMessages,
} from './e2ee-fanout.js';
import { E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';

describe('acceptE2eeLogicalMessage franking review gate', () => {
  it('rejects every create/send/replay accept before database access while no profile is approved', async () => {
    const getRepository = vi.fn();
    const manager = { getRepository } as unknown as EntityManager;

    const result = acceptE2eeLogicalMessage(manager, {
      conversationId: 'conversation-id',
      senderActorId: 'actor-id',
      senderDeviceId: 'device-id',
      clientRequestId: 'request-id',
      message: {
        membershipEpoch: '1',
        frankingProfile: E2EE_FRANKING_PROFILE_V1,
        frankingCommitment: Buffer.alloc(32),
        fanoutDigest: Buffer.alloc(32),
        deviceEnvelopes: [],
      },
      keys: {
        currentEra: () => 1,
        keyForEra: () => Buffer.alloc(32),
        knownEras: () => [1],
      },
      approvalPolicy: new E2eeRuntimeApprovalPolicy(false),
    });

    await expect(result).rejects.toMatchObject({
      code: 'E2EE_FANOUT_REJECTED',
    });
    await expect(result).rejects.toThrow('independent review');
    expect(getRepository).not.toHaveBeenCalled();
  });
});

function fakeEnvelope(fields: {
  id: string;
  logicalMessageId: string;
  ciphertextDigest: Buffer;
  recipientDeviceId: string;
}): E2eeMailboxEnvelopeEntity {
  return {
    id: fields.id,
    logicalMessageId: fields.logicalMessageId,
    ciphertextDigest: fields.ciphertextDigest,
    recipientDeviceIdentity: { deviceId: fields.recipientDeviceId },
  } as unknown as E2eeMailboxEnvelopeEntity;
}

function fakeMessage(fields: { id: string; conversationId: string }): E2eeLogicalMessageEntity {
  return {
    id: fields.id,
    conversationId: fields.conversationId,
    epoch: '1',
    senderActorId: 'sender-actor',
    senderDeviceId: 'sender-device',
    fanoutDigest: Buffer.alloc(32, 1),
    frankingCommitment: Buffer.alloc(32, 2),
    frankingProfile: E2EE_FRANKING_PROFILE_V1,
    frankingKeyEra: 1,
    acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as unknown as E2eeLogicalMessageEntity;
}

/** A `manager.getRepository(E2eeMailboxEnvelopeEntity).createQueryBuilder(...)` stand-in whose
 * `getMany()` resolves to exactly `rows` — enough of the chain both
 * `transcriptDigestsForStoredMessages` and its single-message wrapper actually call. */
function managerReturning(rows: readonly E2eeMailboxEnvelopeEntity[]): EntityManager {
  const queryBuilder = {
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(rows),
  };
  return {
    getRepository: (entity: unknown) => {
      if (entity !== E2eeMailboxEnvelopeEntity) {
        throw new Error(`unexpected getRepository(${String(entity)}) in this test`);
      }
      return { createQueryBuilder: () => queryBuilder };
    },
  } as unknown as EntityManager;
}

describe('transcriptDigestsForStoredMessages (P19-019 part 2 — the ListMailboxEnvelopes N+1)', () => {
  it('computes the same per-message digest batched across conversations as a standalone single-message query would', async () => {
    const messageA = fakeMessage({ id: 'message-a', conversationId: 'conversation-a' });
    const messageB = fakeMessage({ id: 'message-b', conversationId: 'conversation-b' });

    const envelopeA1 = fakeEnvelope({
      id: 'env-a1',
      logicalMessageId: 'message-a',
      ciphertextDigest: Buffer.alloc(32, 0xa1),
      recipientDeviceId: 'device-a1',
    });
    const envelopeA2 = fakeEnvelope({
      id: 'env-a2',
      logicalMessageId: 'message-a',
      ciphertextDigest: Buffer.alloc(32, 0xa2),
      recipientDeviceId: 'device-a2',
    });
    const envelopeB1 = fakeEnvelope({
      id: 'env-b1',
      logicalMessageId: 'message-b',
      ciphertextDigest: Buffer.alloc(32, 0xb1),
      recipientDeviceId: 'device-b1',
    });

    // The batched call sees both conversations' envelopes in one interleaved result set — the
    // shape a real mixed-conversation `ListMailboxEnvelopes` page produces once part (1)'s
    // client-side filter is gone.
    const batched = await transcriptDigestsForStoredMessages(
      managerReturning([envelopeA1, envelopeB1, envelopeA2]),
      [messageA, messageB],
    );

    // The single-message call sees only that message's own envelopes, in the same relative
    // order they appeared within the batch above — a standalone query for that one message
    // alone, the shape the old per-envelope N+1 loop ran.
    const isolatedA = await transcriptDigestForStoredMessage(
      managerReturning([envelopeA1, envelopeA2]),
      messageA,
    );
    const isolatedB = await transcriptDigestForStoredMessage(
      managerReturning([envelopeB1]),
      messageB,
    );

    expect(batched.get('message-a')?.digest).toEqual(isolatedA.digest);
    expect(batched.get('message-b')?.digest).toEqual(isolatedB.digest);
    // Sanity: a grouping bug that pooled every envelope on the page into one bucket regardless
    // of message id would still pass the two equality checks above (both sides would be equally
    // wrong) but fail this — the two conversations' messages must not land on the same digest.
    expect(batched.get('message-a')?.digest).not.toEqual(batched.get('message-b')?.digest);

    expect(batched.get('message-a')?.recipientDeviceIds).toEqual(['device-a1', 'device-a2']);
    expect(batched.get('message-b')?.recipientDeviceIds).toEqual(['device-b1']);
  });
});
