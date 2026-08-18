import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { EmailModule } from '../email/email.module.js';
import { CleanExpiredTokensHandler } from './handlers/clean-expired-tokens.handler.js';
import { SendPasswordResetEmailHandler } from './handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from './handlers/send-verification-email.handler.js';
import { JobDispatcher } from './job-dispatcher.js';
import { JobRunner } from './job-runner.js';

@Module({
  imports: [DatabaseModule, EmailModule],
  providers: [
    SendVerificationEmailHandler,
    SendPasswordResetEmailHandler,
    CleanExpiredTokensHandler,
    JobDispatcher,
    JobRunner,
  ],
  exports: [JobRunner],
})
export class JobRunnerModule {}
