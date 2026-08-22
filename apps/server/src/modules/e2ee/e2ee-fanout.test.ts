import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { describe, expect, it, vi } from 'vitest';
import { type EntityManager } from 'typeorm';

import { acceptE2eeLogicalMessage } from './e2ee-fanout.js';

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
    });

    await expect(result).rejects.toMatchObject({
      code: 'E2EE_FANOUT_REJECTED',
    });
    await expect(result).rejects.toThrow('independent review');
    expect(getRepository).not.toHaveBeenCalled();
  });
});
