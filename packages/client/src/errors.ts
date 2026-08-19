import { Code, ConnectError } from '@connectrpc/connect';

/**
 * A network/RPC failure translated into something a person can act on (spec §81),
 * ported from `apps/tui/src/api/errors.ts` so every client (TUI, web, RN) shows the
 * same copy for the same failure (ADR 0016 §9). gRPC status codes and Connect `Code`
 * are numerically identical for 1–16 (`docs/research/connect-es.md` §7), so this is a
 * straight port of the switch, not a reinterpretation.
 */
export interface DescribedError {
  /** One short line: what went wrong, plus what to do about it when there's a hint. */
  readonly message: string;
  /** Whether retrying the same call could plausibly succeed. */
  readonly retryable: boolean;
  /** Connect status code, shown only in a diagnostics/help view. */
  readonly code: Code;
}

export interface DescribeErrorOptions {
  /**
   * Set when the call being described is `Login`/`Register` (or a client's inline
   * equivalent) — the server returns the same `UNAUTHENTICATED` for "wrong password" as
   * it does for "your session expired" (spec §57 deliberately does not distinguish
   * these, to avoid leaking which handles exist), so only the *caller* knows which copy
   * is right (B-016).
   */
  context?: 'credentials' | undefined;
  /** Server address/origin, shown in the "can't reach the server" copy when known. */
  target?: string | undefined;
}

/**
 * True when the server's `PUBLIC_READ=false` gate (owner decision, 2026-08-19: an
 * invite-only node gates posting, not reading, unless an operator opts into a fully closed
 * node) is what rejected this call — distinct from every other `Code.Unauthenticated` failure,
 * which `describeError` already tells apart via `options.context === 'credentials'`. The
 * application error code travels in the `x-patches-error-code` response metadata
 * (`RpcExceptionsFilter`, `docs/architecture/api.md` §7); connect-es unions response
 * headers/trailers into `ConnectError.metadata` regardless of transport
 * (`docs/research/connect-es.md` §9). Exposed separately from `describeError` so a route can
 * render a dedicated sign-in prompt instead of (or in addition to) the generic message.
 */
export function isSignInRequired(error: unknown): boolean {
  return ConnectError.from(error).metadata.get('x-patches-error-code') === 'SIGN_IN_REQUIRED';
}

/** The server's own message, when it sent one worth showing. */
function serverMessage(error: ConnectError): string | undefined {
  const trimmed = error.rawMessage.trim();
  // Guard against anything that looks like a stack trace leaking through.
  if (trimmed.length === 0 || trimmed.includes('\n    at ')) return undefined;
  return trimmed;
}

function combine(title: string, hint?: string): string {
  return hint === undefined || hint.length === 0 ? title : `${title} ${hint}`;
}

/**
 * Turn any thrown value into a message worth showing to a human. Never returns a raw
 * stack trace (spec §81, `apps/tui/src/api/errors.ts`'s own rule).
 */
export function describeError(error: unknown, options?: DescribeErrorOptions): DescribedError {
  const connectError = ConnectError.from(error);
  const code = connectError.code;
  const fromServer = serverMessage(connectError);
  const target = options?.target ?? 'the server';

  switch (code) {
    case Code.Unavailable:
      return {
        message: combine(
          `Can't reach the Patches server at ${target}.`,
          'Check that it is running and reachable.',
        ),
        retryable: true,
        code,
      };
    case Code.DeadlineExceeded:
      return {
        message: combine(
          `${target} took too long to answer.`,
          'The server may be overloaded. Try again in a moment.',
        ),
        retryable: true,
        code,
      };
    case Code.Unauthenticated:
      if (isSignInRequired(connectError)) {
        return {
          message: combine(
            'This node requires sign-in to read.',
            'Sign in or create an account to continue.',
          ),
          retryable: false,
          code,
        };
      }
      if (options?.context === 'credentials') {
        return { message: 'Wrong handle/email or password.', retryable: false, code };
      }
      return {
        message: combine('Your session is no longer valid.', 'Sign in again to continue.'),
        retryable: false,
        code,
      };
    case Code.PermissionDenied:
      return {
        message: fromServer ?? 'You do not have permission to do that.',
        retryable: false,
        code,
      };
    case Code.FailedPrecondition:
      // The server writes actionable text here on purpose — the §83 client version
      // gate is the main source of it.
      return {
        message: fromServer ?? 'The server refused this request in its current state.',
        retryable: false,
        code,
      };
    case Code.ResourceExhausted:
      return {
        message: combine(
          'You are going a bit fast for the server.',
          'Wait a few seconds and try again.',
        ),
        retryable: true,
        code,
      };
    case Code.InvalidArgument:
      return { message: fromServer ?? 'The server rejected that request.', retryable: false, code };
    case Code.NotFound:
      return { message: fromServer ?? 'That no longer exists.', retryable: false, code };
    case Code.AlreadyExists:
      // e.g. HANDLE_TAKEN — the server's message names the field, so it wins over a generic one.
      return { message: fromServer ?? 'That is already taken.', retryable: false, code };
    case Code.Unimplemented:
      return {
        message: combine(
          `${target} does not support this feature.`,
          'It may be running an older version of Patches.',
        ),
        retryable: false,
        code,
      };
    case Code.Canceled:
      return { message: 'Request cancelled.', retryable: true, code };
    case Code.Internal:
    case Code.Unknown:
      return {
        message: combine(
          'The server hit an unexpected problem.',
          fromServer ?? 'Try again; if it keeps happening, report it.',
        ),
        retryable: true,
        code,
      };
    default:
      // DataLoss, OutOfRange, Aborted and anything else not given specific copy above.
      return {
        message: combine(
          `Could not talk to ${target}.`,
          fromServer ?? 'Check the address and your network connection.',
        ),
        retryable: true,
        code,
      };
  }
}
