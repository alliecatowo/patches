import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { MAX_TRANSIENT_RETRIES, queryRetryDelay, shouldRetryQuery } from './queryRetry.js';

describe('shouldRetryQuery', () => {
  it.each([Code.Unavailable, Code.DeadlineExceeded])(
    'rides out a cold start: keeps retrying code %i up to the cap',
    (code) => {
      const error = new ConnectError('cold', code);
      for (let n = 0; n < MAX_TRANSIENT_RETRIES; n += 1) {
        expect(shouldRetryQuery(n, error)).toBe(true);
      }
      expect(shouldRetryQuery(MAX_TRANSIENT_RETRIES, error)).toBe(false);
    },
  );

  it('covers at least a 20s cold start in cumulative backoff', () => {
    let total = 0;
    for (let n = 0; n < MAX_TRANSIENT_RETRIES; n += 1) total += queryRetryDelay(n);
    expect(total).toBeGreaterThanOrEqual(20_000);
  });

  it('retries deterministic errors only once', () => {
    const error = new ConnectError('nope', Code.NotFound);
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });
});

describe('queryRetryDelay', () => {
  it('backs off exponentially and caps at 8s', () => {
    expect([0, 1, 2, 3, 4, 9].map(queryRetryDelay)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});
