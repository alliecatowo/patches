import { describe, expect, it, vi } from 'vitest';

import { isAppError } from '../../common/errors/app-error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import { DemoSandboxService } from './demo-sandbox.service.js';

function build(config: Partial<Record<string, unknown>>, query = vi.fn()) {
  const store = { increment: vi.fn().mockResolvedValue(1) };
  const service = new DemoSandboxService(
    {
      demoMode: true,
      demoStartsPerPeerPerHour: 4,
      demoMaxLiveSandboxes: 2,
      demoTtlMinutes: 60,
      demoSweepIntervalSeconds: 120,
      ...config,
    } as unknown as AppConfigService,
    { query, transaction: vi.fn() } as never,
    {} as never,
    store as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, store, query };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : 'NOT_AN_APP_ERROR';
  }
  return undefined;
}

describe('DemoSandboxService', () => {
  it('refuses to start anywhere but the demo node, before touching the database', async () => {
    const { service, store, query } = build({ demoMode: false });
    expect(await codeOf(service.start())).toBe('DEMO_DISABLED');
    expect(store.increment).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('does not schedule a sweep outside demo mode', () => {
    const { service, query } = build({ demoMode: false });
    service.onApplicationBootstrap();
    service.onModuleDestroy();
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a new sandbox when the live ceiling is reached', async () => {
    // First query is the sweep's SELECT (nothing expired), second is the live count.
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ live: '2' }]);
    const { service } = build({}, query);
    expect(await codeOf(service.start())).toBe('SERVICE_UNAVAILABLE');
  });

  it('rate-limits per peer before doing any other work', async () => {
    const { service, store, query } = build({});
    store.increment.mockResolvedValue(5);
    expect(await codeOf(service.start())).toBe('RATE_LIMITED');
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes every expiry query to rows that carry an expiry', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const { service } = build({}, query);
    await service.purgeExpired();
    await service.liveSandboxCount();
    for (const [sql] of query.mock.calls as Array<[string]>) {
      expect(sql).toContain('sandbox_expires_at IS NOT NULL');
    }
  });
});
