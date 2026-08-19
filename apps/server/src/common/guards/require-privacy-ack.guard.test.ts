import { Metadata } from '@grpc/grpc-js';
import { type ExecutionContext } from '@nestjs/common';
import { ActorPrivacyPrefs } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { setSessionClaims } from '../../modules/auth/session-context.js';
import { type AccessTokenClaims } from '../../modules/auth/token.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import { AppError } from '../errors/app-error.js';
import { RequirePrivacyAckGuard } from './require-privacy-ack.guard.js';

const CLAIMS: AccessTokenClaims = {
  userId: 'user-1',
  actorId: 'actor-1',
  sessionId: 'session-1',
  expiresAt: new Date(),
};

function contextWithClaims(claims: AccessTokenClaims | undefined): ExecutionContext {
  const metadata = new Metadata();
  if (claims !== undefined) setSessionClaims(metadata, claims);
  return {
    switchToRpc: () => ({ getContext: () => metadata }),
  } as unknown as ExecutionContext;
}

function dataSourceWithPrivacyNoticeVersion(version: number | null): DataSource {
  const findOne = vi
    .fn()
    .mockResolvedValue(version === null ? null : { privacyNoticeVersion: version });
  return {
    getRepository: (entity: unknown) => {
      if (entity !== ActorPrivacyPrefs) throw new Error('unexpected repository');
      return { findOne };
    },
  } as unknown as DataSource;
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'not-an-app-error';
  }
  return 'no-throw';
}

describe('RequirePrivacyAckGuard (P14 follow-up, spec §197.5, §197.6)', () => {
  it('is a no-op when REQUIRE_PRIVACY_ACK is false, regardless of acknowledgement state', async () => {
    const guard = new RequirePrivacyAckGuard(
      { requirePrivacyAck: false, privacyNoticeVersion: 3 } as AppConfigService,
      dataSourceWithPrivacyNoticeVersion(null),
    );
    await expect(guard.canActivate(contextWithClaims(CLAIMS))).resolves.toBe(true);
  });

  it('rejects with PRIVACY_NOTICE_NOT_ACKNOWLEDGED when enabled and no ack row exists', async () => {
    const guard = new RequirePrivacyAckGuard(
      { requirePrivacyAck: true, privacyNoticeVersion: 0 } as AppConfigService,
      dataSourceWithPrivacyNoticeVersion(null),
    );
    expect(await codeOf(() => guard.canActivate(contextWithClaims(CLAIMS)))).toBe(
      'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
    );
  });

  it('rejects when the ack on file is for an older version than the node currently publishes', async () => {
    const guard = new RequirePrivacyAckGuard(
      { requirePrivacyAck: true, privacyNoticeVersion: 2 } as AppConfigService,
      dataSourceWithPrivacyNoticeVersion(1),
    );
    expect(await codeOf(() => guard.canActivate(contextWithClaims(CLAIMS)))).toBe(
      'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
    );
  });

  it('allows the call once the ack on file matches the current version exactly', async () => {
    const guard = new RequirePrivacyAckGuard(
      { requirePrivacyAck: true, privacyNoticeVersion: 2 } as AppConfigService,
      dataSourceWithPrivacyNoticeVersion(2),
    );
    await expect(guard.canActivate(contextWithClaims(CLAIMS))).resolves.toBe(true);
  });

  it('allows the default node (version 0, ack at registration) once enabled', async () => {
    const guard = new RequirePrivacyAckGuard(
      { requirePrivacyAck: true, privacyNoticeVersion: 0 } as AppConfigService,
      dataSourceWithPrivacyNoticeVersion(0),
    );
    await expect(guard.canActivate(contextWithClaims(CLAIMS))).resolves.toBe(true);
  });

  it('throws AUTH_INVALID_CREDENTIALS if it somehow runs before AuthGuard set session claims', async () => {
    const guard = new RequirePrivacyAckGuard(
      { requirePrivacyAck: true, privacyNoticeVersion: 0 } as AppConfigService,
      dataSourceWithPrivacyNoticeVersion(0),
    );
    expect(await codeOf(() => guard.canActivate(contextWithClaims(undefined)))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
  });
});
