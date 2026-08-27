import {
  Actor as ActorEntity,
  Block as BlockEntity,
  Conversation as ConversationEntity,
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  Follow as FollowEntity,
} from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { E2eeConversationService } from './e2ee-conversation.service.js';
import type { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import type { NotificationsService } from '../notifications/notification.service.js';
import type { NodeFrankingKeyRing } from './report-evidence.js';

function recipientActor(id: string): Partial<ActorEntity> {
  return { id, deletedAt: null, isLocal: true };
}

function activeDevice(): Partial<E2eeDeviceIdentityEntity> {
  return { revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000) };
}

function serviceWith(
  dataSource: unknown,
  rateLimits: E2eeRateLimitService,
  notifications: NotificationsService = noopNotifications(),
): E2eeConversationService {
  return new E2eeConversationService(
    dataSource as DataSource,
    {} as unknown as NodeFrankingKeyRing,
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

function managerWithFirstContact(options: {
  readonly mutualFollow: boolean;
  readonly deviceAvailable?: boolean;
}): EntityManager {
  const permissive = permissiveRepo();
  return {
    getRepository(entity: unknown) {
      if (entity === ActorEntity)
        return { ...permissive, find: vi.fn().mockResolvedValue([recipientActor('recipient')]) };
      // Both block directions miss.
      if (entity === BlockEntity) return { findOne: vi.fn().mockResolvedValue(null) };
      if (entity === FollowEntity)
        return { findOne: vi.fn().mockResolvedValue(options.mutualFollow ? { id: 'f' } : null) };
      if (entity === E2eeDeviceIdentityEntity)
        return {
          findOne: vi
            .fn()
            .mockResolvedValue(options.deviceAvailable === false ? null : activeDevice()),
        };
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
      // No replay by default: `CreateE2eeConversation`'s own top-level `getRepository` lookup
      // (before the transaction) for `conversations` keyed on `creationClientRequestId`.
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
    });

    await expect(result).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });
  });

  // §183.2's "accepted message request" arm went away with the `message_requests` table
  // (ADR 0030) — mutual follow is the only remaining route to first contact.
  it.each([{ mutualFollow: true }])(
    'admits a create when first contact is allowed (mutualFollow=$mutualFollow)',
    async (options) => {
      const { dataSource } = dataSourceFor(managerWithFirstContact(options));
      const result = await serviceWith(dataSource, limiterFrom(vi.fn())).createE2eeConversation(
        actorId,
        {
          clientRequestId: 'req-1',
          recipientActorIds: ['recipient'],
          senderDeviceId: 'device-1',
        },
      );
      // Reservation succeeds outright now — ADR 0035 removed the fanout this used to fall
      // through into, so passing eligibility is the whole story for a reserve.
      expect(result.conversationId).toBe('generated-id');
      expect(result.securityMode).toBe('CONVERSATION_SECURITY_MODE_E2EE_V1');
    },
  );

  it('rejects a reservation naming a revoked or expired sender device', async () => {
    const { dataSource } = dataSourceFor(
      managerWithFirstContact({ mutualFollow: true, deviceAvailable: false }),
    );
    const result = serviceWith(dataSource, limiterFrom(vi.fn())).createE2eeConversation(actorId, {
      clientRequestId: 'req-1',
      recipientActorIds: ['recipient'],
      senderDeviceId: 'device-1',
    });
    await expect(result).rejects.toMatchObject({ code: 'E2EE_DEVICE_NOT_FOUND' });
  });

  it('replays an existing reservation by client_request_id without re-running authorization or budget', async () => {
    const consume = vi.fn();
    const existingFindOne = vi.fn().mockResolvedValue({
      id: 'existing-conversation-id',
      securityMode: 'E2EE_V1',
    });
    const dataSource = {
      getRepository: (entity: unknown) => ({
        findOne: entity === ConversationEntity ? existingFindOne : vi.fn().mockResolvedValue(null),
      }),
      // A replay must never open a transaction — proven by throwing if it does.
      transaction: () => Promise.reject(new Error('replay must not open a transaction')),
    };
    const result = await serviceWith(dataSource, limiterFrom(consume)).createE2eeConversation(
      actorId,
      {
        clientRequestId: 'replayed-request',
        recipientActorIds: ['recipient'],
        senderDeviceId: 'device-1',
      },
    );
    expect(result).toEqual({
      conversationId: 'existing-conversation-id',
      securityMode: 'CONVERSATION_SECURITY_MODE_E2EE_V1',
    });
    expect(consume).not.toHaveBeenCalled();
  });

  it('consumes the create budget before opening its transaction for a fresh send', async () => {
    const { dataSource, consume } = dataSourceFor(managerWithFirstContact({ mutualFollow: false }));
    await serviceWith(dataSource, limiterFrom(consume))
      .createE2eeConversation(actorId, {
        clientRequestId: 'fresh-request',
        recipientActorIds: ['recipient'],
        senderDeviceId: 'device-1',
      })
      .catch(() => undefined);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]?.[0]).toBe(actorId);
  });
});

describe('CreateE2eeConversation is a silent reservation (ADR 0035 §3.5)', () => {
  it('never notifies anyone on a successful reservation', async () => {
    const notifyMessage = vi.fn(() => Promise.resolve());
    const notifications = { notifyMessage } as unknown as NotificationsService;
    const { dataSource } = dataSourceFor(managerWithFirstContact({ mutualFollow: true }));

    const result = await serviceWith(
      dataSource,
      { consumeConversationCreate: vi.fn() } as unknown as E2eeRateLimitService,
      notifications,
    ).createE2eeConversation('00000000-0000-4000-8000-00000000000a', {
      clientRequestId: 'req-1',
      recipientActorIds: ['recipient'],
      senderDeviceId: 'device-1',
    });

    expect(result.conversationId).toBe('generated-id');
    expect(notifyMessage).not.toHaveBeenCalled();
  });

  it('passes nothing but ids to NotificationsService, and never on a failed authorization', async () => {
    const notifyMessage = vi.fn(() => Promise.resolve());
    const notifications = { notifyMessage } as unknown as NotificationsService;
    const { dataSource } = dataSourceFor(managerWithFirstContact({ mutualFollow: false }));

    await serviceWith(
      dataSource,
      { consumeConversationCreate: vi.fn() } as unknown as E2eeRateLimitService,
      notifications,
    )
      .createE2eeConversation('00000000-0000-4000-8000-00000000000a', {
        clientRequestId: 'req-1',
        recipientActorIds: ['recipient'],
        senderDeviceId: 'device-1',
      })
      .catch(() => undefined);

    // Not a mutual follow, so eligibility fails before any conversation is created — no
    // notification is written either way.
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
