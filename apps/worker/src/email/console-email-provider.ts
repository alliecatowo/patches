import { Injectable, Logger } from '@nestjs/common';

import { type EmailMessage, type EmailProvider } from './email-provider.js';

/**
 * Local-dev default: never touches the network. Keeps every sent message in memory (`sent`)
 * so tests/tools can assert on what would have been sent, and logs only `to`/`subject` — the
 * body of a verification/reset email carries a code, which must never be logged (spec §98,
 * §101).
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(`email (console provider): to=${message.to} subject="${message.subject}"`);
    await Promise.resolve();
  }
}
