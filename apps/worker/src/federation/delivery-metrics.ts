/**
 * A-036's worker-side counterpart to `apps/server/src/modules/federation/federation-metrics
 * .service.ts` — **deliberately duplicated**, not imported, for the same reason
 * `delivery-client.ts`'s doc comment gives: `apps/worker` and `apps/server` are separate app
 * packages, not `packages/*`, and this repo has no cross-app-`src` import convention.
 *
 * Not a Nest-injected `@Injectable()` like the server's version: `FederationDeliverHandler`
 * is a plain Nest provider, but nothing else in `apps/worker` needs to read this registry (no
 * HTTP surface exists to expose a snapshot from), so a module-level singleton is the whole
 * story — one counter set per worker process, incremented from `handle()`, read only by tests
 * that construct their own `DeliveryMetricsRegistry` instance directly.
 */

export type DeliveryMetricName = 'deliveries_succeeded' | 'deliveries_failed' | 'deliveries_dead';

export interface DeliveryMetricLabels {
  outcome?: string | undefined;
}

export class DeliveryMetricsRegistry {
  private readonly counters = new Map<string, number>();

  increment(name: DeliveryMetricName, labels: DeliveryMetricLabels = {}): void {
    const key = keyFor(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
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
