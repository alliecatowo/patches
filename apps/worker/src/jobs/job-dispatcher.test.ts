import { describe, expect, it } from 'vitest';
import type { JobType } from '@patches/database';

import { type JobContext, type JobHandler } from './job-handler.js';
import { JobDispatcher } from './job-dispatcher.js';
import type { CleanExpiredNotificationsHandler } from './handlers/clean-expired-notifications.handler.js';
import type { CleanExpiredTokensHandler } from './handlers/clean-expired-tokens.handler.js';
import type { CleanExpiredUploadsHandler } from './handlers/clean-expired-uploads.handler.js';
import type { ExportAccountHandler } from './handlers/export-account.handler.js';
import type { FederationDeliverHandler } from './handlers/federation-deliver.handler.js';
import type { ProcessMediaHandler } from './handlers/process-media.handler.js';
import type { PurgeAccountHandler } from './handlers/purge-account.handler.js';
import type { RotateE2eeFrankingKeyHandler } from './handlers/rotate-e2ee-franking-key.handler.js';
import type { E2eeRetentionSweepHandler } from './handlers/e2ee-retention-sweep.handler.js';
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
    const cleanExpiredNotifications = fakeHandler('CLEAN_EXPIRED_NOTIFICATIONS');
    const processMedia = fakeHandler('PROCESS_MEDIA');
    const cleanExpiredUploads = fakeHandler('CLEAN_EXPIRED_UPLOADS');
    const federationDeliver = fakeHandler('FEDERATION_DELIVER');
    const exportAccount = fakeHandler('EXPORT_ACCOUNT');
    const purgeAccount = fakeHandler('PURGE_ACCOUNT');
    const rotateE2eeFrankingKey = fakeHandler('E2EE_ROTATE_FRANKING_KEY');
    const e2eeRetentionSweep = fakeHandler('E2EE_RETENTION_SWEEP');

    const dispatcher = new JobDispatcher(
      sendVerificationEmail as SendVerificationEmailHandler,
      sendPasswordResetEmail as SendPasswordResetEmailHandler,
      cleanExpiredTokens as CleanExpiredTokensHandler,
      cleanExpiredNotifications as CleanExpiredNotificationsHandler,
      processMedia as ProcessMediaHandler,
      cleanExpiredUploads as CleanExpiredUploadsHandler,
      federationDeliver as FederationDeliverHandler,
      exportAccount as ExportAccountHandler,
      purgeAccount as PurgeAccountHandler,
      rotateE2eeFrankingKey as RotateE2eeFrankingKeyHandler,
      e2eeRetentionSweep as E2eeRetentionSweepHandler,
    );

    expect(dispatcher.find('SEND_VERIFICATION_EMAIL')).toBe(sendVerificationEmail);
    expect(dispatcher.find('SEND_PASSWORD_RESET_EMAIL')).toBe(sendPasswordResetEmail);
    expect(dispatcher.find('CLEAN_EXPIRED_TOKENS')).toBe(cleanExpiredTokens);
    expect(dispatcher.find('CLEAN_EXPIRED_NOTIFICATIONS')).toBe(cleanExpiredNotifications);
    expect(dispatcher.find('PROCESS_MEDIA')).toBe(processMedia);
    expect(dispatcher.find('CLEAN_EXPIRED_UPLOADS')).toBe(cleanExpiredUploads);
    expect(dispatcher.find('FEDERATION_DELIVER')).toBe(federationDeliver);
    expect(dispatcher.find('EXPORT_ACCOUNT')).toBe(exportAccount);
    expect(dispatcher.find('PURGE_ACCOUNT')).toBe(purgeAccount);
    expect(dispatcher.find('E2EE_ROTATE_FRANKING_KEY')).toBe(rotateE2eeFrankingKey);
    expect(dispatcher.find('E2EE_RETENTION_SWEEP')).toBe(e2eeRetentionSweep);
  });

  it('returns undefined for a type unknown to the dispatcher', () => {
    const dispatcher = new JobDispatcher(
      fakeHandler('SEND_VERIFICATION_EMAIL') as SendVerificationEmailHandler,
      fakeHandler('SEND_PASSWORD_RESET_EMAIL') as SendPasswordResetEmailHandler,
      fakeHandler('CLEAN_EXPIRED_TOKENS') as CleanExpiredTokensHandler,
      fakeHandler('CLEAN_EXPIRED_NOTIFICATIONS') as CleanExpiredNotificationsHandler,
      fakeHandler('PROCESS_MEDIA') as ProcessMediaHandler,
      fakeHandler('CLEAN_EXPIRED_UPLOADS') as CleanExpiredUploadsHandler,
      fakeHandler('FEDERATION_DELIVER') as FederationDeliverHandler,
      fakeHandler('EXPORT_ACCOUNT') as ExportAccountHandler,
      fakeHandler('PURGE_ACCOUNT') as PurgeAccountHandler,
      fakeHandler('E2EE_ROTATE_FRANKING_KEY') as RotateE2eeFrankingKeyHandler,
      fakeHandler('E2EE_RETENTION_SWEEP') as E2eeRetentionSweepHandler,
    );

    expect(dispatcher.find('SOMETHING_UNKNOWN')).toBeUndefined();
  });
});
