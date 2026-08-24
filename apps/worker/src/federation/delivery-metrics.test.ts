import { describe, expect, it } from 'vitest';
import { Registry } from 'prom-client';

import { DeliveryMetricsRegistry } from './delivery-metrics.js';

describe('DeliveryMetricsRegistry', () => {
  const makeRegistry = () => new Registry();

  it('starts at zero for every counter', () => {
    expect(new DeliveryMetricsRegistry(makeRegistry()).snapshot()).toEqual({});
  });

  it('increments an unlabeled counter', () => {
    const registry = new DeliveryMetricsRegistry(makeRegistry());
    registry.increment('deliveries_succeeded');
    registry.increment('deliveries_succeeded');
    expect(registry.snapshot()).toEqual({ deliveries_succeeded: 2 });
  });

  it('keeps distinct labels as distinct counters', () => {
    const registry = new DeliveryMetricsRegistry(makeRegistry());
    registry.increment('deliveries_failed', { outcome: 'SIGNER_MISSING' });
    registry.increment('deliveries_failed', { outcome: 'REJECTED_TERMINAL' });
    registry.increment('deliveries_failed', { outcome: 'SIGNER_MISSING' });
    expect(registry.snapshot()).toEqual({
      'deliveries_failed{outcome=SIGNER_MISSING}': 2,
      'deliveries_failed{outcome=REJECTED_TERMINAL}': 1,
    });
  });

  it('never mixes deliveries_dead into deliveries_failed', () => {
    const registry = new DeliveryMetricsRegistry(makeRegistry());
    registry.increment('deliveries_dead');
    registry.increment('deliveries_failed', { outcome: 'RETRY' });
    expect(registry.snapshot()).toEqual({
      deliveries_dead: 1,
      'deliveries_failed{outcome=RETRY}': 1,
    });
  });
});
