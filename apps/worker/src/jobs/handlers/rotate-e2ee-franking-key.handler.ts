import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  latestNodeFrankingKey,
  OutboxJob,
  rotateE2eeFrankingKeyPayloadSchema,
  rotateNodeFrankingKey,
  type JobType,
} from '@patches/database';
import type { DataSource, EntityManager } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/**
 * How often this node mints a new franking-key era (ADR 0020 §9, §12.7). Not prescribed by the
 * ADR — chosen as a reasonable balance between limiting a single compromised key's exposure
 * window and the operational cost of `e2ee_node_franking_keys` rows accumulating forever (they
 * are appended, never deleted — `E2eeLogicalMessage.frankingKeyEra` pins every accepted message
 * to the era that signed it, permanently). Revisit under the P13-016 independent security review
 * before `E2EE_APPROVED_FRANKING_PROFILES` is ever populated.
 */
export const FRANKING_KEY_ROTATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Same "deliberately duplicated per file" convention every other `isUniqueViolation` helper in
 * this codebase uses (see e.g. `apps/server/src/modules/messages/messages.service.ts`). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * `E2EE_ROTATE_FRANKING_KEY` (ADR 0020 §9, §12.7, P13-015): mints the next node franking-key era
 * once every `FRANKING_KEY_ROTATION_INTERVAL_MS` and reschedules itself — the outbox's own
 * `available_at` delay is the rotation timer, the same self-perpetuating pattern
 * `PURGE_ACCOUNT`'s grace-period delay already uses (`purgeAccountPayloadSchema`'s doc comment),
 * so no separate cron/scheduler process is needed (spec §12-13, §153: no Kubernetes). Seeded once
 * by the `Phase13NodeFrankingKeys` migration, which inserts the first occurrence directly into
 * `outbox_jobs` so a fresh node starts rotating without any operator action.
 *
 * Idempotent under redelivery (`docs/architecture/jobs.md` §7) two ways:
 *
 *   1. Rotating only happens when the latest known key is at least
 *      `FRANKING_KEY_ROTATION_INTERVAL_MS` old. A crash-retry of this exact job (the process died
 *      after this handler committed but before `JobRunner` recorded `COMPLETED`, so
 *      `sweepStaleLeases` reclaims it) re-reads the just-minted row, sees it is still fresh, and
 *      does not mint a second era.
 *   2. Rescheduling the next occurrence uses a deterministic `idempotencyKey` keyed to the era it
 *      follows, so a duplicate reschedule attempt hits `outbox_jobs`' unique index and is ignored
 *      rather than double-booking the schedule.
 */
@Injectable()
export class RotateE2eeFrankingKeyHandler implements JobHandler {
  readonly type: JobType = 'E2EE_ROTATE_FRANKING_KEY';
  private readonly logger = new Logger(RotateE2eeFrankingKeyHandler.name);

  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    rotateE2eeFrankingKeyPayloadSchema.parse(payload);
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const latest = await latestNodeFrankingKey(manager);
      const due =
        latest === undefined ||
        now.getTime() - latest.createdAt.getTime() >= FRANKING_KEY_ROTATION_INTERVAL_MS;

      const current = due ? await rotateNodeFrankingKey(manager, { now }) : latest;
      if (current === undefined) {
        // Only reachable if `rotateNodeFrankingKey` itself returned nothing, which it never
        // does — kept as a typed guard rather than a non-null assertion (`latest` alone does not
        // let TypeScript narrow through the `due` boolean).
        throw new Error('E2EE_ROTATE_FRANKING_KEY: no franking key available after rotation.');
      }

      if (due) {
        // Never log `keyMaterial` — only the era number (§101, §183.1).
        this.logger.log(JSON.stringify({ event: 'e2ee_franking_key_rotated', era: current.era }));
      }

      await this.scheduleNextRotation(manager, current.era, current.createdAt);
    });
  }

  private async scheduleNextRotation(
    manager: EntityManager,
    afterEra: number,
    afterCreatedAt: Date,
  ): Promise<void> {
    try {
      await manager.getRepository(OutboxJob).insert({
        type: this.type,
        payload: {},
        availableAt: new Date(afterCreatedAt.getTime() + FRANKING_KEY_ROTATION_INTERVAL_MS),
        idempotencyKey: `e2ee-franking-key-rotation-after-era-${String(afterEra)}`,
      });
    } catch (error) {
      // Another attempt (a crash-retry of this same handler) already scheduled the occurrence
      // that follows this exact era — never duplicate the schedule. Anything other than the
      // expected unique-index conflict is a real failure.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}
