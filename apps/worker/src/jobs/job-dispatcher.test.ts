import { describe, expect, it } from 'vitest';
import type { JobType } from '@patches/database';

import { type JobContext, type JobHandler } from './job-handler.js';
import { JobDispatcher } from './job-dispatcher.js';
import type { CleanExpiredTokensHandler } from './handlers/clean-expired-tokens.handler.js';
import type { SendPasswordResetEmailHandler } from './handlers/send-password-reset-email.handler.js';
import type { SendVerificationEmailHandler } from './handlers/send-verification-email.handler.js';

function fakeHandler(type: JobType): JobHandler {
  return {
    type,
    handle: async (_payload: unknown, _ctx: JobContext) => Promise.resolve(),
  };
}

describe('JobDispatcher', () => {
  it('routes each registered job type to its handler', () => {
    const sendVerificationEmail = fakeHandler('SEND_VERIFICATION_EMAIL');
    const sendPasswordResetEmail = fakeHandler('SEND_PASSWORD_RESET_EMAIL');
    const cleanExpiredTokens = fakeHandler('CLEAN_EXPIRED_TOKENS');

    const dispatcher = new JobDispatcher(
      sendVerificationEmail as SendVerificationEmailHandler,
      sendPasswordResetEmail as SendPasswordResetEmailHandler,
      cleanExpiredTokens as CleanExpiredTokensHandler,
    );

    expect(dispatcher.find('SEND_VERIFICATION_EMAIL')).toBe(sendVerificationEmail);
    expect(dispatcher.find('SEND_PASSWORD_RESET_EMAIL')).toBe(sendPasswordResetEmail);
    expect(dispatcher.find('CLEAN_EXPIRED_TOKENS')).toBe(cleanExpiredTokens);
  });

  it('returns undefined for an unregistered type (PROCESS_MEDIA, CLEAN_EXPIRED_UPLOADS)', () => {
    const dispatcher = new JobDispatcher(
      fakeHandler('SEND_VERIFICATION_EMAIL') as SendVerificationEmailHandler,
      fakeHandler('SEND_PASSWORD_RESET_EMAIL') as SendPasswordResetEmailHandler,
      fakeHandler('CLEAN_EXPIRED_TOKENS') as CleanExpiredTokensHandler,
    );

    expect(dispatcher.find('PROCESS_MEDIA')).toBeUndefined();
    expect(dispatcher.find('CLEAN_EXPIRED_UPLOADS')).toBeUndefined();
    expect(dispatcher.find('SOMETHING_UNKNOWN')).toBeUndefined();
  });
});
