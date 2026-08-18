import { Inject, Injectable } from '@nestjs/common';
import { sendPasswordResetEmailPayloadSchema, type JobType } from '@patches/database';

import { EMAIL_PROVIDER, type EmailProvider } from '../../email/email-provider.js';
import { type JobContext, type JobHandler } from '../job-handler.js';
import { escapeHtml } from './html.js';

/** Sends the password-reset code (`INITIAL_VISION.md` §39). Idempotency: see the sibling
 * `SendVerificationEmailHandler` — the code row's own state is the source of truth. */
@Injectable()
export class SendPasswordResetEmailHandler implements JobHandler {
  readonly type: JobType = 'SEND_PASSWORD_RESET_EMAIL';

  constructor(@Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    const { email, code } = sendPasswordResetEmailPayloadSchema.parse(payload);
    const safeCode = escapeHtml(code);

    await this.emailProvider.send({
      to: email,
      subject: 'Reset your Patches password',
      text: `Your Patches password reset code is ${code}. If you didn't request this, ignore this email.`,
      html: `<p>Your Patches password reset code is <strong>${safeCode}</strong>.</p><p>If you didn't request this, ignore this email.</p>`,
    });
  }
}
