import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';

import { describeGrpcError, isSignInRequired } from './errors.js';

const TARGET = 'patches.local:50051';

function grpcError(code: number, details = ''): unknown {
  return Object.assign(new Error(details), { code, details });
}

/** A minimal grpc-js `Metadata`-shaped fake carrying a single `x-patches-error-code` entry,
 * exactly as `RpcExceptionsFilter` sets it (`docs/architecture/api.md` §7). */
function grpcErrorWithCode(code: number, appErrorCode: string): unknown {
  return Object.assign(new Error(''), {
    code,
    details: '',
    metadata: { get: (key: string) => (key === 'x-patches-error-code' ? [appErrorCode] : []) },
  });
}

describe('describeGrpcError (spec §81)', () => {
  it('names the unreachable server so the user knows what to fix', () => {
    const friendly = describeGrpcError(grpcError(GrpcStatus.UNAVAILABLE), TARGET);

    expect(friendly.title).toContain(TARGET);
    expect(friendly.title).toContain("Can't reach");
    expect(friendly.retryable).toBe(true);
  });

  it('reports a timeout as a timeout', () => {
    const friendly = describeGrpcError(grpcError(GrpcStatus.DEADLINE_EXCEEDED), TARGET);
    expect(friendly.title).toContain('too long');
    expect(friendly.retryable).toBe(true);
  });

  it('passes the server through for FAILED_PRECONDITION, where the message is the point', () => {
    const message =
      'This Patches client (0.0.1) is too old for this server, which requires 0.1.0 or newer.';
    const friendly = describeGrpcError(grpcError(GrpcStatus.FAILED_PRECONDITION, message), TARGET);

    expect(friendly.title).toBe(message);
    expect(friendly.retryable).toBe(false);
  });

  it('treats an expired session as non-retryable with a next step', () => {
    const friendly = describeGrpcError(grpcError(GrpcStatus.UNAUTHENTICATED), TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.hint).toContain('Sign in');
  });

  it('recognises PUBLIC_READ=false rejections via the x-patches-error-code metadata (2026-08-19)', () => {
    const error = grpcErrorWithCode(GrpcStatus.UNAUTHENTICATED, 'SIGN_IN_REQUIRED');
    expect(isSignInRequired(error)).toBe(true);
    expect(isSignInRequired(grpcError(GrpcStatus.UNAUTHENTICATED))).toBe(false);

    const friendly = describeGrpcError(error, TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.title).toMatch(/requires sign-in to read/i);
    expect(friendly.hint).toMatch(/press l/i);
  });

  it('surfaces ALREADY_EXISTS with the server message (e.g. HANDLE_TAKEN)', () => {
    const friendly = describeGrpcError(
      grpcError(GrpcStatus.ALREADY_EXISTS, 'That handle is taken.'),
      TARGET,
    );
    expect(friendly.title).toBe('That handle is taken.');
    expect(friendly.retryable).toBe(false);
  });

  it('never surfaces a stack trace, even if the server sends one', () => {
    const leaky = 'boom\n    at Object.<anonymous> (/srv/app/main.js:1:1)';
    const friendly = describeGrpcError(grpcError(GrpcStatus.INTERNAL, leaky), TARGET);

    expect(friendly.title).not.toContain('    at ');
    expect(friendly.hint).not.toContain('    at ');
  });

  it('handles a plain Error (DNS or TLS failure) without a gRPC code', () => {
    const friendly = describeGrpcError(new Error('getaddrinfo ENOTFOUND patches.local'), TARGET);

    expect(friendly.title).toContain(TARGET);
    expect(friendly.code).toBe(GrpcStatus.UNKNOWN);
  });

  it('handles a thrown non-Error without crashing', () => {
    expect(() => describeGrpcError('nope', TARGET)).not.toThrow();
    expect(describeGrpcError(undefined, TARGET).title).toContain(TARGET);
  });

  it('maps UNAUTHENTICATED on a credentials-context call (login/register) to a wrong-password message (B-016)', () => {
    const friendly = describeGrpcError(grpcError(GrpcStatus.UNAUTHENTICATED), TARGET, {
      context: 'credentials',
    });
    expect(friendly.title).toBe('Wrong handle/email or password.');
    expect(friendly.retryable).toBe(false);
  });

  it('keeps the session-expired message for UNAUTHENTICATED outside a credentials context', () => {
    const friendly = describeGrpcError(grpcError(GrpcStatus.UNAUTHENTICATED), TARGET);
    expect(friendly.title).toBe('Your session is no longer valid.');
  });
});
