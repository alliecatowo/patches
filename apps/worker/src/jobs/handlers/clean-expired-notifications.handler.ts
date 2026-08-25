import { Inject, Injectable } from '@nestjs/common';
import { LessThan, type DataSource } from 'typeorm';
import { Notification } from '@patches/database';

import { DATA_SOURCE } from '../../database/database.module.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/**
 * Deletes `Notification` rows older than `NOTIFICATION_TTL_DAYS`. Naturally idempotent
 * (`docs/architecture/jobs.md` §7): deleting an already-deleted row is a no-op, so re-running
 * after a crash is safe.
 */
@Injectable()
export class CleanExpiredNotificationsHandler implements JobHandler {
  readonly type = 'CLEAN_EXPIRED_NOTIFICATIONS' as const;

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  async handle(_payload: unknown, _ctx: JobContext): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.notificationTtlDays * 24 * 60 * 60 * 1000);

    await this.dataSource.getRepository(Notification).delete({
      createdAt: LessThan(cutoff),
    });
  }
}
