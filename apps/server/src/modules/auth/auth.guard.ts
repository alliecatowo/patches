import { type Metadata } from '@grpc/grpc-js';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';
import { setSessionClaims } from './session-context.js';
import { TokenService } from './token.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/**
 * Authenticates a gRPC call from its `authorization: Bearer <access token>` metadata
 * (spec §35).
 *
 * Verification is signature-and-claims only — no database read (see `TokenService`). The
 * guard therefore says nothing about whether the account still exists or is suspended; the
 * services that care re-check, and the 15-minute token lifetime bounds how long a revoked
 * account can keep using an already-issued token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const call = context.switchToRpc().getContext<Metadata>();
    const claims = await this.tokens.verifyAccessToken(readBearerToken(call));
    setSessionClaims(call, claims);
    return true;
  }
}

function readBearerToken(call: Metadata | undefined): string {
  const values = call?.get(AUTHORIZATION_METADATA_KEY) ?? [];
  const header = values[0];
  const raw = typeof header === 'string' ? header : header?.toString('utf8');

  if (raw === undefined || !raw.toLowerCase().startsWith(BEARER_PREFIX)) {
    throw new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Authentication required: send an `authorization: Bearer <access token>` header.',
    );
  }

  const token = raw.slice(BEARER_PREFIX.length).trim();
  if (token.length === 0) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return token;
}
