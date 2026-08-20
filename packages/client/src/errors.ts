import { Code, ConnectError } from '@connectrpc/connect';

/**
 * A network/RPC failure translated into something a person can act on (spec §81),
 * ported from `apps/tui/src/api/errors.ts` so every client (TUI, web, RN) shows the
 * same copy for the same failure (ADR 0016 §9). gRPC status codes and Connect `Code`
 * are numerically identical for 1–16 (`docs/research/connect-es.md` §7), so this is a
 * straight port of the switch, not a reinterpretation.
 */
export interface DescribedError {
  /** One short line: what went wrong. */
  readonly title: string;
  /** One short line: what to do about it. Empty when there is nothing useful to say. */
  readonly hint: string;
  /** `title`, plus `hint` when non-empty — always `combine(title, hint)`. */
  readonly message: string;
  /** Whether retrying the same call could plausibly succeed. */
  readonly retryable: boolean;
  /** Connect status code, shown only in a diagnostics/help view. */
  readonly code: Code;
}

/**
 * Copy for the handful of cases that name a client-specific affordance — "press L to log
 * in" means nothing on the web, and a terminal has no Settings menu. Every other case's
 * copy is shared verbatim across clients (ADR 0016 §9); these are the only slots a caller
 * may override. Omit a field to keep `describeError`'s generic default.
 */
export interface DescribeErrorCopyOverrides {
  /** `UNAVAILABLE` hint — how to check the server is reachable. */
  unavailableHint?: string | undefined;
  /** `UNAUTHENTICATED`-because-`SIGN_IN_REQUIRED` hint — how to sign in. */
  signInRequiredHint?: string | undefined;
  /** Privacy-ack-required title — where to go acknowledge it. */
  privacyAckTitle?: string | undefined;
  /** Privacy-ack-required hint — what acknowledging does and doesn't do. */
  privacyAckHint?: string | undefined;
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
  /** Client-specific overrides for the copy slots that name a client affordance. */
  copy?: DescribeErrorCopyOverrides | undefined;
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

/**
 * A-053 (spec §197.1, §197.5): true when a write RPC (`CreatePost`, `SendMessage`,
 * `FollowActor`, …) was rejected because this node has `REQUIRE_PRIVACY_ACK=true` and this
 * actor hasn't acknowledged the node's *current* `privacy_notice_version` yet — including an
 * actor who acknowledged an older version, since a version bump means the text changed
 * (`RequirePrivacyAckGuard`, spec §197.6). Same shape as `isSignInRequired` above.
 */
export function isPrivacyAckRequired(error: unknown): boolean {
  return (
    ConnectError.from(error).metadata.get('x-patches-error-code') ===
    'PRIVACY_NOTICE_NOT_ACKNOWLEDGED'
  );
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
  const copy = options?.copy;

  function result(title: string, hint: string, retryable: boolean): DescribedError {
    return { title, hint, message: combine(title, hint), retryable, code };
  }

  switch (code) {
    case Code.Unavailable:
      return result(
        `Can't reach the Patches server at ${target}.`,
        copy?.unavailableHint ?? 'Check that it is running and reachable.',
        true,
      );
    case Code.DeadlineExceeded:
      return result(
        `${target} took too long to answer.`,
        'The server may be overloaded. Try again in a moment.',
        true,
      );
    case Code.Unauthenticated:
      if (isSignInRequired(connectError)) {
        return result(
          'This node requires sign-in to read.',
          copy?.signInRequiredHint ?? 'Sign in or create an account to continue.',
          false,
        );
      }
      if (options?.context === 'credentials') {
        return result('Wrong handle/email or password.', '', false);
      }
      return result('Your session is no longer valid.', 'Sign in again to continue.', false);
    case Code.PermissionDenied:
      return result(fromServer ?? 'You do not have permission to do that.', '', false);
    case Code.FailedPrecondition:
      // A-053: gets its own copy — the actionable step (go acknowledge the notice) is
      // more useful than the server's raw "must acknowledge this node's current privacy
      // notice" message, and it needs to name where to go since there's no generic
      // "hint" surface every caller renders.
      if (isPrivacyAckRequired(connectError)) {
        return result(
          copy?.privacyAckTitle ??
            "This node's privacy notice changed — review and acknowledge it.",
          copy?.privacyAckHint ?? 'Go to Settings → Privacy.',
          false,
        );
      }
      // The server writes actionable text here on purpose — the §83 client version
      // gate is the main source of it.
      return result(
        fromServer ?? 'The server refused this request in its current state.',
        '',
        false,
      );
    case Code.ResourceExhausted:
      return result(
        'You are going a bit fast for the server.',
        'Wait a few seconds and try again.',
        true,
      );
    case Code.InvalidArgument:
      return result(fromServer ?? 'The server rejected that request.', '', false);
    case Code.NotFound:
      return result(fromServer ?? 'That no longer exists.', '', false);
    case Code.AlreadyExists:
      // e.g. HANDLE_TAKEN — the server's message names the field, so it wins over a generic one.
      return result(fromServer ?? 'That is already taken.', '', false);
    case Code.Unimplemented:
      return result(
        `${target} does not support this feature.`,
        'It may be running an older version of Patches.',
        false,
      );
    case Code.Canceled:
      return result('Request cancelled.', '', true);
    case Code.Internal:
    case Code.Unknown:
      return result(
        'The server hit an unexpected problem.',
        fromServer ?? 'Try again; if it keeps happening, report it.',
        true,
      );
    default:
      // DataLoss, OutOfRange, Aborted and anything else not given specific copy above.
      return result(
        `Could not talk to ${target}.`,
        fromServer ?? 'Check the address and your network connection.',
        true,
      );
  }
}
