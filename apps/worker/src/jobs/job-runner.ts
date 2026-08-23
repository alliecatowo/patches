import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  claimOutboxJobs,
  countPendingOutboxJobs,
  markOutboxJobFailed,
  markOutboxJobSucceeded,
  isAuthCodeEmailJobType,
  type OutboxJob,
} from '@patches/database';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../config/app-config.service.js';
import { DATA_SOURCE } from '../database/database.module.js';
import { deliveryMetrics, getQueueDepth } from '../federation/delivery-metrics.js';
import { workerQueueDepth } from '@patches/observability';
import { JobDispatcher } from './job-dispatcher.js';
import { OutboxCircuitBreaker } from './outbox-circuit-breaker.js';
import { releaseUnhandledJob } from './release-claim.js';
import { sweepStaleLeases } from './stale-lease-sweep.js';

/** B-030: how often `run()` logs a `federation_metrics` snapshot — same interval as the
 * server's own periodic log (`apps/server/src/modules/federation/federation-metrics.service
 * .ts`'s `LOG_INTERVAL_MS`), **deliberately duplicated** rather than shared (no cross-app-`src`
 * import convention in this repo, same reasoning as this file's other federation primitives). */
const FEDERATION_METRICS_LOG_INTERVAL_MS = 60_000;

/** B-102: daily notification cleanup runs at 03:00 UTC. We check once per loop pass whether
 * it's time to enqueue the job — the `available_at` mechanism handles the exact timing, but we
 * enqueue a new job each day when the clock crosses 03:00 UTC. */
function getNextCleanupAvailableAt(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/**
 * `min(currentMs * 2, maxMs)` — the idle-poll backoff step (`docs/architecture/jobs.md` §8).
 * A free function, not a method, so it is unit-testable without constructing a `JobRunner`.
 */
export function nextIdleDelayMs(currentMs: number, maxMs: number): number {
  return Math.min(currentMs * 2, maxMs);
}

/**
 * Claim loop over the Postgres outbox (`docs/architecture/jobs.md`, `INITIAL_VISION.md`
 * §12–13, §124).
 *
 * Each pass claims up to `WORKER_CONCURRENCY` due jobs in one transaction (`claimOutboxJobs`,
 * `FOR UPDATE SKIP LOCKED`), then dispatches every claimed job to its handler concurrently.
 * When nothing is claimable, it sleeps with backoff starting at `WORKER_POLL_MS` and doubling
 * up to `WORKER_IDLE_BACKOFF_MAX_MS` — never a tight poll (§8).
 *
 * `requestStop()` stops the loop from claiming a *new* batch and wakes an idle sleep early;
 * it deliberately does not interrupt a batch already in flight — `run()` always awaits
 * `Promise.all` on the current batch before checking `stopping` again, so a job claimed
 * before shutdown was requested is never abandoned mid-handler (`docs/architecture/jobs.md`
 * §8's "allow in-flight jobs to finish").
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name);
  private stopping = false;
  private wake: (() => void) | undefined;
  /** `0`, not `Date.now()`, so the very first loop iteration always sweeps once — surfaces
   * leases a previous, crashed instance of this same process left behind as soon as
   * possible, rather than waiting a full `leaseSweepIntervalMs` after boot. */
  private lastSweepAtMs = 0;
  /** Same "`0` so the first pass always fires" reasoning as `lastSweepAtMs` (B-030). */
  private lastMetricsLogAtMs = 0;
  /** Same "`0` so the first pass always fires" reasoning, for the S-002 backlog log. */
  private lastBacklogLogAtMs = 0;
  /** B-101: tracks when we last pushed the queue-depth gauge. */
  private lastQueueDepthPushAtMs = 0;
  /** B-102: tracks when we last enqueued the daily notification cleanup job. */
  private lastCleanupEnqueueAtMs = 0;
  /** S-002 (`docs/operations/abuse-protection.md`): per-job-type circuit breaker — see its
   * own doc comment. Constructed here (not injected) since its two parameters are read once
   * from config at process boot, same as `RateLimitService`'s static `WINDOWS`. */
  private readonly circuitBreaker: OutboxCircuitBreaker;

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    private readonly dispatcher: JobDispatcher,
    private readonly config: AppConfigService,
  ) {
    this.circuitBreaker = new OutboxCircuitBreaker(
      config.circuitFailureThreshold,
      config.circuitCooldownMs,
    );
  }

  requestStop(): void {
    this.stopping = true;
    this.wake?.();
  }

  async run(): Promise<void> {
    const { workerId, concurrency, pollMs, idleBackoffMaxMs } = this.config;
    let idleDelayMs = pollMs;

    while (!this.stopping) {
      await this.sweepStaleLeasesIfDue();
      this.logFederationMetricsIfDue();
      await this.logBacklogIfDue();
      await this.pushQueueDepthIfDue();
      await this.enqueueDailyCleanupIfDue();

      const excludeTypes = this.circuitBreaker.excludedTypes();
      const claimed = await this.dataSource.transaction((manager) =>
        claimOutboxJobs(manager, { workerId, limit: concurrency, excludeTypes }),
      );

      if (claimed.length === 0) {
        await this.sleep(idleDelayMs);
        idleDelayMs = nextIdleDelayMs(idleDelayMs, idleBackoffMaxMs);
        continue;
      }

      idleDelayMs = pollMs;
      await Promise.all(claimed.map((job) => this.processJob(job)));
    }
  }

  /** B-013: resets jobs abandoned `PROCESSING` by a crashed worker back to `PENDING`, at
   * most once per `leaseSweepIntervalMs` — this is a table scan over `PROCESSING` rows, not
   * something to run every claim pass. */
  private async sweepStaleLeasesIfDue(): Promise<void> {
    const { leaseTtlMs, leaseSweepIntervalMs } = this.config;
    const now = Date.now();
    if (now - this.lastSweepAtMs < leaseSweepIntervalMs) return;
    this.lastSweepAtMs = now;

    const reclaimed = await sweepStaleLeases(this.dataSource.manager, { leaseTtlMs });
    if (reclaimed > 0) {
      this.logger.warn(JSON.stringify({ outcome: 'STALE_LEASES_RECLAIMED', count: reclaimed }));
    }
  }

  /** B-030: periodic `federation_metrics` structured log line, mirroring the server's own
   * (`FederationMetricsService`) so an operator watching Fly logs sees both processes'
   * `deliveries_*` counters without needing to scrape a separate endpoint — this worker has no
   * HTTP surface of its own to expose a snapshot on. Unlike the server's version, this is not
   * gated on a `FEDERATION_ENABLED` flag (the worker has none — it just processes whatever
   * `OutboxJob` rows exist); the snapshot is simply all-zero on a node that never runs
   * `FEDERATION_DELIVER` jobs. */
  private logFederationMetricsIfDue(): void {
    const now = Date.now();
    if (now - this.lastMetricsLogAtMs < FEDERATION_METRICS_LOG_INTERVAL_MS) return;
    this.lastMetricsLogAtMs = now;
    this.logger.log(JSON.stringify({ event: 'federation_metrics', ...deliveryMetrics.snapshot() }));
  }

  /** S-002 (`docs/operations/abuse-protection.md`): logs a structured `outbox_backlog`
   * warning at most once per `backlogLogIntervalMs` whenever the total `PENDING` count exceeds
   * `backlogWarnThreshold` — purely observational, the circuit breaker above is what actually
   * protects this process; this is what tells an operator *why* it's protecting itself. */
  private async logBacklogIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastBacklogLogAtMs < this.config.backlogLogIntervalMs) return;
    this.lastBacklogLogAtMs = now;

    const pending = await countPendingOutboxJobs(this.dataSource.manager);
    if (pending > this.config.backlogWarnThreshold) {
      this.logger.warn(JSON.stringify({ event: 'outbox_backlog', pending }));
    }
  }

  /** B-101: periodically pushes the `workerQueueDepth` gauge so horizontal scaling
   * decisions can be data-driven. The first pass fires immediately (`lastQueueDepthPushAtMs = 0`),
   * then every `WORKER_QUEUE_DEPTH_INTERVAL_MS`. */
  private async pushQueueDepthIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastQueueDepthPushAtMs < this.config.queueDepthIntervalMs) return;
    this.lastQueueDepthPushAtMs = now;

    const depth = await getQueueDepth(this.dataSource.manager);
    workerQueueDepth.set({ queue: 'outbox' }, depth);
  }

  /** B-102: enqueues the daily `CLEAN_EXPIRED_NOTIFICATIONS` job at 03:00 UTC.
   * Runs once per day when the loop crosses the 03:00 UTC boundary. Uses `available_at`
   * to schedule the exact execution time, and an idempotency key to avoid duplicates if
   * multiple workers are running. */
  private async enqueueDailyCleanupIfDue(): Promise<void> {
    const now = Date.now();
    const nextCleanupAt = getNextCleanupAvailableAt(new Date(now));
    const nextCleanupMs = nextCleanupAt.getTime();

    // If we already enqueued for this cleanup window, skip.
    if (this.lastCleanupEnqueueAtMs >= nextCleanupMs - 24 * 60 * 60 * 1000) return;

    // If it's not yet time to enqueue (we're before 03:00 UTC of the target day), wait.
    // We enqueue shortly after midnight so the job is ready by 03:00 UTC.
    const enqueueAfterMs = nextCleanupMs - 3 * 60 * 60 * 1000; // 3 hours before = midnight UTC
    if (now < enqueueAfterMs) return;

    this.lastCleanupEnqueueAtMs = now;

    // Check if a job for this day already exists (idempotency key based on date).
    const idempotencyKey = `CLEAN_EXPIRED_NOTIFICATIONS:${nextCleanupAt.toISOString().split('T')[0]}`;
    const existing = await this.dataSource.manager.getRepository('OutboxJob').findOne({
      where: { idempotencyKey },
    });
    if (existing) return;

    // Enqueue the job with available_at set to 03:00 UTC.
    await this.dataSource.manager.getRepository('OutboxJob').save({
      type: 'CLEAN_EXPIRED_NOTIFICATIONS',
      payload: {},
      availableAt: nextCleanupAt,
      idempotencyKey,
    });

    this.logger.log(
      JSON.stringify({ event: 'cleanup_job_enqueued', availableAt: nextCleanupAt.toISOString() }),
    );
  }

  /** Interruptible sleep: `requestStop()` wakes it immediately instead of waiting it out. */
  private async sleep(ms: number): Promise<void> {
    if (this.stopping) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wake = undefined;
        resolve();
      }, ms);
      this.wake = (): void => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
    });
  }

  private async processJob(job: OutboxJob): Promise<void> {
    const start = Date.now();
    const handler = this.dispatcher.find(job.type);
    const claim = { workerId: job.lockedBy!, lockedAt: job.lockedAt! };

    if (!handler) {
      await releaseUnhandledJob(this.dataSource.manager, job.id);
      this.logger.warn(
        JSON.stringify({ jobId: job.id, type: job.type, outcome: 'UNHANDLED_TYPE' }),
      );
      return;
    }

    try {
      await handler.handle(job.payload, { jobId: job.id, attempt: job.attempts });
      const completed = await markOutboxJobSucceeded(this.dataSource.manager, job.id, claim);
      if (!completed) {
        this.logger.warn(
          JSON.stringify({ jobId: job.id, type: job.type, outcome: 'STALE_CLAIM_IGNORED' }),
        );
        return;
      }
      this.circuitBreaker.recordSuccess(job.type);
      this.logger.log(
        JSON.stringify({
          jobId: job.id,
          type: job.type,
          attempt: job.attempts,
          latencyMs: Date.now() - start,
          outcome: 'SUCCEEDED',
        }),
      );
    } catch (error) {
      // Never log `job.payload` here — verification/reset jobs carry a code (spec §101).
      const message = isAuthCodeEmailJobType(job.type)
        ? 'AUTH_CODE_DELIVERY_FAILED'
        : error instanceof Error
          ? error.message
          : String(error);
      const outcome = await this.dataSource.transaction((manager) =>
        markOutboxJobFailed(manager, job.id, { claim, error: message }),
      );
      if (outcome === null) {
        this.logger.warn(
          JSON.stringify({ jobId: job.id, type: job.type, outcome: 'STALE_CLAIM_IGNORED' }),
        );
        return;
      }
      const wasOpen = this.circuitBreaker.isOpen(job.type);
      this.circuitBreaker.recordFailure(job.type);
      if (!wasOpen && this.circuitBreaker.isOpen(job.type)) {
        this.logger.warn(
          JSON.stringify({ event: 'outbox_circuit_open', type: job.type, error: message }),
        );
      }
      this.logger.warn(
        JSON.stringify({
          jobId: job.id,
          type: job.type,
          attempt: job.attempts,
          latencyMs: Date.now() - start,
          outcome,
          error: message,
        }),
      );
    }
  }
}
