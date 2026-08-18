import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTBOX_BACKOFF, outboxBackoffDelayMs } from './outbox.js';

// Pure-function half of the outbox helpers — the database-backed half (claim/skip-locked,
// dead-lettering) lives in test/outbox.integration.test.ts.
describe('outboxBackoffDelayMs', () => {
  const noJitter = () => 0;

  it('doubles with each attempt (docs/architecture/jobs.md §5)', () => {
    expect(outboxBackoffDelayMs(0, DEFAULT_OUTBOX_BACKOFF, noJitter)).toBe(5_000);
    expect(outboxBackoffDelayMs(1, DEFAULT_OUTBOX_BACKOFF, noJitter)).toBe(10_000);
    expect(outboxBackoffDelayMs(3, DEFAULT_OUTBOX_BACKOFF, noJitter)).toBe(40_000);
  });

  it('saturates at maxDelayMs instead of growing without bound', () => {
    expect(outboxBackoffDelayMs(50, DEFAULT_OUTBOX_BACKOFF, noJitter)).toBe(15 * 60_000);
  });

  it('adds jitter in [0, jitterMs) so retries of a batch spread out', () => {
    expect(outboxBackoffDelayMs(0, DEFAULT_OUTBOX_BACKOFF, () => 0.5)).toBe(7_500);
    expect(outboxBackoffDelayMs(0, DEFAULT_OUTBOX_BACKOFF, () => 0.999_9)).toBeLessThan(10_000);
  });
});
