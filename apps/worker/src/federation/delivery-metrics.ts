import { Counter, type Registry } from 'prom-client';
import { metricsRegistry } from '@patches/observability';
import type { EntityManager } from 'typeorm';
import { OutboxJob } from '@patches/database';

export type DeliveryMetricName = 'deliveries_succeeded' | 'deliveries_failed' | 'deliveries_dead';

export interface DeliveryMetricLabels {
  outcome?: string | undefined;
}

export class DeliveryMetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly promCounters = new Map<string, Counter>();

  constructor(private readonly registry: Registry = metricsRegistry) {
    this.promCounters.set(
      'deliveries_succeeded',
      new Counter({
        name: 'patches_federation_deliveries_succeeded_total',
        help: 'Total number of successful federation deliveries',
        labelNames: ['outcome'],
        registers: [registry],
      }),
    );
    this.promCounters.set(
      'deliveries_failed',
      new Counter({
        name: 'patches_federation_deliveries_failed_total',
        help: 'Total number of failed federation deliveries',
        labelNames: ['outcome'],
        registers: [registry],
      }),
    );
    this.promCounters.set(
      'deliveries_dead',
      new Counter({
        name: 'patches_federation_deliveries_dead_total',
        help: 'Total number of dead-lettered federation deliveries',
        labelNames: ['outcome'],
        registers: [registry],
      }),
    );
  }

  increment(name: DeliveryMetricName, labels: DeliveryMetricLabels = {}): void {
    const key = keyFor(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);

    const promCounter = this.promCounters.get(name);
    if (promCounter) {
      const outcome = labels.outcome ?? 'unknown';
      promCounter.inc({ outcome });
    }
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}

function keyFor(name: DeliveryMetricName, labels: DeliveryMetricLabels): string {
  const parts = Object.entries(labels)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return parts.length === 0 ? name : `${name}{${parts.join(',')}}`;
}

/** The process-wide registry `FederationDeliverHandler` increments. */
export const deliveryMetrics = new DeliveryMetricsRegistry();

/**
 * Returns the current count of `PENDING` jobs in the outbox.
 * Used by `JobRunner` to push the `workerQueueDepth` gauge.
 */
export function getQueueDepth(manager: EntityManager): Promise<number> {
  return manager.getRepository(OutboxJob).count({ where: { status: 'PENDING' } });
}
