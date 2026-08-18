import { type Metadata } from '@grpc/grpc-js';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';
import { type AccessTokenClaims } from './token.service.js';

/**
 * Carries the authenticated session from {@link AuthGuard} to the controller method.
 *
 * A gRPC call has no request object to hang properties off, and mutating the `Metadata`
 * instance would put server-side state into a structure whose whole purpose is to hold
 * client-supplied headers. A `WeakMap` keyed by that same per-call `Metadata` object keeps
 * the association without touching it, and drops the entry as soon as the call is collected.
 */
const claimsByCall = new WeakMap<Metadata, AccessTokenClaims>();

export function setSessionClaims(call: Metadata, claims: AccessTokenClaims): void {
  claimsByCall.set(call, claims);
}

export function getSessionClaims(call: Metadata): AccessTokenClaims | undefined {
  return claimsByCall.get(call);
}

/**
 * Injects the authenticated {@link AccessTokenClaims} into a controller method. Only valid on
 * a method guarded by `AuthGuard`; without it there is nothing to inject and the call is
 * rejected rather than silently handed an anonymous session.
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const claims = getSessionClaims(context.switchToRpc().getContext<Metadata>());
    if (claims === undefined) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
    }
    return claims;
  },
);
