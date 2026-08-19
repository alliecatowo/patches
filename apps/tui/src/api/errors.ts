import { status as GrpcStatus } from '@grpc/grpc-js';

/**
 * A network failure translated into something a person can act on (spec §81).
 *
 * The TUI must never crash to a Node stack trace, and must never print one
 * either — `title` and `hint` are the only things a user ever sees.
 */
export interface FriendlyError {
  /** One short line: what went wrong. */
  title: string;
  /** One short line: what to do about it. Empty when there is nothing useful to say. */
  hint: string;
  /** Whether retrying the same call could plausibly succeed. */
  retryable: boolean;
  /** gRPC status code, shown only in the help/diagnostics view. */
  code: number;
}

interface GrpcMetadataLike {
  get: (key: string) => unknown;
}

interface GrpcLikeError {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  /** grpc-js `ServiceError.metadata` — the trailer `RpcExceptionsFilter` sets
   * `x-patches-error-code`/`x-request-id` on. */
  metadata?: unknown;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code } = error as GrpcLikeError;
  return typeof code === 'number' ? code : undefined;
}

/** Exposed for callers (e.g. `SessionManager`) that need to branch on the raw status. */
export function grpcStatusCode(error: unknown): number | undefined {
  return statusOf(error);
}

/** The application error code from `x-patches-error-code` response metadata
 * (`docs/architecture/api.md` §7), when the error carries one. */
function appErrorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { metadata } = error as GrpcLikeError;
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const { get } = metadata as GrpcMetadataLike;
  if (typeof get !== 'function') return undefined;
  const values: unknown = get.call(metadata, 'x-patches-error-code');
  const value = Array.isArray(values) ? (values[0] as unknown) : undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Buffer) return value.toString('utf8');
  return undefined;
}

/**
 * True when the server's `PUBLIC_READ=false` gate (owner decision, 2026-08-19: an
 * invite-only node gates posting, not reading, unless an operator opts into a fully closed
 * node) is what rejected this call — distinct from every other `UNAUTHENTICATED` failure.
 */
export function isSignInRequired(error: unknown): boolean {
  return appErrorCodeOf(error) === 'SIGN_IN_REQUIRED';
}

/** The server's own message, when it sent one worth showing. */
function serverMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { details, message } = error as GrpcLikeError;
  const text = typeof details === 'string' && details.length > 0 ? details : message;
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  // Guard against anything that looks like a stack trace leaking through.
  if (trimmed.length === 0 || trimmed.includes('\n    at ')) return undefined;
  return trimmed;
}

export interface DescribeGrpcErrorOptions {
  /**
   * Set when the call being described is `Login`/`Register` (or the TUI's inline
   * equivalent) — the server returns the same `UNAUTHENTICATED` for "wrong
   * password" as it does for "your session expired" (spec §57 deliberately does
   * not distinguish these to avoid leaking which handles exist), so only the
   * *caller* knows which copy is right (B-016).
   */
  context?: 'credentials' | undefined;
}

/**
 * Turn any thrown value into a message worth showing to a human.
 *
 * `target` is the server address, so "can't reach the server" says *which*
 * server — the single most useful piece of information when this happens.
 */
export function describeGrpcError(
  error: unknown,
  target: string,
  options?: DescribeGrpcErrorOptions,
): FriendlyError {
  const code = statusOf(error);
  const fromServer = serverMessage(error);

  switch (code) {
    case GrpcStatus.UNAVAILABLE:
      return {
        title: `Can't reach the Patches server at ${target}.`,
        hint: 'Check that it is running and that --server points at it.',
        retryable: true,
        code,
      };
    case GrpcStatus.DEADLINE_EXCEEDED:
      return {
        title: `${target} took too long to answer.`,
        hint: 'The server may be overloaded. Try again in a moment.',
        retryable: true,
        code,
      };
    case GrpcStatus.UNAUTHENTICATED:
      if (isSignInRequired(error)) {
        return {
          title: 'This node requires sign-in to read.',
          hint: 'Press L to log in.',
          retryable: false,
          code,
        };
      }
      if (options?.context === 'credentials') {
        return {
          title: 'Wrong handle/email or password.',
          hint: '',
          retryable: false,
          code,
        };
      }
      return {
        title: 'Your session is no longer valid.',
        hint: 'Sign in again to continue.',
        retryable: false,
        code,
      };
    case GrpcStatus.PERMISSION_DENIED:
      return {
        title: fromServer ?? 'You do not have permission to do that.',
        hint: '',
        retryable: false,
        code,
      };
    case GrpcStatus.FAILED_PRECONDITION:
      // The server writes actionable text here on purpose — the §83 client
      // version gate is the main source of it.
      return {
        title: fromServer ?? 'The server refused this request in its current state.',
        hint: '',
        retryable: false,
        code,
      };
    case GrpcStatus.RESOURCE_EXHAUSTED:
      return {
        title: 'You are going a bit fast for the server.',
        hint: 'Wait a few seconds and try again.',
        retryable: true,
        code,
      };
    case GrpcStatus.INVALID_ARGUMENT:
      return {
        title: fromServer ?? 'The server rejected that request.',
        hint: '',
        retryable: false,
        code,
      };
    case GrpcStatus.NOT_FOUND:
      return { title: fromServer ?? 'That no longer exists.', hint: '', retryable: false, code };
    case GrpcStatus.ALREADY_EXISTS:
      // e.g. HANDLE_TAKEN — the server's message names the field, so it wins over a generic one.
      return { title: fromServer ?? 'That is already taken.', hint: '', retryable: false, code };
    case GrpcStatus.UNIMPLEMENTED:
      return {
        title: `${target} does not support this feature.`,
        hint: 'It may be running an older version of Patches.',
        retryable: false,
        code,
      };
    case GrpcStatus.CANCELLED:
      return { title: 'Request cancelled.', hint: '', retryable: true, code };
    case GrpcStatus.INTERNAL:
    case GrpcStatus.UNKNOWN:
      return {
        title: 'The server hit an unexpected problem.',
        hint: fromServer ?? 'Try again; if it keeps happening, report it.',
        retryable: true,
        code,
      };
    default:
      break;
  }

  // Not a gRPC error at all: DNS failures, TLS handshake failures and bugs land
  // here. Still no stack trace.
  return {
    title: `Could not talk to ${target}.`,
    hint: fromServer ?? 'Check the address and your network connection.',
    retryable: true,
    code: code ?? GrpcStatus.UNKNOWN,
  };
}
