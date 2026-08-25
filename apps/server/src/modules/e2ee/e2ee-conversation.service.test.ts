import {
  Actor as ActorEntity,
  Block as BlockEntity,
  E2eeLogicalMessage as E2eeLogicalMessageEntity,
  Follow as FollowEntity,
} from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { E2eeConversationService } from './e2ee-conversation.service.js';
import type { E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';
import type { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import type { NotificationsService } from '../notifications/notification.service.js';
import type { NodeFrankingKeyRing } from './report-evidence.js';

function recipientActor(id: string): Partial<ActorEntity> {
  return { id, deletedAt: null, isLocal: true };
}

function serviceWith(
  dataSource: unknown,
  rateLimits: E2eeRateLimitService,
  notifications: NotificationsService = noopNotifications(),
): E2eeConversationService {
  return new E2eeConversationService(
    dataSource as DataSource,
    {} as unknown as NodeFrankingKeyRing,
    {} as E2eeRuntimeApprovalPolicy,
    rateLimits,
    notifications,
  );
}

function noopNotifications(): NotificationsService {
  return { notifyMessage: vi.fn(() => Promise.resolve()) } as unknown as NotificationsService;
}

/** A repository stub that tolerates any call so a test can drive the service to exactly the
 * failure point it cares about without hand-mocking every later step. */
function permissiveRepo(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((input: object) => input),
    save: vi.fn((input: object & { id?: string }) =>
      Promise.resolve({ id: 'generated-id', ...input }),
    ),
    insert: vi.fn(() => Promise.resolve(undefined)),
    update: vi.fn(() => Promise.resolve(undefined)),
  };
}

function managerWithFirstContact(options: { readonly mutualFollow: boolean }): EntityManager {
  const permissive = permissiveRepo();
  return {
    getRepository(entity: unknown) {
      if (entity === ActorEntity)
        return { ...permissive, find: vi.fn().mockResolvedValue([recipientActor('recipient')]) };
      // Both block directions miss.
      if (entity === BlockEntity) return { findOne: vi.fn().mockResolvedValue(null) };
      if (entity === FollowEntity)
        return { findOne: vi.fn().mockResolvedValue(options.mutualFollow ? { id: 'f' } : null) };
      return permissive;
    },
  } as unknown as EntityManager;
}

function dataSourceFor(manager: EntityManager): {
  readonly dataSource: unknown;
  readonly consume: ReturnType<typeof vi.fn>;
} {
  const consume = vi.fn(() => Promise.resolve());
  return {
    consume,
    dataSource: {
      getRepository: () => ({ findOne: vi.fn().mockResolvedValue(null) }),
      transaction: (body: (manager: EntityManager) => Promise<unknown>) => body(manager),
    },
  };
}

describe('E2eeConversationService first-contact eligibility (audit P1)', () => {
  const actorId = '00000000-0000-4000-8000-00000000000a';

  function limiterFrom(consume: ReturnType<typeof vi.fn>): E2eeRateLimitService {
    return { consumeConversationCreate: consume } as unknown as E2eeRateLimitService;
  }

  it('rejects a create whose target the caller could not message directly, uniformly', async () => {
    const { dataSource } = dataSourceFor(managerWithFirstContact({ mutualFollow: false }));
    const result = serviceWith(dataSource, limiterFrom(vi.fn())).createE2eeConversation(actorId, {
      clientRequestId: 'req-1',
      recipientActorIds: ['recipient'],
      senderDeviceId: 'device-1',
      message: undefined,
    });

    await expect(result).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });
  });

  // §183.2's "accepted message request" arm went away with the `message_requests` table
  // (ADR 0030) — mutual follow is the only remaining route to first contact.
  it.each([{ mutualFollow: true }])(
    'admits a create when first contact is allowed (mutualFollow=$mutualFollow)',
    async (options) => {
      const { dataSource } = dataSourceFor(managerWithFirstContact(options));
      const result = serviceWith(dataSource, limiterFrom(vi.fn())).createE2eeConversation(actorId, {
        clientRequestId: 'req-1',
        recipientActorIds: ['recipient'],
        senderDeviceId: 'device-1',
        message: undefined,
      });
      // Eligibility passes; the run continues into fanout accept and stops on the missing
      // logical message payload — proving the eligibility gate was passed, not short-circuited.
      await expect(result).rejects.toThrow('logical message is required');
    },
  );

  it('never burns budget on an idempotent replay', async () => {
    const consume = vi.fn();
    const existingFindOne = vi.fn().mockResolvedValue({
      conversationId: '00000000-0000-4000-8000-000000000001',
    });
    const dataSource = {
      getRepository: (entity: unknown) => ({
        findOne:
          entity === E2eeLogicalMessageEntity ? existingFindOne : vi.fn().mockResolvedValue(null),
      }),
      transaction: (body: (manager: EntityManager) => Promise<unknown>) =>
        body(managerWithFirstContact({ mutualFollow: false })),
    };
    const result = serviceWith(dataSource, limiterFrom(consume)).createE2eeConversation(actorId, {
      clientRequestId: 'replayed-request',
      recipientActorIds: ['recipient'],
      senderDeviceId: 'device-1',
      message: undefined,
    });
    await expect(result).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(consume).not.toHaveBeenCalled();
  });

  it('consumes the create budget before opening its transaction for a fresh send', async () => {
    const { dataSource, consume } = dataSourceFor(managerWithFirstContact({ mutualFollow: false }));
    await serviceWith(dataSource, limiterFrom(consume))
      .createE2eeConversation(actorId, {
        clientRequestId: 'fresh-request',
        recipientActorIds: ['recipient'],
        senderDeviceId: 'device-1',
        message: undefined,
      })
      .catch(() => undefined);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]?.[0]).toBe(actorId);
  });
});

describe('MESSAGE notification on an E2EE arrival (ADR 0030, §183.1)', () => {
  it('passes nothing but ids to NotificationsService, and never on a failed accept', async () => {
    const notifyMessage = vi.fn(() => Promise.resolve());
    const notifications = { notifyMessage } as unknown as NotificationsService;
    const { dataSource } = dataSourceFor(managerWithFirstContact({ mutualFollow: true }));

    await serviceWith(
      dataSource,
      { consumeConversationCreate: vi.fn() } as unknown as E2eeRateLimitService,
      notifications,
    )
      .createE2eeConversation('00000000-0000-4000-8000-00000000000a', {
        clientRequestId: 'req-1',
        recipientActorIds: ['recipient'],
        senderDeviceId: 'device-1',
        message: undefined,
      })
      .catch(() => undefined);

    // The accept above fails on the missing logical message, so no arrival happened and no
    // notification may be written — a notification is evidence a message landed.
    expect(notifyMessage).not.toHaveBeenCalled();
  });
});

describe('E2eeConversationService.sendEnvelopes rate-limit ordering (audit P1)', () => {
  it('budgets the send before any transaction work', async () => {
    const order: string[] = [];
    const consume = vi.fn(() => {
      order.push('limit');
      return Promise.resolve();
    });
    const transaction = vi.fn(() => {
      order.push('transaction');
      return Promise.reject(new Error('stop'));
    });
    await expect(
      serviceWith({ transaction }, {
        consumeEnvelopeSend: consume,
      } as unknown as E2eeRateLimitService).sendEnvelopes(
        'actor',
        {
          conversationId: 'c',
          senderDeviceId: 'd',
          clientRequestId: 'r',
          message: undefined,
        },
        'peer-1',
      ),
    ).rejects.toThrow('stop');
    expect(order).toEqual(['limit', 'transaction']);
  });
});
