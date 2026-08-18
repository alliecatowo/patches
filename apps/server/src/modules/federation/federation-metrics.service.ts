import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';

/** A-036: the full set of federation counters this node ever increments. Not every process
 * increments every name — this server process only ever touches the `inbox_*` names plus
 * `deliveries_enqueued` (`InboxService`, `InboxController`, `DeliveryService`); the
 * `deliveries_succeeded`/`deliveries_failed`/`deliveries_dead` names are only ever incremented
 * by `apps/worker`'s own mirror (`apps/worker/src/federation/delivery-metrics.ts`), a separate
 * OS process with its own memory — the union is shared so both sides agree on the vocabulary,
 * not because either process expects to see the other's counters in its own snapshot. */
export type FederationMetricName =
  | 'inbox_received'
  | 'inbox_rejected_signature'
  | 'inbox_rejected_ratelimit'
  | 'inbox_ignored'
  | 'inbox_handled'
  | 'deliveries_enqueued'
  | 'deliveries_succeeded'
  | 'deliveries_failed'
  | 'deliveries_dead';

export interface FederationMetricLabels {
  domain?: string | undefined;
  type?: string | undefined;
}

const LOG_INTERVAL_MS = 60_000;

/**
 * Process-local, in-memory counter registry (P8-160's "federation telemetry exists"). No
 * Redis/Prometheus client in v0 (spec §12) — this is intentionally the simplest thing that
 * gives an operator visibility: a `GET /federation/metrics` snapshot
 * (`http/federation-metrics.controller.ts`) plus a periodic structured log line so Fly logs
 * capture it even if nobody ever curls the endpoint.
 */
@Injectable()
export class FederationMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FederationMetricsService.name);
  private readonly counters = new Map<string, number>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly config: AppConfigService) {}

  increment(name: FederationMetricName, labels: FederationMetricLabels = {}): void {
    const key = keyFor(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  /** Only starts the periodic log when federation is actually enabled on this node — an
   * idle timer logging an always-empty snapshot on every non-federating node would just be
   * noise (mirrors `main.ts` only opening the HTTP listener under the same flag). */
  onModuleInit(): void {
    if (!this.config.federationEnabled) return;
    this.timer = setInterval(() => {
      this.logger.log(JSON.stringify({ event: 'federation_metrics', ...this.snapshot() }));
    }, LOG_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }
}

/** Deterministic key so equal `(name, labels)` pairs always collide onto the same counter,
 * regardless of the order the caller happened to build the labels object in. */
function keyFor(name: FederationMetricName, labels: FederationMetricLabels): string {
  const parts = Object.entries(labels)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return parts.length === 0 ? name : `${name}{${parts.join(',')}}`;
}
