import {
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeMailboxEnvelope as E2eeMailboxEnvelopeEntity,
} from '@patches/database';
import { e2eeEnvelopeListAgeSeconds, metricsRegistry } from '@patches/observability/metrics';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { E2eeConversationService } from './e2ee-conversation.service.js';
import type * as E2eeFanoutModule from './e2ee-fanout.js';
import type { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import type { NotificationsService } from '../notifications/notification.service.js';
import type { NodeFrankingKeyRing } from './report-evidence.js';

// `listMailboxEnvelopes` recomputes the franking transcript digest per distinct logical message
// on the page rather than persisting it (see `transcriptDigestsForStoredMessages`'s own doc
// comment) — irrelevant to this metrics test, so it's stubbed rather than driving the real
// digest computation through a mocked EntityManager.
vi.mock('./e2ee-fanout.js', async (importOriginal) => {
  const actual = await importOriginal<typeof E2eeFanoutModule>();
  return {
    ...actual,
    transcriptDigestsForStoredMessages: vi.fn((_manager: unknown, messages: { id: string }[]) =>
      Promise.resolve(
        new Map(messages.map((message) => [message.id, { digest: new Uint8Array(0) }])),
      ),
    ),
  };
});

const ACTOR_ID = '00000000-0000-4000-8000-00000000000a';
const DEVICE_ID = 'device-1';

function fakeEnvelopeRow(receivedAt: Date): Record<string, unknown> {
  return {
    id: 'envelope-1',
    logicalMessageId: 'message-1',
    receivedAt,
    encryptedHeader: Buffer.alloc(0),
    ciphertext: Buffer.alloc(0),
    openingCiphertext: Buffer.alloc(0),
    ciphertextDigest: Buffer.alloc(0),
    logicalMessage: {
      id: 'message-1',
      conversationId: 'conversation-1',
      epoch: 1,
      senderActorId: 'sender-1',
      senderDeviceId: 'sender-device-1',
      frankingCommitment: Buffer.alloc(0),
      frankingProfile: 'p1',
      frankingKeyEra: 1,
      frankingTag: Buffer.alloc(0),
      fanoutDigest: Buffer.alloc(0),
      acceptedAt: receivedAt,
    },
  };
}

function dataSourceReturning(row: Record<string, unknown>): DataSource {
  const queryBuilder = {
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([row]),
  };
  return {
    getRepository(entity: unknown) {
      if (entity === E2eeDeviceIdentityEntity) {
        return { findOne: vi.fn().mockResolvedValue({ id: 'device-row-1' }) };
      }
      if (entity === E2eeMailboxEnvelopeEntity) {
        return { createQueryBuilder: () => queryBuilder };
      }
      throw new Error(`unexpected getRepository(${String(entity)}) in this test`);
    },
    manager: {} as EntityManager,
  } as unknown as DataSource;
}

function serviceWith(dataSource: DataSource): E2eeConversationService {
  return new E2eeConversationService(
    dataSource,
    {} as unknown as NodeFrankingKeyRing,
    { consumeMailboxPoll: vi.fn(() => Promise.resolve()) } as unknown as E2eeRateLimitService,
    { notifyMessage: vi.fn(() => Promise.resolve()) } as unknown as NotificationsService,
  );
}

describe('listMailboxEnvelopes freshness instrument (ADR 0032 T1, P19-020)', () => {
  beforeEach(() => {
    // Reset the shared prom-client registry between tests so each example starts from a known
    // sample count.
    metricsRegistry.resetMetrics();
  });

  it('observes envelope age (list time minus received_at) on every returned envelope', async () => {
    const receivedAt = new Date(Date.now() - 12_000);
    const dataSource = dataSourceReturning(fakeEnvelopeRow(receivedAt));
    const service = serviceWith(dataSource);

    await service.listMailboxEnvelopes(ACTOR_ID, {
      deviceId: DEVICE_ID,
      cursor: '',
      limit: 10,
      conversationId: '',
    });

    const observed = await e2eeEnvelopeListAgeSeconds.get();
    const sumSample = observed.values.find((value) => value.metricName?.endsWith('_sum'));
    expect(sumSample).toBeDefined();
    // Allow generous wall-clock slack: the observation happens a few ms after receivedAt was
    // fixed above, never before.
    expect(sumSample?.value).toBeGreaterThanOrEqual(12);
    expect(sumSample?.value).toBeLessThan(20);
  });

  it('never carries an envelope, message, conversation, actor, or device id as a label', async () => {
    const dataSource = dataSourceReturning(fakeEnvelopeRow(new Date()));
    const service = serviceWith(dataSource);

    await service.listMailboxEnvelopes(ACTOR_ID, {
      deviceId: DEVICE_ID,
      cursor: '',
      limit: 10,
      conversationId: '',
    });

    // The histogram is constructed with no `labelNames` at all — the strongest available
    // guarantee: the only label prom-client itself ever attaches is its own bucket boundary
    // (`le`, e.g. "5"), never one this code supplies, so there is no label a caller could ever
    // populate with an identifier, even by mistake, since `.observe()` only accepts a bare
    // number.
    const observed = await e2eeEnvelopeListAgeSeconds.get();
    expect(observed.values.length).toBeGreaterThan(0);
    for (const sample of observed.values) {
      expect(Object.keys(sample.labels).filter((key) => key !== 'le')).toEqual([]);
    }
  });
});

/**
 * A queryBuilder fake that actually honors the `message.conversationId = :conversationId`
 * predicate the service adds (issue #152), so `getMany()` returns a genuinely smaller row set
 * for a scoped poll instead of a fixed fixture — the point of these tests is to measure the
 * response shrink, not just assert a mock was called with the right string.
 */
function dataSourceWithConversations(rows: Record<string, unknown>[]): DataSource {
  const andWhereCalls: { condition: string; params?: Record<string, unknown> }[] = [];
  const queryBuilder = {
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn((condition: string, params?: Record<string, unknown>) => {
      andWhereCalls.push({ condition, ...(params === undefined ? {} : { params }) });
      return queryBuilder;
    }),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getMany: vi.fn(() => {
      const filterCall = andWhereCalls.find((call) =>
        call.condition.includes('message.conversationId'),
      );
      if (filterCall === undefined) return Promise.resolve(rows);
      const conversationId = filterCall.params?.['conversationId'];
      return Promise.resolve(
        rows.filter((row) => {
          const message = row['logicalMessage'] as { conversationId: string };
          return message.conversationId === conversationId;
        }),
      );
    }),
  };
  return {
    getRepository(entity: unknown) {
      if (entity === E2eeDeviceIdentityEntity) {
        return { findOne: vi.fn().mockResolvedValue({ id: 'device-row-1' }) };
      }
      if (entity === E2eeMailboxEnvelopeEntity) {
        return { createQueryBuilder: () => queryBuilder };
      }
      throw new Error(`unexpected getRepository(${String(entity)}) in this test`);
    },
    manager: {} as EntityManager,
  } as unknown as DataSource;
}

function rowFor(id: string, conversationId: string): Record<string, unknown> {
  const row = fakeEnvelopeRow(new Date());
  return {
    ...row,
    id,
    logicalMessageId: `message-${id}`,
    logicalMessage: {
      ...(row['logicalMessage'] as Record<string, unknown>),
      id: `message-${id}`,
      conversationId,
    },
  };
}

describe('listMailboxEnvelopes conversation_id filter (issue #152)', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  it('narrows the query to one conversation, shrinking the response payload', async () => {
    const rows = [rowFor('a', 'conversation-1'), rowFor('b', 'conversation-2')];
    const dataSource = dataSourceWithConversations(rows);
    const service = serviceWith(dataSource);

    const unfiltered = await service.listMailboxEnvelopes(ACTOR_ID, {
      deviceId: DEVICE_ID,
      cursor: '',
      limit: 10,
      conversationId: '',
    });
    const filtered = await service.listMailboxEnvelopes(ACTOR_ID, {
      deviceId: DEVICE_ID,
      cursor: '',
      limit: 10,
      conversationId: 'conversation-1',
    });

    expect(unfiltered.envelopes).toHaveLength(2);
    expect(filtered.envelopes).toHaveLength(1);
    expect(filtered.envelopes[0]?.conversationId).toBe('conversation-1');

    // The literal payload-size assertion the poll-cost fix is meant to produce: a scoped poll
    // of an open thread returns strictly less mailbox data than an unscoped one over the same
    // underlying mailbox.
    const unfilteredBytes = JSON.stringify(unfiltered).length;
    const filteredBytes = JSON.stringify(filtered).length;
    expect(filteredBytes).toBeLessThan(unfilteredBytes);
  });

  it('adds no conversation predicate when conversation_id is unset (whole-mailbox behavior preserved)', async () => {
    const rows = [rowFor('a', 'conversation-1'), rowFor('b', 'conversation-2')];
    const dataSource = dataSourceWithConversations(rows);
    const service = serviceWith(dataSource);

    const response = await service.listMailboxEnvelopes(ACTOR_ID, {
      deviceId: DEVICE_ID,
      cursor: '',
      limit: 10,
      conversationId: '',
    });

    expect(response.envelopes).toHaveLength(2);
  });
});
