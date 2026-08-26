import { Injectable, Logger } from '@nestjs/common';

import { type EmailMessage, type EmailProvider } from './email-provider.js';

/**
 * Local-dev default: never touches the network. Keeps every sent message in memory (`sent`)
 * so tests/tools can assert on what would have been sent. Logs only a fixed outcome: auth-code
 * recipients and bodies are both credential-bearing delivery data and must never be logged.
 */
// nestjs-doctor-ignore-next-line performance/no-unused-providers -- injected into the EMAIL_PROVIDER useFactory's inject array (email.module.ts); the selected implementation when EMAIL_PROVIDER=console
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log('email (console provider): accepted');
    await Promise.resolve();
  }
}
