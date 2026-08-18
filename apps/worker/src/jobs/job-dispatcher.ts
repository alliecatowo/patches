import { Injectable } from '@nestjs/common';
import type { JobType } from '@patches/database';

import { CleanExpiredTokensHandler } from './handlers/clean-expired-tokens.handler.js';
import { SendPasswordResetEmailHandler } from './handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from './handlers/send-verification-email.handler.js';
import { type JobHandler } from './job-handler.js';

/**
 * Maps `OutboxJob.type` to its handler. `PROCESS_MEDIA` and `CLEAN_EXPIRED_UPLOADS` are
 * intentionally absent — media isn't implemented yet (Phase 3+), so nothing enqueues those
 * job types today. `JobRunner` treats an unregistered type as "not yet handled" and releases
 * the claim back to `PENDING` (`release-claim.ts`) rather than dead-lettering it.
 */
@Injectable()
export class JobDispatcher {
  private readonly handlers: ReadonlyMap<JobType, JobHandler>;

  constructor(
    sendVerificationEmail: SendVerificationEmailHandler,
    sendPasswordResetEmail: SendPasswordResetEmailHandler,
    cleanExpiredTokens: CleanExpiredTokensHandler,
  ) {
    this.handlers = new Map<JobType, JobHandler>([
      [sendVerificationEmail.type, sendVerificationEmail],
      [sendPasswordResetEmail.type, sendPasswordResetEmail],
      [cleanExpiredTokens.type, cleanExpiredTokens],
    ]);
  }

  find(type: string): JobHandler | undefined {
    return this.handlers.get(type as JobType);
  }
}
