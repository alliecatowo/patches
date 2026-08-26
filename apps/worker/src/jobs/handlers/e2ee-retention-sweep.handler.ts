import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  e2eeRetentionSweepPayloadSchema,
  E2eeMailboxEnvelope,
  E2eeOneTimePrekey,
  E2eeSignedPrekey,
  OutboxJob,
  type JobType,
} from '@patches/database';
import { E2EE_MAILBOX_MAX_LATENCY_MS } from '@patches/domain';
import { e2eeRetentionDeletedTotal, e2eeRetentionRunsTotal } from '@patches/observability';
import type { DataSource, ObjectType } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

export const E2EE_RETENTION_BATCH_SIZE = 500;
export const E2EE_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

type RetentionKind = 'mailbox_envelope' | 'one_time_prekey' | 'signed_prekey';

@Injectable()
export class E2eeRetentionSweepHandler implements JobHandler {
  readonly type: JobType = 'E2EE_RETENTION_SWEEP';
  private readonly logger = new Logger(E2eeRetentionSweepHandler.name);

  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  async handle(payload: unknown, ctx: JobContext): Promise<void> {
    const { scheduledFor } = e2eeRetentionSweepPayloadSchema.parse(payload);
    if (scheduledFor === undefined)
      throw new Error('E2EE_RETENTION_SWEEP scheduled bucket missing.');
    const now = new Date();
    const cutoff = new Date(now.getTime() - E2EE_MAILBOX_MAX_LATENCY_MS);
    let envelopes: number;
    let oneTimePrekeys: number;
    let signedPrekeys: number;
    try {
      envelopes = await this.deleteBatch(
        E2eeMailboxEnvelope,
        'acknowledged_at IS NOT NULL AND acknowledged_at < :cutoff',
        'acknowledged_at',
        cutoff,
      );
      // Each delete is a separately committed transaction. Account for it immediately so a
      // later kind's failed transaction cannot lose this aggregate, and never re-emit it.
      this.recordDeleted('mailbox_envelope', envelopes);
      oneTimePrekeys = await this.deleteBatch(
        E2eeOneTimePrekey,
        `consumed_at IS NOT NULL AND consumed_at < :cutoff AND EXISTS (SELECT 1 FROM e2ee_one_time_prekey_key_ids issued WHERE issued.device_identity_id = retained.device_identity_id AND issued.key_id = retained.key_id AND issued.consumed_at IS NOT NULL)`,
        'consumed_at',
        cutoff,
      );
      this.recordDeleted('one_time_prekey', oneTimePrekeys);
      signedPrekeys = await this.deleteBatch(
        E2eeSignedPrekey,
        'retired_at IS NOT NULL AND retired_at < :cutoff',
        'retired_at',
        cutoff,
      );
      this.recordDeleted('signed_prekey', signedPrekeys);
      await this.scheduleNext(ctx.jobId, scheduledFor);
      e2eeRetentionRunsTotal.inc({ outcome: 'succeeded' });
      this.logger.log(
        JSON.stringify({ event: 'e2ee_retention_sweep', envelopes, oneTimePrekeys, signedPrekeys }),
      );
    } catch (error) {
      e2eeRetentionRunsTotal.inc({ outcome: 'failed' });
      throw error;
    }
  }

  private deleteBatch(
    entity: ObjectType<{ id: string }>,
    predicate: string,
    timestampColumn: string,
    cutoff: Date,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .getRepository(entity)
        .createQueryBuilder('retained')
        .select('retained.id', 'id')
        .where(predicate, { cutoff })
        .orderBy(`retained.${timestampColumn}`, 'ASC')
        .addOrderBy('retained.id', 'ASC')
        .limit(E2EE_RETENTION_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getRawMany<{ id: string }>();
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return 0;
      const result = await manager
        .createQueryBuilder()
        .delete()
        .from(entity)
        .whereInIds(ids)
        .execute();
      return result.affected ?? 0;
    });
  }

  private recordDeleted(kind: RetentionKind, count: number): void {
    if (count > 0) e2eeRetentionDeletedTotal.inc({ kind }, count);
  }

  private async scheduleNext(parentJobId: string, scheduledFor: string): Promise<void> {
    const nextScheduledFor = new Date(
      new Date(scheduledFor).getTime() + E2EE_RETENTION_INTERVAL_MS,
    );
    const nextBucket = nextScheduledFor.toISOString();
    try {
      await this.dataSource.getRepository(OutboxJob).insert({
        type: this.type,
        payload: { scheduledFor: nextBucket },
        availableAt: nextScheduledFor,
        idempotencyKey: `e2ee-retention-sweep:${parentJobId}:${nextBucket}`,
      });
    } catch (error) {
      if (isSuccessorIdempotencyConflict(error)) return;
      throw error;
    }
  }
}

/** Only this exact unique index proves an already-scheduled successor, not every 23505. */
function isSuccessorIdempotencyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const postgres = error as { code?: unknown; constraint?: unknown };
  return postgres.code === '23505' && postgres.constraint === 'idx_outbox_jobs_idempotency_key';
}
