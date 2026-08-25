import { describe, expect, it } from 'vitest';

import { nextIdleDelayMs, sanitizeJobFailure } from './job-runner.js';

describe('sanitizeJobFailure', () => {
  it('never carries handler error content or identifiers into persistent worker failure state', () => {
    const failure = sanitizeJobFailure(
      new Error('ciphertext=secret device=4c3f9d3a-1a16-4a82-a76d-b5ab73f87f45'),
    );

    expect(failure).toEqual({ code: 'JOB_HANDLER_FAILED', message: 'Job handler failed.' });
  });
});

describe('nextIdleDelayMs', () => {
  it('doubles each idle delay and caps at the configured maximum', () => {
    expect(nextIdleDelayMs(20, 160)).toBe(40);
    expect(nextIdleDelayMs(40, 160)).toBe(80);
    expect(nextIdleDelayMs(80, 160)).toBe(160);
    expect(nextIdleDelayMs(160, 160)).toBe(160);
    expect(nextIdleDelayMs(320, 160)).toBe(160);
  });
});
