import { Resend } from 'resend';

import { type EmailMessage, type EmailProvider } from './email-provider.js';

export interface ResendEmailProviderOptions {
  apiKey: string;
  from: string;
}

/**
 * Production provider (`docs/research/infra-and-security-libs.md` §3). The `from` domain
 * must already be verified in the Resend dashboard — that is an operational precondition,
 * not something this adapter can check.
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(options: ResendEmailProviderOptions) {
    this.resend = new Resend(options.apiKey);
    this.from = options.from;
  }

  async send(message: EmailMessage): Promise<void> {
    // `exactOptionalPropertyTypes` forbids `text: undefined`; the resend SDK's own types
    // require `text` to be present in at least one of the accepted shapes, so it always is.
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text ?? '',
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}
