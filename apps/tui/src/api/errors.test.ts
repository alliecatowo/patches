import { Code } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { describeGrpcError, isPrivacyAckRequired, isSignInRequired } from './errors.js';

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
    const friendly = describeGrpcError(grpcError(Code.Unavailable), TARGET);

    expect(friendly.title).toContain(TARGET);
    expect(friendly.title).toContain("Can't reach");
    expect(friendly.retryable).toBe(true);
  });

  it('reports a timeout as a timeout', () => {
    const friendly = describeGrpcError(grpcError(Code.DeadlineExceeded), TARGET);
    expect(friendly.title).toContain('too long');
    expect(friendly.retryable).toBe(true);
  });

  it('passes the server through for FAILED_PRECONDITION, where the message is the point', () => {
    const message =
      'This Patches client (0.0.1) is too old for this server, which requires 0.1.0 or newer.';
    const friendly = describeGrpcError(grpcError(Code.FailedPrecondition, message), TARGET);

    expect(friendly.title).toBe(message);
    expect(friendly.retryable).toBe(false);
  });

  it('treats an expired session as non-retryable with a next step', () => {
    const friendly = describeGrpcError(grpcError(Code.Unauthenticated), TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.hint).toContain('Sign in');
  });

  it('recognises PUBLIC_READ=false rejections via the x-patches-error-code metadata (2026-08-19)', () => {
    const error = grpcErrorWithCode(Code.Unauthenticated, 'SIGN_IN_REQUIRED');
    expect(isSignInRequired(error)).toBe(true);
    expect(isSignInRequired(grpcError(Code.Unauthenticated))).toBe(false);

    const friendly = describeGrpcError(error, TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.title).toMatch(/requires sign-in to read/i);
    // TUI-only copy override (a web/RN client has no "L" key to press).
    expect(friendly.hint).toMatch(/press l/i);
  });

  it('surfaces ALREADY_EXISTS with the server message (e.g. HANDLE_TAKEN)', () => {
    const friendly = describeGrpcError(
      grpcError(Code.AlreadyExists, 'That handle is taken.'),
      TARGET,
    );
    expect(friendly.title).toBe('That handle is taken.');
    expect(friendly.retryable).toBe(false);
  });

  it('never surfaces a stack trace, even if the server sends one', () => {
    const leaky = 'boom\n    at Object.<anonymous> (/srv/app/main.js:1:1)';
    const friendly = describeGrpcError(grpcError(Code.Internal, leaky), TARGET);

    expect(friendly.title).not.toContain('    at ');
    expect(friendly.hint).not.toContain('    at ');
  });

  // Converged onto `@patches/client`'s `describeError` behaviour (ADR 0023 slice 9): a value
  // with no numeric `.code` at all becomes `Code.Unknown`, same as every other client, rather
  // than the TUI's old grpc-js-only "could not talk to the server" fallback copy.
  it('handles a plain Error (DNS or TLS failure) without a gRPC code as an unknown-error', () => {
    const friendly = describeGrpcError(new Error('getaddrinfo ENOTFOUND patches.local'), TARGET);

    expect(friendly.code).toBe(Code.Unknown);
    expect(friendly.retryable).toBe(true);
  });

  it('handles a thrown non-Error without crashing', () => {
    expect(() => describeGrpcError('nope', TARGET)).not.toThrow();
    expect(describeGrpcError(undefined, TARGET).code).toBe(Code.Unknown);
  });

  it('maps UNAUTHENTICATED on a credentials-context call (login/register) to a wrong-password message (B-016)', () => {
    const friendly = describeGrpcError(grpcError(Code.Unauthenticated), TARGET, {
      context: 'credentials',
    });
    expect(friendly.title).toBe('Wrong handle/email or password.');
    expect(friendly.retryable).toBe(false);
  });

  it('keeps the session-expired message for UNAUTHENTICATED outside a credentials context', () => {
    const friendly = describeGrpcError(grpcError(Code.Unauthenticated), TARGET);
    expect(friendly.title).toBe('Your session is no longer valid.');
  });

  // A-053 (spec §197.1, §197.5, §197.6): REQUIRE_PRIVACY_ACK's RequirePrivacyAckGuard
  // rejection routes the viewer toward :privacy instead of just repeating the server's raw
  // "must acknowledge" message — every caller of `describeGrpcError` only ever renders
  // `.title` (toasts, screen error rows), so the instruction has to live there.
  it('recognises PRIVACY_NOTICE_NOT_ACKNOWLEDGED via the x-patches-error-code metadata and points at :privacy', () => {
    const error = grpcErrorWithCode(Code.FailedPrecondition, 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED');
    expect(isPrivacyAckRequired(error)).toBe(true);
    expect(isPrivacyAckRequired(grpcError(Code.FailedPrecondition))).toBe(false);

    const friendly = describeGrpcError(error, TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.title).toMatch(/:privacy/);
    expect(friendly.title).not.toMatch(/^\s*$/);
  });
});

/**
 * ADR 0023 slice 2 (P10-008): `describeGrpcError`/`isSignInRequired`/`isPrivacyAckRequired` must
 * also accept a connect-es `ConnectError` — `.rawMessage` (no `[code]` prefix, preferred over
 * `.message`), numeric `.code` (gRPC `Status` and Connect `Code` are numerically identical for
 * 1–16, `docs/research/connect-es.md` §7), and a `Headers`-shaped `.metadata` whose `.get()`
 * returns a single string (or `null`), unlike grpc-js `Metadata.get()`'s array. No nominal
 * `ConnectError` import — these fakes are structurally shaped like one.
 */
function connectError(code: number, rawMessage = ''): unknown {
  return {
    name: 'ConnectError',
    code,
    rawMessage,
    message: rawMessage ? `[${code}] ${rawMessage}` : `[${code}]`,
  };
}

/** A minimal `Headers`-shaped fake, exactly as `ConnectError.metadata` carries
 * `x-patches-error-code` (`docs/research/connect-es.md` §9). */
function connectErrorWithCode(code: number, appErrorCode: string): unknown {
  const headers = new Headers();
  headers.set('x-patches-error-code', appErrorCode);
  return {
    name: 'ConnectError',
    code,
    rawMessage: '',
    message: `[${code}]`,
    metadata: headers,
  };
}

describe('describeGrpcError accepts a ConnectError (ADR 0023 slice 2)', () => {
  it('names the unreachable server for a ConnectError UNAVAILABLE', () => {
    const friendly = describeGrpcError(connectError(Code.Unavailable), TARGET);

    expect(friendly.title).toContain(TARGET);
    expect(friendly.title).toContain("Can't reach");
    expect(friendly.retryable).toBe(true);
  });

  it('reports a ConnectError DEADLINE_EXCEEDED as a timeout', () => {
    const friendly = describeGrpcError(connectError(Code.DeadlineExceeded), TARGET);
    expect(friendly.title).toContain('too long');
    expect(friendly.retryable).toBe(true);
  });

  it('recognises SIGN_IN_REQUIRED via a ConnectError Headers-shaped metadata', () => {
    const error = connectErrorWithCode(Code.Unauthenticated, 'SIGN_IN_REQUIRED');
    expect(isSignInRequired(error)).toBe(true);
    expect(isSignInRequired(connectError(Code.Unauthenticated))).toBe(false);

    const friendly = describeGrpcError(error, TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.title).toMatch(/requires sign-in to read/i);
    expect(friendly.hint).toMatch(/press l/i);
  });

  it('recognises PRIVACY_NOTICE_NOT_ACKNOWLEDGED via a ConnectError Headers-shaped metadata', () => {
    const error = connectErrorWithCode(Code.FailedPrecondition, 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED');
    expect(isPrivacyAckRequired(error)).toBe(true);
    expect(isPrivacyAckRequired(connectError(Code.FailedPrecondition))).toBe(false);

    const friendly = describeGrpcError(error, TARGET);
    expect(friendly.retryable).toBe(false);
    expect(friendly.title).toMatch(/:privacy/);
  });

  it('prefers rawMessage over the [code]-prefixed message for a ConnectError', () => {
    const friendly = describeGrpcError(
      connectError(Code.AlreadyExists, 'That handle is taken.'),
      TARGET,
    );
    expect(friendly.title).toBe('That handle is taken.');
    expect(friendly.retryable).toBe(false);
  });
});

describe('describeGrpcError never uses forbidden DM copy (spec §183.1)', () => {
  it('does not describe v0 DMs as encrypted, secure, or private', () => {
    for (const code of [
      Code.Unavailable,
      Code.DeadlineExceeded,
      Code.Unauthenticated,
      Code.PermissionDenied,
      Code.FailedPrecondition,
      Code.ResourceExhausted,
      Code.InvalidArgument,
      Code.NotFound,
      Code.AlreadyExists,
      Code.Unimplemented,
      Code.Canceled,
      Code.Internal,
      Code.Unknown,
    ]) {
      const friendly = describeGrpcError(grpcError(code), TARGET);
      const text = `${friendly.title} ${friendly.hint}`.toLowerCase();
      expect(text).not.toMatch(/encrypt|secure|private/);
    }
  });
});
