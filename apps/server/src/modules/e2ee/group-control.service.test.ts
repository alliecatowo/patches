import { E2eeGroupChangeKind } from '@patches/proto/nest';
import {
  Actor as ActorEntity,
  Block as BlockEntity,
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  E2eeGroupControlEvent as E2eeGroupControlEventEntity,
  Follow as FollowEntity,
  MessageRequest as MessageRequestEntity,
} from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { type E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { E2eeGroupService } from './group-control.service.js';

const conversationId = '00000000-0000-4000-8000-00000000000c';

function service(dataSource: unknown): {
  readonly group: E2eeGroupService;
  readonly consumeGroupControl: ReturnType<typeof vi.fn>;
} {
  const consumeGroupControl = vi.fn(() => Promise.resolve());
  const group = new E2eeGroupService(
    dataSource as DataSource,
    {
      consumeGroupControl,
    } as unknown as E2eeRateLimitService,
  );
  return { group, consumeGroupControl };
}

interface ManagerOptions {
  readonly conversation: { readonly securityMode: string; readonly kind: string };
  /** Caller's membership row; `null` means no row at all. */
  readonly callerMembership: { readonly leftAt: Date | null } | null;
  /** Subject's membership row; `undefined` means "no row" (a brand-new member). */
  readonly subjectRow?: { readonly leftAt: Date | null } | undefined;
  readonly mutualFollow: boolean;
  readonly acceptedRequest: boolean;
}

function managerFor(options: ManagerOptions): EntityManager {
  const members = [
    { actorId: 'caller', leftAt: options.callerMembership?.leftAt ?? null },
    ...(options.subjectRow === undefined
      ? []
      : [{ actorId: 'subject', leftAt: options.subjectRow.leftAt }]),
  ];
  return {
    getRepository(entity: unknown) {
      if (entity === ConversationEntity)
        return { findOne: vi.fn().mockResolvedValue(options.conversation) };
      if (entity === ConversationMemberEntity)
        return {
          find: vi.fn().mockResolvedValue(members),
          findOne: vi.fn().mockResolvedValue(options.callerMembership === null ? null : members[0]),
          insert: vi.fn(() => Promise.resolve(undefined)),
          update: vi.fn(() => Promise.resolve(undefined)),
        };
      if (entity === ActorEntity)
        return {
          findOne: vi.fn().mockResolvedValue({ id: 'subject', deletedAt: null, isLocal: true }),
        };
      // Block checks: every pair unblocked.
      if (entity === BlockEntity) return { findOne: vi.fn().mockResolvedValue(null) };
      if (entity === FollowEntity)
        return { findOne: vi.fn().mockResolvedValue(options.mutualFollow ? { id: 'f' } : null) };
      if (entity === MessageRequestEntity)
        return { findOne: vi.fn().mockResolvedValue(options.acceptedRequest ? { id: 'r' } : null) };
      throw new Error(`Unexpected repository: ${String(entity)}`);
    },
  } as unknown as EntityManager;
}

describe('E2eeGroupService.addE2eeMember first-contact + DIRECT-kind rules (audit P1, P0-1d)', () => {
  /** A structurally complete add request whose event passes the echo/agreement prechecks;
   * the append then stops on the transcript re-encode check (bytes are dummies), which is
   * past every authorization gate this suite exercises. */
  function addRequest(): Parameters<E2eeGroupService['addE2eeMember']>[1] {
    return {
      conversationId,
      actorId: 'subject',
      signerDeviceId: 'device-1',
      event: {
        conversationId,
        epoch: '4',
        change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
        subjectActorId: 'subject',
        signerActorId: 'caller',
        signerDeviceId: 'device-1',
        previousDigest: Buffer.alloc(32),
        digest: Buffer.alloc(32),
        eventBytes: Buffer.alloc(0),
        deviceSignature: Buffer.alloc(64),
        createdAt: undefined,
      },
    };
  }

  function run(manager: EntityManager): Promise<unknown> {
    const { group } = service({
      transaction: (body: (m: EntityManager) => Promise<unknown>) => body(manager),
    });
    return group.addE2eeMember('caller', addRequest());
  }

  it('rejects a brand-new subject on a DIRECT-kind thread even when eligible', async () => {
    await expect(
      run(
        managerFor({
          conversation: { securityMode: 'E2EE_V1', kind: 'DIRECT' },
          callerMembership: { leftAt: null },
          subjectRow: undefined,
          mutualFollow: true,
          acceptedRequest: false,
        }),
      ),
    ).rejects.toThrow(/DIRECT-kind/);
  });

  it('gates a DIRECT-kind rejoin behind first-contact eligibility like any add', async () => {
    await expect(
      run(
        managerFor({
          conversation: { securityMode: 'E2EE_V1', kind: 'DIRECT' },
          callerMembership: { leftAt: null },
          subjectRow: { leftAt: new Date() },
          mutualFollow: false,
          acceptedRequest: false,
        }),
      ),
    ).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });
  });

  it('rejects a GROUP-kind subject the caller may not message directly, uniformly', async () => {
    await expect(
      run(
        managerFor({
          conversation: { securityMode: 'E2EE_V1', kind: 'GROUP' },
          callerMembership: { leftAt: null },
          subjectRow: undefined,
          mutualFollow: false,
          acceptedRequest: false,
        }),
      ),
    ).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });
  });

  it('passes an eligible GROUP-kind add through to the signed-event append', async () => {
    // Eligibility satisfied via an accepted request; the append then rejects the dummy
    // event bytes — proving the run reached the transcript verification step.
    await expect(
      run(
        managerFor({
          conversation: { securityMode: 'E2EE_V1', kind: 'GROUP' },
          callerMembership: { leftAt: null },
          subjectRow: undefined,
          mutualFollow: false,
          acceptedRequest: true,
        }),
      ),
    ).rejects.toThrow(/signed event transcript/);
  });

  it('consumes the group-control budget per call', async () => {
    const { group, consumeGroupControl } = service({
      transaction: (body: (m: EntityManager) => Promise<unknown>) =>
        body(
          managerFor({
            conversation: { securityMode: 'E2EE_V1', kind: 'GROUP' },
            callerMembership: { leftAt: null },
            subjectRow: undefined,
            mutualFollow: false,
            acceptedRequest: false,
          }),
        ),
    });
    await group.addE2eeMember('caller', addRequest(), 'peer-9').catch(() => undefined);
    expect(consumeGroupControl).toHaveBeenCalledWith('caller', 'peer-9');
  });
});

describe('E2eeGroupService.listGroupControlEvents removed-member window (audit P2)', () => {
  interface ListSpies {
    readonly eventFindOne: ReturnType<typeof vi.fn>;
    readonly eventGetMany: ReturnType<typeof vi.fn>;
  }

  function listDataSource(options: {
    readonly callerMembership: { readonly leftAt: Date | null } | null;
    readonly removalEpoch: string | null;
  }): { readonly dataSource: unknown; readonly spies: ListSpies } {
    const eventFindOne = vi
      .fn()
      .mockResolvedValue(options.removalEpoch === null ? null : { epoch: options.removalEpoch });
    const eventGetMany = vi.fn(() => Promise.resolve([]));
    const spies: ListSpies = { eventFindOne, eventGetMany };
    return {
      spies,
      dataSource: {
        getRepository(entity: unknown) {
          if (entity === ConversationEntity)
            return {
              findOne: vi.fn().mockResolvedValue({ id: conversationId, securityMode: 'E2EE_V1' }),
            };
          if (entity === ConversationMemberEntity)
            return { findOne: vi.fn().mockResolvedValue(options.callerMembership) };
          if (entity === E2eeGroupControlEventEntity) {
            return {
              findOne: eventFindOne,
              createQueryBuilder() {
                const qb = {
                  where: () => qb,
                  andWhere: () => qb,
                  orderBy: () => qb,
                  take: () => qb,
                  getMany: eventGetMany,
                };
                return qb;
              },
            };
          }
          throw new Error(`Unexpected repository: ${String(entity)}`);
        },
      },
    };
  }

  it('lists without an end bound for a current member', async () => {
    const { dataSource, spies } = listDataSource({
      callerMembership: { leftAt: null },
      removalEpoch: null,
    });
    const response = await service(dataSource).group.listGroupControlEvents('caller', {
      conversationId,
      afterEpoch: '',
      cursor: '',
      limit: 50,
    });
    expect(response.events).toEqual([]);
    expect(response.page?.hasMore ?? false).toBe(false);
    expect(spies.eventFindOne).not.toHaveBeenCalled();
  });

  it('bounds a past member to events up to their own removal', async () => {
    const { dataSource, spies } = listDataSource({
      callerMembership: { leftAt: new Date() },
      removalEpoch: '5',
    });
    const { group } = service(dataSource);
    const response = await group.listGroupControlEvents('caller', {
      conversationId,
      afterEpoch: '',
      cursor: '',
      limit: 50,
    });
    expect(response.events).toEqual([]);
    const lookup = spies.eventFindOne.mock.calls[0]?.[0] as
      { where?: Record<string, unknown> } | undefined;
    expect(lookup?.where).toMatchObject({ subjectActorId: 'caller', changeKind: 'REMOVED' });
    expect(spies.eventGetMany).toHaveBeenCalledTimes(1);
  });

  it('serves nothing to a past member whose removal event cannot be found', async () => {
    const { dataSource, spies } = listDataSource({
      callerMembership: { leftAt: new Date() },
      removalEpoch: null,
    });
    const response = await service(dataSource).group.listGroupControlEvents('caller', {
      conversationId,
      afterEpoch: '',
      cursor: '',
      limit: 50,
    });
    expect(response.events).toEqual([]);
    expect(response.page?.nextCursor ?? '').toBe('');
    expect(response.page?.hasMore ?? false).toBe(false);
    expect(spies.eventGetMany).not.toHaveBeenCalled();
  });

  it('reports the uniform not-found for a non-member', async () => {
    const { dataSource } = listDataSource({ callerMembership: null, removalEpoch: null });
    await expect(
      service(dataSource).group.listGroupControlEvents('stranger', {
        conversationId,
        afterEpoch: '',
        cursor: '',
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });
  });
});
