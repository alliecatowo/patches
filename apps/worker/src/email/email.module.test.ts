import { describe, expect, it } from 'vitest';

import { type AppConfigService } from '../config/app-config.service.js';
import { ConsoleEmailProvider } from './console-email-provider.js';
import { ResendEmailProvider } from './resend-email-provider.js';
import { selectEmailProvider } from './email.module.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';

function fakeConfig(overrides: Partial<AppConfigService>): AppConfigService {
  return {
    emailFrom: 'Patches <no-reply@patches.local>',
    smtpHost: undefined,
    smtpPort: undefined,
    resendApiKey: undefined,
    ...overrides,
  } as AppConfigService;
}

describe('selectEmailProvider', () => {
  it('returns the shared ConsoleEmailProvider for "console"', () => {
    const consoleProvider = new ConsoleEmailProvider();
    const provider = selectEmailProvider(fakeConfig({ emailProvider: 'console' }), consoleProvider);
    expect(provider).toBe(consoleProvider);
  });

  it('builds an SmtpEmailProvider for "smtp"', () => {
    const config = fakeConfig({ emailProvider: 'smtp', smtpHost: '127.0.0.1', smtpPort: 1025 });
    const provider = selectEmailProvider(config, new ConsoleEmailProvider());
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it('builds a ResendEmailProvider for "resend"', () => {
    const config = fakeConfig({ emailProvider: 'resend', resendApiKey: 're_test_key' });
    const provider = selectEmailProvider(config, new ConsoleEmailProvider());
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });
});
