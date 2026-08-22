import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { EmailModule } from '../email/email.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CleanExpiredTokensHandler } from './handlers/clean-expired-tokens.handler.js';
import { CleanExpiredUploadsHandler } from './handlers/clean-expired-uploads.handler.js';
import { ExportAccountHandler } from './handlers/export-account.handler.js';
import { FederationDeliverHandler } from './handlers/federation-deliver.handler.js';
import { ProcessMediaHandler } from './handlers/process-media.handler.js';
import { PurgeAccountHandler } from './handlers/purge-account.handler.js';
import { RotateE2eeFrankingKeyHandler } from './handlers/rotate-e2ee-franking-key.handler.js';
import { SendPasswordResetEmailHandler } from './handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from './handlers/send-verification-email.handler.js';
import { JobDispatcher } from './job-dispatcher.js';
import { AuthCodeEmailDeliveryService } from './auth-code-email-delivery.service.js';
import { JobRunner } from './job-runner.js';

@Module({
  imports: [DatabaseModule, EmailModule, StorageModule],
  providers: [
    AuthCodeEmailDeliveryService,
    SendVerificationEmailHandler,
    SendPasswordResetEmailHandler,
    CleanExpiredTokensHandler,
    ProcessMediaHandler,
    CleanExpiredUploadsHandler,
    FederationDeliverHandler,
    ExportAccountHandler,
    PurgeAccountHandler,
    RotateE2eeFrankingKeyHandler,
    JobDispatcher,
    JobRunner,
  ],
  exports: [JobRunner],
})
export class JobRunnerModule {}
