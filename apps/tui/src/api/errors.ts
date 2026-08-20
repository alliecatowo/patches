import { Code, ConnectError } from '@connectrpc/connect';
import {
  describeError,
  type DescribeErrorCopyOverrides,
  isPrivacyAckRequired as clientIsPrivacyAckRequired,
  isSignInRequired as clientIsSignInRequired,
} from '@patches/client';

/**
 * A network failure translated into something a person can act on (spec §81).
 *
 * The TUI must never crash to a Node stack trace, and must never print one
 * either — `title` and `hint` are the only things a user ever sees.
 *
 * This is a thin terminal-specific adapter over `@patches/client`'s
 * `describeError` (ADR 0023 slice 9) — the copy itself lives in one place so
 * every client (TUI, web, RN) shows the same words for the same failure
 * (ADR 0016 §9). Only the handful of cases that name a terminal affordance
 * ("press L", "press :privacy") are overridden here via `DescribeErrorCopyOverrides`.
 */
export interface FriendlyError {
  /** One short line: what went wrong. */
  title: string;
  /** One short line: what to do about it. Empty when there is nothing useful to say. */
  hint: string;
  /** Whether retrying the same call could plausibly succeed. */
  retryable: boolean;
  /** gRPC/Connect status code, shown only in the help/diagnostics view. */
  code: number;
}

interface GrpcMetadataLike {
  get: (key: string) => unknown;
}

interface GrpcLikeError {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  /** `ConnectError.rawMessage` (connect-es) — the message with no `[code]` prefix. Preferred
   * over `.message`/`.details` when present, since a `ConnectError`'s `.message` is
   * `"[code] rawMessage"` (`docs/research/connect-es.md` §9). */
  rawMessage?: unknown;
  /** grpc-js `ServiceError.metadata` (a `Metadata`, `.get()` → array) or `ConnectError.metadata`
   * (a `Headers`, `.get()` → string | null) — the trailer `RpcExceptionsFilter` sets
   * `x-patches-error-code`/`x-request-id` on. Both shapes satisfy `GrpcMetadataLike`. */
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
  // `Headers.get` (ConnectError.metadata) returns a single string (or null) directly;
  // grpc-js `Metadata.get` (ServiceError.metadata) returns an array of values.
  if (typeof values === 'string') return values.length > 0 ? values : undefined;
  const value = Array.isArray(values) ? (values[0] as unknown) : undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Buffer) return value.toString('utf8');
  return undefined;
}

/** The server's raw message text, preferring `rawMessage` (connect-es) over `details`/`message`
 * (grpc-js) — no stack-trace guard here, `@patches/client`'s `describeError` already applies one
 * to whatever ends up as `ConnectError.rawMessage`. */
function extractMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const { rawMessage, details, message } = error as GrpcLikeError;
  if (typeof rawMessage === 'string' && rawMessage.length > 0) return rawMessage;
  if (typeof details === 'string' && details.length > 0) return details;
  return typeof message === 'string' ? message : '';
}

/**
 * Normalise anything `describeGrpcError` might see — a real `ConnectError`, or a
 * grpc-js-shaped `ServiceError` still reachable while P10-015 finishes removing
 * `@grpc/grpc-js` from the rest of the TUI — into a real `ConnectError`, so
 * `@patches/client`'s `describeError` (which only understands `ConnectError`) sees a
 * consistent shape. A value that's already a `ConnectError` (connect-es's own
 * structural `instanceof`) passes through untouched.
 */
function toConnectError(error: unknown): ConnectError {
  if (error instanceof ConnectError) return error;
  const code = statusOf(error);
  const appErrorCode = appErrorCodeOf(error);
  return new ConnectError(
    extractMessage(error),
    code ?? Code.Unknown,
    appErrorCode === undefined ? undefined : { 'x-patches-error-code': appErrorCode },
    undefined,
    error,
  );
}

/**
 * True when the server's `PUBLIC_READ=false` gate (owner decision, 2026-08-19: an
 * invite-only node gates posting, not reading, unless an operator opts into a fully closed
 * node) is what rejected this call — distinct from every other `UNAUTHENTICATED` failure.
 */
export function isSignInRequired(error: unknown): boolean {
  return clientIsSignInRequired(toConnectError(error));
}

/**
 * A-053 (spec §197.1, §197.5): true when a write RPC (`CreatePost`, `SendMessage`,
 * `FollowActor`, …) was rejected because this node has `REQUIRE_PRIVACY_ACK=true` and this
 * actor hasn't acknowledged the node's *current* `privacy_notice_version` yet — including an
 * actor who acknowledged an older version, since a version bump means the text changed
 * (`RequirePrivacyAckGuard`, spec §197.6). Exposed the same way `isSignInRequired` is, so a
 * caller that needs to branch on this specifically (rather than just showing
 * `describeGrpcError`'s title) can.
 */
export function isPrivacyAckRequired(error: unknown): boolean {
  return clientIsPrivacyAckRequired(toConnectError(error));
}

/**
 * The terminal-specific copy — every other case's copy is shared verbatim with every other
 * client via `@patches/client`'s `describeError` (ADR 0016 §9). "Press L" and "press :privacy"
 * name TUI-only affordances a web/RN client doesn't have.
 */
const TUI_COPY: DescribeErrorCopyOverrides = {
  unavailableHint: 'Check that it is running and that --server points at it.',
  signInRequiredHint: 'Press L to log in.',
  // A-053: every caller of `describeGrpcError` renders `.title` alone (toasts, screen error
  // rows) — verified against every call site in `apps/tui/src` — so the actionable instruction
  // has to live in `title`, not `hint`, unlike the generic default copy.
  privacyAckTitle:
    'This node’s privacy notice changed — press :privacy to review and acknowledge it.',
  privacyAckHint: 'Acknowledging only records that you saw the text; it grants nothing else.',
};

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
  const described = describeError(toConnectError(error), {
    context: options?.context,
    target,
    copy: TUI_COPY,
  });
  return {
    title: described.title,
    hint: described.hint,
    retryable: described.retryable,
    code: described.code,
  };
}
