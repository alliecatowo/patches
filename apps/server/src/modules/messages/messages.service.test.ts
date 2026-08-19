import { Follow, MessageRequest } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import type { AppConfigService } from '../../config/app-config.service.js';
import type { NotificationsService } from '../notifications/notification.service.js';
import type { DmRateLimitService } from './dm-rate-limit.service.js';
import { MessagesService } from './messages.service.js';

interface MessagesServiceInternals {
  mayMessageDirectly(manager: EntityManager, callerId: string, targetId: string): Promise<boolean>;
}

function service(): MessagesService {
  return new MessagesService(
    {} as DataSource,
    {} as NotificationsService,
    { dmEnabled: true } as AppConfigService,
    {} as DmRateLimitService,
  );
}

describe('MessagesService gating (spec §183.2)', () => {
  it('allows the sender after the target accepted that sender’s request', async () => {
    const followFindOne = vi.fn().mockResolvedValue(null);
    const requestFindOne = vi.fn().mockResolvedValue({ id: 'accepted-request' });
    const manager = {
      getRepository(entity: unknown) {
        if (entity === Follow) return { findOne: followFindOne };
        if (entity === MessageRequest) return { findOne: requestFindOne };
        throw new Error('Unexpected repository.');
      },
    } as unknown as EntityManager;
    const internals = service() as unknown as MessagesServiceInternals;

    await expect(internals.mayMessageDirectly(manager, 'caller', 'target')).resolves.toBe(true);
    expect(requestFindOne).toHaveBeenCalledWith({
      where: {
        senderActorId: 'caller',
        recipientActorId: 'target',
        status: 'ACCEPTED',
      },
    });
  });
});
