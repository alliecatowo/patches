import { type Metadata } from '@grpc/grpc-js';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AccountDeletionRequest, User } from '@patches/database';
import { DataSource, IsNull, MoreThan } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { extractBearerToken } from '../auth/auth.guard.js';
import { setSessionClaims } from '../auth/session-context.js';
import { TokenService } from '../auth/token.service.js';

/**
 * `AuthGuard`'s twin for exactly the RPCs a suspended or grace-period-deleted account must
 * still be able to reach: `ModerationService.ListMyModerationNotices` and every `AppealService`
 * RPC (spec §201.2, §201.3). A suspension — and, per P14 follow-up, an admin-initiated deletion
 * still inside its `account_deletion_requests` grace period — is precisely the enforcement
 * action being appealed; `AuthGuard`'s blanket "a suspended/deleted account cannot call any
 * authenticated RPC" (P6-004, spec §65) would make the appeal mechanism unreachable for its
 * most common case, which defeats the point of publishing an appeal window at all. Every other
 * authenticated RPC keeps using the real `AuthGuard` unchanged — this is a narrow, additive
 * exception, not a relaxation of it.
 *
 * Once the grace period lapses (`purgeAfter` passed, or the request was cancelled/already
 * purged) the account is treated as fully gone, same as before: no live session survives
 * `patches-admin user delete`'s eventual purge, and there is nothing left to appeal a ban
 * notice through regardless.
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
      where: { id: claims.userId },
      select: { id: true, status: true, actorId: true, deletedAt: true },
    });
    if (
      user === null ||
      (user.deletedAt !== null && !(await this.withinDeletionGrace(user.actorId)))
    ) {
      throw new AppError(
        'AUTH_SESSION_EXPIRED',
        'Your session is no longer valid. Please sign in again.',
      );
    }
    // Deliberately no `status === 'SUSPENDED'` check — see the class doc comment.

    setSessionClaims(call, claims);
    return true;
  }

  /** True while `actorId`'s deletion is still reversible: a row exists, it was neither
   * cancelled nor already purged, and its grace period (`purgeAfter`) has not yet elapsed. */
  private async withinDeletionGrace(actorId: string): Promise<boolean> {
    const pending = await this.dataSource.getRepository(AccountDeletionRequest).findOne({
      where: {
        actorId,
        cancelledAt: IsNull(),
        purgedAt: IsNull(),
        purgeAfter: MoreThan(new Date()),
      },
      select: { actorId: true },
    });
    return pending !== null;
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
