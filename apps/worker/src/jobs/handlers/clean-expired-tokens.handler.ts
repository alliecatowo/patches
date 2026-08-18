import { Inject, Injectable } from '@nestjs/common';
import {
  AuthCode,
  cleanExpiredTokensPayloadSchema,
  RefreshToken,
  SshLoginChallenge,
  type JobType,
} from '@patches/database';
import { LessThan, type DataSource } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/**
 * Sweeps expired `refresh_tokens`, `auth_codes`, and `ssh_login_challenges` rows. Naturally
 * idempotent (`docs/architecture/jobs.md` §7): deleting an already-deleted/expired row is a
 * no-op, so re-running after a crash is safe.
 */
@Injectable()
export class CleanExpiredTokensHandler implements JobHandler {
  readonly type: JobType = 'CLEAN_EXPIRED_TOKENS';

  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    cleanExpiredTokensPayloadSchema.parse(payload);
    const now = new Date();

    await Promise.all([
      this.dataSource.getRepository(RefreshToken).delete({ expiresAt: LessThan(now) }),
      this.dataSource.getRepository(AuthCode).delete({ expiresAt: LessThan(now) }),
      this.dataSource.getRepository(SshLoginChallenge).delete({ expiresAt: LessThan(now) }),
    ]);
  }
}
