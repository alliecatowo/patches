import nodemailer, { type Transporter } from 'nodemailer';

import { type EmailMessage, type EmailProvider } from './email-provider.js';

export interface SmtpEmailProviderOptions {
  host: string;
  port: number;
  from: string;
}

/**
 * Wraps a nodemailer SMTP transport pointed at Mailpit locally (`docs/research/
 * infra-and-security-libs.md` §3: `secure: false, ignoreTLS: true` — Mailpit has no TLS).
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options: SmtpEmailProviderOptions) {
    this.from = options.from;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: false,
      ignoreTLS: true,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
