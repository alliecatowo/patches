import { Inject, Injectable } from '@nestjs/common';
import { sendVerificationEmailPayloadSchema, type JobType } from '@patches/database';

import { EMAIL_PROVIDER, type EmailProvider } from '../../email/email-provider.js';
import { type JobContext, type JobHandler } from '../job-handler.js';
import { escapeHtml } from './html.js';

/**
 * Sends the email-verification code (`INITIAL_VISION.md` §38). Idempotency
 * (`docs/architecture/jobs.md` §7): re-running this handler is at worst a duplicate email —
 * the code's own `consumed_at`/expiry state (owned by the auth service that issued it, not
 * this handler) is what actually gates whether the code can still be used, so no extra
 * dedup lookup is needed here.
 */
@Injectable()
export class SendVerificationEmailHandler implements JobHandler {
  readonly type: JobType = 'SEND_VERIFICATION_EMAIL';

  constructor(@Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    const { email, code } = sendVerificationEmailPayloadSchema.parse(payload);
    const safeCode = escapeHtml(code);

    await this.emailProvider.send({
      to: email,
      subject: 'Verify your Patches account',
      text: `Your Patches verification code is ${code}. If you didn't request this, ignore this email.`,
      html: `<p>Your Patches verification code is <strong>${safeCode}</strong>.</p><p>If you didn't request this, ignore this email.</p>`,
    });
  }
}
