import { describe, expect, it } from 'vitest';

import { OutboxCircuitBreaker } from './outbox-circuit-breaker.js';

describe('OutboxCircuitBreaker (S-002)', () => {
  it('stays closed below the failure threshold', () => {
    const breaker = new OutboxCircuitBreaker(3, 60_000);
    breaker.recordFailure('FEDERATION_DELIVER');
    breaker.recordFailure('FEDERATION_DELIVER');

    expect(breaker.isOpen('FEDERATION_DELIVER')).toBe(false);
    expect(breaker.excludedTypes()).toEqual([]);
  });

  it('opens once consecutive failures reach the threshold, excluding only that type', () => {
    const breaker = new OutboxCircuitBreaker(3, 60_000);
    breaker.recordFailure('FEDERATION_DELIVER');
    breaker.recordFailure('FEDERATION_DELIVER');
    breaker.recordFailure('FEDERATION_DELIVER');

    expect(breaker.isOpen('FEDERATION_DELIVER')).toBe(true);
    expect(breaker.excludedTypes()).toEqual(['FEDERATION_DELIVER']);
    // A different, healthy type is never affected.
    expect(breaker.isOpen('SEND_VERIFICATION_EMAIL')).toBe(false);
  });

  it('a success resets the failure count and closes the circuit', () => {
    const breaker = new OutboxCircuitBreaker(3, 60_000);
    breaker.recordFailure('FEDERATION_DELIVER');
    breaker.recordFailure('FEDERATION_DELIVER');
    breaker.recordSuccess('FEDERATION_DELIVER');
    breaker.recordFailure('FEDERATION_DELIVER');
    breaker.recordFailure('FEDERATION_DELIVER');

    // Only 2 consecutive failures since the reset — still below a threshold of 3.
    expect(breaker.isOpen('FEDERATION_DELIVER')).toBe(false);
  });

  it('recovers (stops excluding) once the cooldown elapses', () => {
    const breaker = new OutboxCircuitBreaker(1, 1_000);
    const t0 = 1_000_000;
    breaker.recordFailure('FEDERATION_DELIVER', t0);

    expect(breaker.excludedTypes(t0 + 500)).toEqual(['FEDERATION_DELIVER']);
    expect(breaker.excludedTypes(t0 + 1_001)).toEqual([]);
  });

  it('a half-open trial failure reopens the circuit for a fresh cooldown', () => {
    const breaker = new OutboxCircuitBreaker(1, 1_000);
    const t0 = 1_000_000;
    breaker.recordFailure('FEDERATION_DELIVER', t0);
    expect(breaker.excludedTypes(t0 + 1_001)).toEqual([]); // half-open: trial allowed through

    breaker.recordFailure('FEDERATION_DELIVER', t0 + 1_001);
    expect(breaker.excludedTypes(t0 + 1_500)).toEqual(['FEDERATION_DELIVER']);
  });

  it('a half-open trial success closes the circuit outright', () => {
    const breaker = new OutboxCircuitBreaker(1, 1_000);
    const t0 = 1_000_000;
    breaker.recordFailure('FEDERATION_DELIVER', t0);
    breaker.recordSuccess('FEDERATION_DELIVER');

    expect(breaker.isOpen('FEDERATION_DELIVER', t0 + 1_001)).toBe(false);
  });
});
