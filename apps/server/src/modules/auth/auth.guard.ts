import { type Metadata } from '@grpc/grpc-js';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { User } from '@patches/database';
import { DataSource, IsNull } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { setSessionClaims } from './session-context.js';
import { TokenService } from './token.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/**
 * Authenticates a gRPC call from its `authorization: Bearer <access token>` metadata
 * (spec §35).
 *
 * Signature-and-claims verification (see `TokenService`) is what proves the token is
 * genuine and unexpired; a single indexed read of `users.status` on top of that is what
 * makes a `patches-admin user suspend` (P6-004, spec §65) take effect on the caller's very
 * next request rather than waiting up to `ACCESS_TOKEN_TTL` for the token to expire on its
 * own. `AUTH_SESSION_EXPIRED` covers the account having been deleted out from under an
 * already-issued token; `ACCOUNT_SUSPENDED` is its own code (`PERMISSION_DENIED`) precisely
 * so a client that already has a valid session can tell the two apart — this is not the
 * unauthenticated login path, so §166's no-enumeration rule does not apply here.
 */
@Injectable()
export class AuthGuard implements CanActivate {
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
    if (user.status === 'SUSPENDED') {
      throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.');
    }

    setSessionClaims(call, claims);
    return true;
  }
}

/** `undefined` when no bearer token is present — the "soft auth" case a handful of RPCs need
 * (e.g. `BeginGitHubLogin`, which behaves differently for an authenticated caller linking an
 * account vs. an anonymous one logging in, spec §167, but must not require the guard). */
export function extractBearerToken(call: Metadata | undefined): string | undefined {
  const values = call?.get(AUTHORIZATION_METADATA_KEY) ?? [];
  const header = values[0];
  const raw = typeof header === 'string' ? header : header?.toString('utf8');
  if (raw === undefined || !raw.toLowerCase().startsWith(BEARER_PREFIX)) return undefined;

  const token = raw.slice(BEARER_PREFIX.length).trim();
  return token.length === 0 ? undefined : token;
}

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
