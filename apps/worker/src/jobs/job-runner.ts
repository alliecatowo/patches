import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  claimOutboxJobs,
  markOutboxJobFailed,
  markOutboxJobSucceeded,
  type OutboxJob,
} from '@patches/database';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../config/app-config.service.js';
import { DATA_SOURCE } from '../database/database.module.js';
import { JobDispatcher } from './job-dispatcher.js';
import { releaseUnhandledJob } from './release-claim.js';

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

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    private readonly dispatcher: JobDispatcher,
    private readonly config: AppConfigService,
  ) {}

  requestStop(): void {
    this.stopping = true;
    this.wake?.();
  }

  async run(): Promise<void> {
    const { workerId, concurrency, pollMs, idleBackoffMaxMs } = this.config;
    let idleDelayMs = pollMs;

    while (!this.stopping) {
      const claimed = await this.dataSource.transaction((manager) =>
        claimOutboxJobs(manager, { workerId, limit: concurrency }),
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

    if (!handler) {
      await releaseUnhandledJob(this.dataSource.manager, job.id);
      this.logger.warn(
        JSON.stringify({ jobId: job.id, type: job.type, outcome: 'UNHANDLED_TYPE' }),
      );
      return;
    }

    try {
      await handler.handle(job.payload, { jobId: job.id, attempt: job.attempts });
      await markOutboxJobSucceeded(this.dataSource.manager, job.id);
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
      const message = error instanceof Error ? error.message : String(error);
      const outcome = await markOutboxJobFailed(this.dataSource.manager, job.id, {
        error: message,
      });
      this.logger.warn(
        JSON.stringify({
          jobId: job.id,
          type: job.type,
          attempt: job.attempts,
          latencyMs: Date.now() - start,
          outcome: outcome ?? 'MISSING',
          error: message,
        }),
      );
    }
  }
}
