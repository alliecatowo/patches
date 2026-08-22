import { Injectable } from '@nestjs/common';
import { type AuthCodeEmailJobType } from '@patches/database';

import { AuthCodeEmailDeliveryService } from '../auth-code-email-delivery.service.js';
import { type JobContext, type JobHandler } from '../job-handler.js';
import { escapeHtml } from './html.js';

/** Sends the password-reset code (`INITIAL_VISION.md` §39). Idempotency: see the sibling
 * `SendVerificationEmailHandler` — the code row's own state is the source of truth. */
@Injectable()
export class SendPasswordResetEmailHandler implements JobHandler {
  readonly type: AuthCodeEmailJobType = 'SEND_PASSWORD_RESET_EMAIL';

  constructor(private readonly delivery: AuthCodeEmailDeliveryService) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    await this.delivery.deliver(this.type, payload, (email, code) => ({
      to: email,
      subject: 'Reset your Patches password',
      text: `Your Patches password reset code is ${code}. If you didn't request this, ignore this email.`,
      html: `<p>Your Patches password reset code is <strong>${escapeHtml(code)}</strong>.</p><p>If you didn't request this, ignore this email.</p>`,
    }));
  }
}
