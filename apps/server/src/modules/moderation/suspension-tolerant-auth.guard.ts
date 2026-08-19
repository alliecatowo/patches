import { type Metadata } from '@grpc/grpc-js';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { User } from '@patches/database';
import { DataSource, IsNull } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { extractBearerToken } from '../auth/auth.guard.js';
import { setSessionClaims } from '../auth/session-context.js';
import { TokenService } from '../auth/token.service.js';

/**
 * `AuthGuard`'s twin for exactly the RPCs a suspended account must still be able to reach:
 * `ModerationService.ListMyModerationNotices` and every `AppealService` RPC (spec §201.2,
 * §201.3). A suspension is precisely the enforcement action being appealed — `AuthGuard`'s
 * blanket "a suspended account cannot call any authenticated RPC" (P6-004, spec §65) would
 * make the appeal mechanism unreachable for its single most common case, which defeats the
 * point of publishing an appeal window at all. Every other authenticated RPC keeps using the
 * real `AuthGuard` unchanged — this is a narrow, additive exception, not a relaxation of it.
 *
 * A **deleted** account is a different question this guard does not attempt to answer: once
 * `patches-admin user delete` sets `users.deleted_at`, the account and its access token are
 * already treated as gone everywhere else in this codebase (same `deleted_at IS NULL` filter
 * below), so there is no live session left to authenticate a ban notice through regardless —
 * a real gap, flagged in this task's report as a follow-up (out of scope: it would need a
 * grace-period-aware session check, and `apps/admin/src/commands/user.ts`'s soft-delete
 * semantics are outside this task's owned file set).
 */
@Injectable()
export class SuspensionTolerantAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const call = context.switchToRpc().getContext<Metadata>();
    const claims = await this.tokens.verifyAccessToken(requireBearerToken(call));

    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: claims.userId, deletedAt: IsNull() },
      select: { id: true, status: true },
    });
    if (user === null) {
      throw new AppError(
        'AUTH_SESSION_EXPIRED',
        'Your session is no longer valid. Please sign in again.',
      );
    }
    // Deliberately no `status === 'SUSPENDED'` check — see the class doc comment.

    setSessionClaims(call, claims);
    return true;
  }
}

// `auth.guard.ts` only exports `extractBearerToken` (its `requireBearerToken` wrapper is
// file-private) — this one-line re-wrap avoids reaching into another module's internals.
function requireBearerToken(call: Metadata | undefined): string {
  const token = extractBearerToken(call);
  if (token === undefined) {
    throw new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Authentication required: send an `authorization: Bearer <access token>` header.',
    );
  }
  return token;
}
