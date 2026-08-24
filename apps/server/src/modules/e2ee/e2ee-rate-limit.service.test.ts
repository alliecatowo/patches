import { RATE_LIMITS } from '@patches/domain';
import { describe, expect, it, vi } from 'vitest';

import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import type { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';

function storeReturning(count: number): DbRateLimitStore {
  return { increment: vi.fn(() => Promise.resolve(count)) } as unknown as DbRateLimitStore;
}

describe('E2eeRateLimitService (audit P1)', () => {
  it('enforces per-actor and per-peer windows for each abuse-sensitive write', async () => {
    const store = storeReturning(1);
    const service = new E2eeRateLimitService(store);
    await service.consumeEnvelopeSend('actor', 'peer-1');
    await service.consumeConversationCreate('actor', 'peer-1');
    await service.consumeGroupControl('actor', 'peer-1');
    await service.consumeReportEvidence('actor', 'peer-1');

    const keys = (store.increment as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) =>
      String(call[0]),
    );
    expect(keys).toContain('e2ee_envelope:subject:actor');
    expect(keys).toContain('e2ee_envelope:peer:peer-1');
    expect(keys).toContain('e2ee_conversation_create:subject:actor');
    expect(keys).toContain('e2ee_group_control:subject:actor');
    expect(keys).toContain('e2ee_report_evidence:subject:actor');
  });

  it('throws RATE_LIMITED once a per-actor window budget is exceeded', async () => {
    const service = new E2eeRateLimitService(storeReturning(RATE_LIMITS.dmSendPerMinute + 1));
    await expect(service.consumeEnvelopeSend('actor', 'peer-1')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('keys an absent peer under the shared unknown bucket rather than skipping the check', async () => {
    const store = storeReturning(1);
    const service = new E2eeRateLimitService(store);
    await service.consumeEnvelopeSend('actor', undefined);
    const keys = (store.increment as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) =>
      String(call[0]),
    );
    expect(keys).toContain('e2ee_envelope:peer:unknown');
  });
});
