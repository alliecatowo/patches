import { Block, Conversation, ConversationMember, Follow, MessageRequest } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import type { AppConfigService } from '../../config/app-config.service.js';
import type { NotificationsService } from '../notifications/notification.service.js';
import { mayMessageDirectly } from './direct-message-eligibility.js';
import type { DmRateLimitService } from './dm-rate-limit.service.js';
import { MessagesService } from './messages.service.js';

interface MessagesServiceInternals {
  requireActiveUnblockedMembership(
    manager: EntityManager,
    conversationId: string,
    actorId: string,
    requireActivePeer?: boolean,
    options?: { readonly legacyPlaintextConversation?: boolean },
  ): Promise<ConversationMember>;
  findExistingDirectConversation(
    manager: EntityManager,
    actorAId: string,
    actorBId: string,
  ): Promise<Conversation | null>;
}

function service(dataSource?: unknown): MessagesService {
  return new MessagesService(
    (dataSource ?? {}) as DataSource,
    {} as NotificationsService,
    { dmEnabled: true } as AppConfigService,
    {} as DmRateLimitService,
  );
}

function managerWith(repositories: Array<[unknown, object]>): EntityManager {
  const byEntity = new Map(repositories);
  return {
    getRepository(entity: unknown) {
      const repo = byEntity.get(entity);
      if (repo === undefined) throw new Error(`Unexpected repository: ${String(entity)}`);
      return repo;
    },
  } as unknown as EntityManager;
}

describe('MessagesService first-contact gating (spec §183.2)', () => {
  it('allows the sender after the target accepted that sender’s request', async () => {
    const followFindOne = vi.fn().mockResolvedValue(null);
    const requestFindOne = vi.fn().mockResolvedValue({ id: 'accepted-request' });
    const manager = managerWith([
      [Follow, { findOne: followFindOne }],
      [MessageRequest, { findOne: requestFindOne }],
    ]);

    await expect(mayMessageDirectly(manager, 'caller', 'target')).resolves.toBe(true);
    expect(requestFindOne).toHaveBeenCalledWith({
      where: {
        senderActorId: 'caller',
        recipientActorId: 'target',
        status: 'ACCEPTED',
      },
    });
  });
});

describe('MessagesService plaintext/E2EE mode separation (audit P0-1a)', () => {
  const conversationId = '00000000-0000-4000-8000-000000000001';
  const viewerMembership = { actorId: 'caller', leftAt: null };

  it('requireActiveUnblockedMembership rejects an E2EE conversation for the plaintext write gate', async () => {
    const internals = service() as unknown as MessagesServiceInternals;
    const manager = managerWith([
      [ConversationMember, { find: vi.fn().mockResolvedValue([viewerMembership]) }],
      [
        Conversation,
        { findOne: vi.fn().mockResolvedValue({ id: conversationId, securityMode: 'E2EE_V1' }) },
      ],
    ]);

    await expect(
      internals.requireActiveUnblockedMembership(manager, conversationId, 'caller', true, {
        legacyPlaintextConversation: true,
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });

  it('requireActiveUnblockedMembership admits an active member of a LEGACY conversation', async () => {
    const internals = service() as unknown as MessagesServiceInternals;
    const manager = managerWith([
      [ConversationMember, { find: vi.fn().mockResolvedValue([viewerMembership]) }],
      [
        Conversation,
        {
          findOne: vi
            .fn()
            .mockResolvedValue({ id: conversationId, securityMode: 'LEGACY_SERVER_VISIBLE' }),
        },
      ],
      // No block rows — `findOne` resolves null for both directions.
      [Block, { findOne: vi.fn().mockResolvedValue(null) }],
    ]);

    await expect(
      internals.requireActiveUnblockedMembership(manager, conversationId, 'caller'),
    ).resolves.toBe(viewerMembership);
  });

  it('findExistingDirectConversation skips the pair’s E2EE thread instead of reusing it', async () => {
    const internals = service() as unknown as MessagesServiceInternals;
    const e2eeThread = { id: conversationId, kind: 'DIRECT', securityMode: 'E2EE_V1' };
    const memberFind = vi
      .fn<(options: { where: Record<string, unknown> }) => Promise<unknown[]>>()
      .mockImplementation((options) => {
        if (options.where['actorId'] === 'caller') {
          return Promise.resolve([{ conversationId, leftAt: null, conversation: e2eeThread }]);
        }
        // The other-members scan for `conversationId`.
        return Promise.resolve([{ actorId: 'peer', leftAt: null }]);
      });
    const manager = managerWith([[ConversationMember, { find: memberFind }]]);

    await expect(internals.findExistingDirectConversation(manager, 'caller', 'peer')).resolves.toBe(
      null,
    );
  });

  it('findExistingDirectConversation still returns the pair’s LEGACY thread', async () => {
    const internals = service() as unknown as MessagesServiceInternals;
    const legacyThread = {
      id: conversationId,
      kind: 'DIRECT',
      securityMode: 'LEGACY_SERVER_VISIBLE',
    };
    const memberFind = vi
      .fn<(options: { where: Record<string, unknown> }) => Promise<unknown[]>>()
      .mockImplementation((options) => {
        if (options.where['actorId'] === 'caller') {
          return Promise.resolve([{ conversationId, leftAt: null, conversation: legacyThread }]);
        }
        return Promise.resolve([{ actorId: 'peer', leftAt: null }]);
      });
    const manager = managerWith([[ConversationMember, { find: memberFind }]]);

    await expect(internals.findExistingDirectConversation(manager, 'caller', 'peer')).resolves.toBe(
      legacyThread,
    );
  });

  it('leaveConversation refuses an E2EE conversation for an active member and points at RemoveE2eeMember', async () => {
    const memberUpdate = vi.fn();
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === Conversation)
          return {
            findOne: vi.fn().mockResolvedValue({ id: conversationId, securityMode: 'E2EE_V1' }),
          };
        if (entity === ConversationMember)
          return {
            findOne: vi.fn().mockResolvedValue({ conversationId, actorId: 'caller', leftAt: null }),
            update: memberUpdate,
          };
        throw new Error('Unexpected repository.');
      },
    };
    await expect(service(dataSource).leaveConversation('caller', conversationId)).rejects.toThrow(
      /RemoveE2eeMember/,
    );
    expect(memberUpdate).not.toHaveBeenCalled();
  });

  it('leaveConversation keeps the spec §189 no-op for a non-member and updates a LEGACY membership', async () => {
    const memberUpdate = vi.fn().mockResolvedValue({ affected: 1 });
    let mode: string | null = 'E2EE_V1';
    const membership: object | null = null;
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === Conversation)
          return {
            findOne: vi
              .fn()
              .mockImplementation(() =>
                Promise.resolve(mode === null ? null : { id: conversationId, securityMode: mode }),
              ),
          };
        if (entity === ConversationMember)
          return {
            findOne: vi.fn().mockResolvedValue(membership),
            update: memberUpdate,
          };
        throw new Error('Unexpected repository.');
      },
    };

    await expect(
      service(dataSource).leaveConversation('caller', conversationId),
    ).resolves.toBeUndefined();
    expect(memberUpdate).not.toHaveBeenCalled();

    mode = 'LEGACY_SERVER_VISIBLE';
    await service(dataSource).leaveConversation('caller', conversationId);
    expect(memberUpdate).toHaveBeenCalled();
  });
});
