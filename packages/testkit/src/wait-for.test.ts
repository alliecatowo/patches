import { describe, expect, it } from 'vitest';
import { waitFor } from './wait-for.js';

describe('waitFor()', () => {
  it('resolves as soon as the predicate turns true', async () => {
    let calls = 0;
    await waitFor(
      async () => {
        calls += 1;
        return Promise.resolve(calls >= 3);
      },
      { intervalMs: 1 },
    );
    expect(calls).toBe(3);
  });

  it('throws once timeoutMs elapses without the predicate turning true', async () => {
    await expect(
      waitFor(() => Promise.resolve(false), { timeoutMs: 20, intervalMs: 5 }),
    ).rejects.toThrow(/not met within 20ms/);
  });
});
