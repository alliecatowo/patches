import { describe, expect, it } from 'vitest';

import type { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';

function countingStore(): DbRateLimitStore {
  const counts = new Map<string, number>();
  return {
    increment: (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return Promise.resolve(next);
    },
  } as unknown as DbRateLimitStore;
}

describe('E2eeRateLimitService.allowOneTimePrekeyClaim (audit P2-H4)', () => {
  it('allows three claims per caller and target an hour, then falls back', async () => {
    const limits = new E2eeRateLimitService(countingStore());
    const results: boolean[] = [];
    for (let i = 0; i < 5; i += 1)
      results.push(await limits.allowOneTimePrekeyClaim('a', 'victim'));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('budgets each target separately but caps one caller across all targets', async () => {
    const limits = new E2eeRateLimitService(countingStore());
    const results: boolean[] = [];
    for (let i = 0; i < 32; i += 1) {
      results.push(await limits.allowOneTimePrekeyClaim('scripted', `victim-${String(i)}`));
    }
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results.slice(30)).toEqual([false, false]);
    // Another caller is unaffected, and the first caller's pair budget is per target.
    expect(await limits.allowOneTimePrekeyClaim('other', 'victim-0')).toBe(true);
  });
});
