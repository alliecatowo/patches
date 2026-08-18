import type { JobType } from '@patches/database';

export interface JobContext {
  jobId: string;
  /** Attempt number as recorded on the claimed row (already incremented by the claim). */
  attempt: number;
}

/**
 * One handler per `JobType` (`docs/architecture/jobs.md` §9). `payload` is `unknown` at this
 * boundary — `OutboxJob.payload` is `jsonb` — so every handler parses it against the shared
 * zod schema from `@patches/database` before touching it (spec §153: no `any`).
 */
export interface JobHandler {
  readonly type: JobType;
  handle(payload: unknown, ctx: JobContext): Promise<void>;
}
