import { describe, expect, it, vi } from 'vitest';

import type { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { DmRateLimitService } from './dm-rate-limit.service.js';

function harness() {
  const increment = vi
    .fn<(key: string, windowMs: number, now: Date) => Promise<number>>()
    .mockResolvedValue(1);
  const store = { increment } as unknown as DbRateLimitStore;
  return { service: new DmRateLimitService(store), increment };
}

describe('DmRateLimitService (spec §188)', () => {
  it('checks minute and hour budgets for both the actor and network peer on a send', async () => {
    const { service, increment } = harness();
    const now = new Date('2026-08-18T12:00:00.000Z');

    await service.consumeSend('actor-1', '203.0.113.8', now);

    expect(increment.mock.calls.map(([key]) => key)).toEqual([
      'dm_send_minute:subject:actor-1',
      'dm_send_minute:peer:203.0.113.8',
      'dm_send_hour:subject:actor-1',
      'dm_send_hour:peer:203.0.113.8',
    ]);
  });

  it('checks hour and day budgets for both the actor and network peer on a request', async () => {
    const { service, increment } = harness();
    const now = new Date('2026-08-18T12:00:00.000Z');

    await service.consumeMessageRequest('actor-1', '203.0.113.8', now);

    expect(increment.mock.calls.map(([key]) => key)).toEqual([
      'dm_request_hour:subject:actor-1',
      'dm_request_hour:peer:203.0.113.8',
      'dm_request_day:subject:actor-1',
      'dm_request_day:peer:203.0.113.8',
    ]);
  });

  it('uses a shared unknown-peer bucket instead of bypassing peer throttling', async () => {
    const { service, increment } = harness();

    await service.consumeSend('actor-1', undefined);

    expect(increment.mock.calls.map(([key]) => key)).toContain('dm_send_minute:peer:unknown');
    expect(increment.mock.calls.map(([key]) => key)).toContain('dm_send_hour:peer:unknown');
  });
});
