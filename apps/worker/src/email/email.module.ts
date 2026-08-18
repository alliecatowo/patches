import { Module } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service.js';
import { ConsoleEmailProvider } from './console-email-provider.js';
import { EMAIL_PROVIDER, type EmailProvider } from './email-provider.js';
import { ResendEmailProvider } from './resend-email-provider.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';

/**
 * Selects the `EmailProvider` implementation from `EMAIL_PROVIDER` (validated by
 * `env.schema.ts`, which already guarantees `SMTP_HOST`/`SMTP_PORT` are set for `smtp` and
 * `RESEND_API_KEY` is set for `resend`). A free function, not a factory closure, so provider
 * selection is unit-testable without booting Nest DI.
 */
export function selectEmailProvider(
  config: AppConfigService,
  consoleProvider: ConsoleEmailProvider,
): EmailProvider {
  switch (config.emailProvider) {
    case 'smtp':
      return new SmtpEmailProvider({
        host: config.smtpHost as string,
        port: config.smtpPort as number,
        from: config.emailFrom,
      });
    case 'resend':
      return new ResendEmailProvider({
        apiKey: config.resendApiKey as string,
        from: config.emailFrom,
      });
    case 'console':
    default:
      return consoleProvider;
  }
}

@Module({
  providers: [
    ConsoleEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: selectEmailProvider,
      inject: [AppConfigService, ConsoleEmailProvider],
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
