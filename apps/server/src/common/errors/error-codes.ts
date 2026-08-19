import { status as GrpcStatus } from '@grpc/grpc-js';

/**
 * Transport-independent application error codes (spec §57).
 *
 * These are part of the public contract: they travel to clients in the
 * `x-patches-error-code` response metadata and are safe to switch on. Add codes
 * here, never ad-hoc strings at throw sites.
 */
export const ERROR_CODES = [
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_EMAIL_UNVERIFIED',
  'AUTH_SESSION_EXPIRED',
  /**
   * Not in §57's starter list: an already-authenticated call (a valid, unexpired access
   * token) whose account was suspended after the token was issued (P6-004, spec §65's
   * `user suspend`). Distinct from `AUTH_SESSION_EXPIRED`/`AUTH_INVALID_CREDENTIALS` so a
   * client can tell "your account was suspended" apart from "sign in again" — login itself
   * stays uniform (`AUTH_INVALID_CREDENTIALS`) per §166's no-enumeration rule; this code is
   * only ever seen by a caller who already proved who they are.
   */
  'ACCOUNT_SUSPENDED',
  'ACTOR_NOT_FOUND',
  'HANDLE_TAKEN',
  'ACTOR_BLOCKED',
  'POST_NOT_FOUND',
  'POST_FORBIDDEN',
  'POST_TOO_LONG',
  'MEDIA_TOO_LARGE',
  'MEDIA_UNSUPPORTED_TYPE',
  'MEDIA_NOT_READY',
  /** `FinalizeMediaUpload`/`GetMediaDownload` on an id that doesn't exist or isn't the
   * caller's own media (§54) — not in §57's starter list alongside its siblings above. */
  'MEDIA_NOT_FOUND',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  /**
   * Not in §57's starter list: the §83 version gate needs its own code so a
   * client can tell "you must upgrade" apart from other FAILED_PRECONDITIONs.
   */
  'CLIENT_VERSION_UNSUPPORTED',
  /**
   * Also not in §57's starter list: an RPC that exists in the schema but is not implemented
   * on this node yet (the GitHub device-flow pair, which lands in Phase 6 per §176). A client
   * must be able to tell "this node cannot do that" apart from "that request was wrong".
   */
  'NOT_IMPLEMENTED',
  /**
   * Not in §57's starter list: `PageService` (Phase 4.5, P45-003) uniformly reports a missing
   * actor, a page that was never written, *and* a blocked-either-direction viewer as this one
   * code — same reasoning as `POST_NOT_FOUND` (§62 — never leak which of those is true).
   */
  'PAGE_NOT_FOUND',
  /** `PageService.RemoveGuestbookEntry` by anyone other than the page's owner. */
  'PAGE_FORBIDDEN',
  /** `PageService.RemoveGuestbookEntry`/`ReportGuestbookEntry` on an entry id that doesn't
   * exist — distinct from `PAGE_NOT_FOUND` because a guestbook entry id is looked up directly,
   * not resolved through a handle/block check. */
  'GUESTBOOK_ENTRY_NOT_FOUND',
  /**
   * P11-004 (spec §183.4, §192): `DirectMessageService` reports a missing conversation, a
   * conversation the caller isn't an active member of, and a conversation the caller is
   * blocked-either-direction from a fellow member of, uniformly as this one code — the DM
   * "no block oracle" rule (§62, §183.4) applied the same way `POST_NOT_FOUND` already is.
   */
  'CONVERSATION_NOT_FOUND',
  /** `DeleteMessage`/`ModerationService.ReportMessage` on a message id that doesn't exist, or
   * (for `DeleteMessage`) one the caller didn't send — uniform for the same no-oracle reason
   * as `CONVERSATION_NOT_FOUND`. */
  'MESSAGE_NOT_FOUND',
  /** `RespondToMessageRequest` on a request id that doesn't exist or isn't addressed to the
   * caller. */
  'MESSAGE_REQUEST_NOT_FOUND',
  /** `DirectMessageService`'s write paths when this node has `DM_ENABLED=false` (spec §183,
   * §190's `dm_enabled` capability). */
  'DM_DISABLED',
  /** Community lookup and authorization errors (P11-003, spec §182). */
  'COMMUNITY_NOT_FOUND',
  'COMMUNITY_NAME_TAKEN',
  'COMMUNITY_FORBIDDEN',
  'COMMUNITY_BANNED',
  'COMMUNITY_INVITE_NOT_FOUND',
  /** A tag id supplied to a mute/unmute RPC does not exist (P11-005, spec §181). */
  'TAG_NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Application code → gRPC status (spec §57, docs/architecture/api.md §7).
 *
 * `AUTH_EMAIL_UNVERIFIED` / `MEDIA_NOT_READY` / `CLIENT_VERSION_UNSUPPORTED` map
 * to FAILED_PRECONDITION: the request is well formed but the account, resource
 * or client is not in a state that permits it — canonical gRPC semantics.
 */
export const ERROR_CODE_TO_GRPC_STATUS: Readonly<Record<ErrorCode, GrpcStatus>> = Object.freeze({
  AUTH_INVALID_CREDENTIALS: GrpcStatus.UNAUTHENTICATED,
  AUTH_EMAIL_UNVERIFIED: GrpcStatus.FAILED_PRECONDITION,
  AUTH_SESSION_EXPIRED: GrpcStatus.UNAUTHENTICATED,
  ACCOUNT_SUSPENDED: GrpcStatus.PERMISSION_DENIED,
  ACTOR_NOT_FOUND: GrpcStatus.NOT_FOUND,
  HANDLE_TAKEN: GrpcStatus.ALREADY_EXISTS,
  ACTOR_BLOCKED: GrpcStatus.PERMISSION_DENIED,
  POST_NOT_FOUND: GrpcStatus.NOT_FOUND,
  POST_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  POST_TOO_LONG: GrpcStatus.INVALID_ARGUMENT,
  MEDIA_TOO_LARGE: GrpcStatus.INVALID_ARGUMENT,
  MEDIA_UNSUPPORTED_TYPE: GrpcStatus.INVALID_ARGUMENT,
  MEDIA_NOT_READY: GrpcStatus.FAILED_PRECONDITION,
  MEDIA_NOT_FOUND: GrpcStatus.NOT_FOUND,
  RATE_LIMITED: GrpcStatus.RESOURCE_EXHAUSTED,
  VALIDATION_ERROR: GrpcStatus.INVALID_ARGUMENT,
  INTERNAL_ERROR: GrpcStatus.INTERNAL,
  CLIENT_VERSION_UNSUPPORTED: GrpcStatus.FAILED_PRECONDITION,
  NOT_IMPLEMENTED: GrpcStatus.UNIMPLEMENTED,
  PAGE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  PAGE_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  GUESTBOOK_ENTRY_NOT_FOUND: GrpcStatus.NOT_FOUND,
  CONVERSATION_NOT_FOUND: GrpcStatus.NOT_FOUND,
  MESSAGE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  MESSAGE_REQUEST_NOT_FOUND: GrpcStatus.NOT_FOUND,
  DM_DISABLED: GrpcStatus.FAILED_PRECONDITION,
  COMMUNITY_NOT_FOUND: GrpcStatus.NOT_FOUND,
  COMMUNITY_NAME_TAKEN: GrpcStatus.ALREADY_EXISTS,
  COMMUNITY_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  COMMUNITY_BANNED: GrpcStatus.PERMISSION_DENIED,
  COMMUNITY_INVITE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  TAG_NOT_FOUND: GrpcStatus.NOT_FOUND,
});

export function grpcStatusForErrorCode(code: ErrorCode): GrpcStatus {
  return ERROR_CODE_TO_GRPC_STATUS[code];
}
