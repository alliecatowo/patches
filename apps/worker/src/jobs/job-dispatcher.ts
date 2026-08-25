import { Injectable } from '@nestjs/common';
import type { JobType } from '@patches/database';

import { CleanExpiredNotificationsHandler } from './handlers/clean-expired-notifications.handler.js';
import { CleanExpiredTokensHandler } from './handlers/clean-expired-tokens.handler.js';
import { CleanExpiredUploadsHandler } from './handlers/clean-expired-uploads.handler.js';
import { ExportAccountHandler } from './handlers/export-account.handler.js';
import { FederationDeliverHandler } from './handlers/federation-deliver.handler.js';
import { ProcessMediaHandler } from './handlers/process-media.handler.js';
import { PurgeAccountHandler } from './handlers/purge-account.handler.js';
import { RotateE2eeFrankingKeyHandler } from './handlers/rotate-e2ee-franking-key.handler.js';
import { E2eeRetentionSweepHandler } from './handlers/e2ee-retention-sweep.handler.js';
import { SendPasswordResetEmailHandler } from './handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from './handlers/send-verification-email.handler.js';
import { type JobHandler } from './job-handler.js';

/**
 * Maps `OutboxJob.type` to its handler. `JobRunner` treats an unregistered type as "not yet
 * handled" and releases the claim back to `PENDING` (`release-claim.ts`) rather than
 * dead-lettering it.
 */
@Injectable()
export class JobDispatcher {
  private readonly handlers: ReadonlyMap<JobType, JobHandler>;

  constructor(
    sendVerificationEmail: SendVerificationEmailHandler,
    sendPasswordResetEmail: SendPasswordResetEmailHandler,
    cleanExpiredTokens: CleanExpiredTokensHandler,
    cleanExpiredNotifications: CleanExpiredNotificationsHandler,
    processMedia: ProcessMediaHandler,
    cleanExpiredUploads: CleanExpiredUploadsHandler,
    federationDeliver: FederationDeliverHandler,
    exportAccount: ExportAccountHandler,
    purgeAccount: PurgeAccountHandler,
    rotateE2eeFrankingKey: RotateE2eeFrankingKeyHandler,
    e2eeRetentionSweep: E2eeRetentionSweepHandler,
  ) {
    this.handlers = new Map<JobType, JobHandler>([
      [sendVerificationEmail.type, sendVerificationEmail],
      [sendPasswordResetEmail.type, sendPasswordResetEmail],
      [cleanExpiredTokens.type, cleanExpiredTokens],
      [cleanExpiredNotifications.type, cleanExpiredNotifications],
      [processMedia.type, processMedia],
      [cleanExpiredUploads.type, cleanExpiredUploads],
      [federationDeliver.type, federationDeliver],
      [exportAccount.type, exportAccount],
      [purgeAccount.type, purgeAccount],
      [rotateE2eeFrankingKey.type, rotateE2eeFrankingKey],
      [e2eeRetentionSweep.type, e2eeRetentionSweep],
    ]);
  }

  find(type: string): JobHandler | undefined {
    return this.handlers.get(type as JobType);
  }
}
