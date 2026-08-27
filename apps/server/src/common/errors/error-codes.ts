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
  /** `FilterService` lookup/authorization errors (P14-007, spec §198): a filter id that
   * doesn't exist, or exists but belongs to another actor — uniform for the same §62 reason
   * `POST_NOT_FOUND` is. */
  'FILTER_NOT_FOUND',
  /** `ImportFilters` given a payload that isn't the documented `ExportFilters` JSON shape
   * (spec §198.5). */
  'FILTER_IMPORT_INVALID',
  /** `FilterListService` lookup errors (P14-008, spec §199): a filter list id, or a filter
   * list entry id, that doesn't exist. */
  'FILTER_LIST_NOT_FOUND',
  'FILTER_LIST_ENTRY_NOT_FOUND',
  /** `PublishFilterList`/`UpdateFilterList`/`DeleteFilterList` by someone who isn't the list's
   * owning actor, or isn't a moderator of its owning community (spec §199.1). */
  'FILTER_LIST_FORBIDDEN',
  /** `LabelService` lookup errors (P14-009, spec §200): a labeler or label id that does not
   * exist — uniform for the same §62 reason `POST_NOT_FOUND` is. */
  'LABELER_NOT_FOUND',
  'LABEL_NOT_FOUND',
  /** `ApplyLabel`/`RetractLabel`/`CreateLabeler` by someone who isn't the labeler's own actor
   * and isn't a moderator of its owning community, or any attempt to operate the node's own
   * labeler through this RPC surface at all — a labeler operator's authority stops at their
   * own labeler (§200.5, §208). */
  'LABELER_FORBIDDEN',
  /** `ApplyLabel`/`SetLabelerSubscriptionAction` given a `value` that is not one of the
   * labeler's node-published, closed vocabulary — free-text label values are prohibited
   * (spec §200.2, §208). */
  'LABEL_VALUE_INVALID',
  /** `AppealService.CreateAppeal` given a `moderation_notice_id` that doesn't resolve to a
   * notice-worthy `admin_audit_log` row for the caller — uniform for "doesn't exist" and
   * "isn't yours" for the same §62/§64 no-oracle reason `POST_NOT_FOUND` is (spec §201.3: only
   * the acted-upon actor may appeal). */
  'MODERATION_NOTICE_NOT_FOUND',
  /** `AppealService.GetAppeal` on an id that doesn't exist or isn't the caller's own appeal
   * (spec §201.3 — visible only to the appellant and moderators). */
  'APPEAL_NOT_FOUND',
  /** `AppealService.CreateAppeal` when `appeals.admin_audit_log_id` is already taken — one
   * appeal per action (spec §201.3). */
  'APPEAL_ALREADY_EXISTS',
  /** `AppealService.CreateAppeal` after the node's published appeal window
   * (`NodeService.GetNodePolicy.appeal_window_days`) has closed (spec §201.3, §204). */
  'APPEAL_WINDOW_CLOSED',
  /** `RequirePrivacyAckGuard` (`common/guards/require-privacy-ack.guard.ts`, P14 follow-up,
   * spec §197.5, §197.6): a mutating RPC called by an authenticated actor who has not yet
   * called `PrivacyService.AcknowledgePrivacyNotice` for this node's current
   * `PRIVACY_NOTICE_VERSION`, on a node that has opted into `REQUIRE_PRIVACY_ACK=true`. Reads
   * are never gated — only RPCs the guard is explicitly attached to. */
  'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
  /** `SocialGraphService.AcceptFollowRequest`/`RejectFollowRequest` on an `actor_id` with no
   * pending follow request addressed to the caller (spec §197.5) — never exists, was already
   * accepted/rejected, or was cancelled by the requester. */
  'FOLLOW_REQUEST_NOT_FOUND',
  /** `PublicReadGuard` (`common/guards/public-read.guard.ts`, owner decision 2026-08-19): a
   * node with `PUBLIC_READ=false` rejects an unauthenticated call to any RPC outside its
   * always-open allow-list (`SystemService.*`, `NodeService.GetNodeInfo`/`GetNodePolicy`,
   * `AuthService.*`) with this code — distinct from `AUTH_INVALID_CREDENTIALS` so a client can
   * tell "this node requires sign-in to read" apart from "your credentials were wrong" (the
   * latter implies a login form was already shown).
   */
  'SIGN_IN_REQUIRED',
  /** P15-002: `Login`, a password-carrying `Register`, or `AddCredential(PASSWORD)` on a node
   * with `PASSWORD_AUTH=off` — the credential type itself is rejected node-wide, not any
   * particular account or password. Clients must hide password UI rather than let a caller
   * reach this (`AuthService.GetAuthPolicy`). */
  'PASSWORD_AUTH_DISABLED',
  /** S-001 (`RpcBudgetInterceptor`, `docs/operations/capacity.md`): a unary RPC exceeded
   * `RPC_TIMEOUT_MS` — the handler is abandoned server-side (the client sees this error; any
   * in-flight DB work is not cancelled, same caveat every gRPC deadline has). */
  'RPC_TIMEOUT',
  /** S-002 (`RpcBudgetInterceptor`'s write-concurrency gate, `docs/operations/capacity.md`):
   * this process is already running `RPC_WRITE_CONCURRENCY_LIMIT` write-class RPCs — the
   * request is shed immediately, before touching the database, so reads stay unaffected. */
  'NODE_OVERLOADED',
  /** `E2eeService` (P13-004, ADR 0020 §2): `GetIdentityRoot`/`EnrollDevice`/`RevokeDevice`/
   * `PublishDeviceRoster` on an actor with no published messaging identity root. */
  'E2EE_IDENTITY_ROOT_NOT_FOUND',
  /** `E2eeService.GetDeviceRoster`/`ListDeviceRosters` on an actor with no published device
   * roster (identity root published but `EnrollDevice` never called). */
  'E2EE_ROSTER_NOT_FOUND',
  /** `E2eeService.RevokeDevice`/`UploadPrekeys`/`GetPrekeyInventory`/`ClaimPrekeyBundles` on a
   * `device_id` that does not resolve to an active device certified for the relevant actor —
   * uniform for "doesn't exist" and "isn't yours"/"isn't active", same §62 no-oracle reason as
   * `CONVERSATION_NOT_FOUND`. */
  'E2EE_DEVICE_NOT_FOUND',
  /** `E2eeService` (ADR 0020 §2–§3, §14.14.2): an identity root self-signature, device
   * certificate root-signature, or prekey-bundle device-signature does not verify, or a decoded
   * convenience field disagrees with its signed canonical transcript. */
  'E2EE_CERTIFICATE_INVALID',
  /** `E2eeService.PublishDeviceRoster`/`EnrollDevice`/`RevokeDevice` (ADR 0020 §2, §14.14.4): a
   * submitted roster does not extend the actor's current roster by exactly one signed,
   * chained, monotonic step. */
  'E2EE_ROSTER_CONFLICT',
  /** `E2eeService.ClaimPrekeyBundles` (ADR 0020 §5): a caller exceeded this node's one-time
   * prekey drain rate limit for a device; the caller must retry the fallback-only bundle
   * rather than re-request one-time-prekey forward secrecy immediately. */
  'E2EE_PREKEY_LIMIT_EXCEEDED',
  /** P13-017: `attachReportEvidence`/`loadReportEvidenceForModeration`
   * (`modules/e2ee/report-evidence.ts`, `report-evidence-moderation.ts`) on a report id that
   * does not exist or (for `attachReportEvidence`) is not the caller's own report — uniform for
   * "doesn't exist" and "isn't yours", same §62 no-oracle reason as `CONVERSATION_NOT_FOUND`.
   * Replaces a stopgap `VALIDATION_ERROR` those two call sites used before this code existed. */
  'REPORT_NOT_FOUND',
  /** P13-019: `ModerationService.ReportE2eeMessage` on a `logical_message_id` that does not
   * resolve to an `E2eeLogicalMessage`, or one whose conversation the caller is not (and never
   * was) a member of — uniform for "doesn't exist" and "isn't yours to report", same §62
   * no-oracle reason as `CONVERSATION_NOT_FOUND`. */
  'E2EE_MESSAGE_NOT_FOUND',
  /** `E2eeService.GetE2eeConversationState`/`SendEnvelopes` (P13-007): a `conversation_id` that
   * doesn't exist, isn't `E2EE_V1`, or the caller isn't an active member of — uniform for the
   * same §62 no-oracle reason `CONVERSATION_NOT_FOUND` is. Deliberately a distinct code from
   * `CONVERSATION_NOT_FOUND` rather than reused: a legacy and an E2EE conversation id are never
   * interchangeable (ADR 0020 §1.1), so a client must be able to tell which lookup failed. */
  'E2EE_CONVERSATION_NOT_FOUND',
  /**
   * `E2eeService.SendEnvelopes`/`CreateE2eeConversation` (ADR 0020 §7, §14.14.5): the submitted
   * fanout does not exactly cover every active device of every current member — it is missing a
   * device, addresses one the roster does not certify, fails its digest, or was composed under a
   * stale membership epoch. The caller must re-fetch `GetE2eeConversationState` and recompose;
   * this is the fail-closed outcome of a revocation race, never a silent partial delivery.
   */
  'E2EE_FANOUT_REJECTED',
  /** `E2eeService.SendEnvelopes`/`CreateE2eeConversation`: this node has no franking key to sign
   * an acceptance tag under (`NodeFrankingKeyRing.currentEra()` returned `undefined`). Distinct
   * from a fanout failure — the send was otherwise valid, but the node cannot issue the receipt
   * ADR 0020 §9 requires. */
  'E2EE_FRANKING_UNAVAILABLE',
  /** `E2eeService.AddE2eeMember`/`RemoveE2eeMember` (P13-008, ADR 0020 §7): a submitted
   * group-control event's device signature does not verify, its digest does not cover its
   * transcript, or its decoded convenience fields disagree with the signed `event_bytes` —
   * the group-transcript sibling of `E2EE_CERTIFICATE_INVALID`. */
  'E2EE_GROUP_CONTROL_INVALID',
  /** `E2eeService.AddE2eeMember`/`RemoveE2eeMember` (P13-008, ADR 0020 §7): a submitted
   * group-control event does not extend the conversation's transcript by exactly one signed,
   * chained, monotonic epoch step — including a concurrent transition that won the race to
   * the same epoch. The caller re-reads `GetE2eeConversationState` and retries. */
  'E2EE_GROUP_CONTROL_CONFLICT',
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
  DM_DISABLED: GrpcStatus.FAILED_PRECONDITION,
  COMMUNITY_NOT_FOUND: GrpcStatus.NOT_FOUND,
  COMMUNITY_NAME_TAKEN: GrpcStatus.ALREADY_EXISTS,
  COMMUNITY_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  COMMUNITY_BANNED: GrpcStatus.PERMISSION_DENIED,
  COMMUNITY_INVITE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  TAG_NOT_FOUND: GrpcStatus.NOT_FOUND,
  FILTER_NOT_FOUND: GrpcStatus.NOT_FOUND,
  FILTER_IMPORT_INVALID: GrpcStatus.INVALID_ARGUMENT,
  FILTER_LIST_NOT_FOUND: GrpcStatus.NOT_FOUND,
  FILTER_LIST_ENTRY_NOT_FOUND: GrpcStatus.NOT_FOUND,
  FILTER_LIST_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  LABELER_NOT_FOUND: GrpcStatus.NOT_FOUND,
  LABEL_NOT_FOUND: GrpcStatus.NOT_FOUND,
  LABELER_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  LABEL_VALUE_INVALID: GrpcStatus.INVALID_ARGUMENT,
  MODERATION_NOTICE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  APPEAL_NOT_FOUND: GrpcStatus.NOT_FOUND,
  APPEAL_ALREADY_EXISTS: GrpcStatus.ALREADY_EXISTS,
  APPEAL_WINDOW_CLOSED: GrpcStatus.FAILED_PRECONDITION,
  PRIVACY_NOTICE_NOT_ACKNOWLEDGED: GrpcStatus.FAILED_PRECONDITION,
  FOLLOW_REQUEST_NOT_FOUND: GrpcStatus.NOT_FOUND,
  SIGN_IN_REQUIRED: GrpcStatus.UNAUTHENTICATED,
  PASSWORD_AUTH_DISABLED: GrpcStatus.FAILED_PRECONDITION,
  RPC_TIMEOUT: GrpcStatus.DEADLINE_EXCEEDED,
  NODE_OVERLOADED: GrpcStatus.UNAVAILABLE,
  E2EE_IDENTITY_ROOT_NOT_FOUND: GrpcStatus.NOT_FOUND,
  E2EE_ROSTER_NOT_FOUND: GrpcStatus.NOT_FOUND,
  E2EE_DEVICE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  E2EE_CERTIFICATE_INVALID: GrpcStatus.INVALID_ARGUMENT,
  E2EE_ROSTER_CONFLICT: GrpcStatus.FAILED_PRECONDITION,
  E2EE_PREKEY_LIMIT_EXCEEDED: GrpcStatus.RESOURCE_EXHAUSTED,
  REPORT_NOT_FOUND: GrpcStatus.NOT_FOUND,
  E2EE_MESSAGE_NOT_FOUND: GrpcStatus.NOT_FOUND,
  E2EE_CONVERSATION_NOT_FOUND: GrpcStatus.NOT_FOUND,
  E2EE_FANOUT_REJECTED: GrpcStatus.FAILED_PRECONDITION,
  E2EE_FRANKING_UNAVAILABLE: GrpcStatus.FAILED_PRECONDITION,
  E2EE_GROUP_CONTROL_INVALID: GrpcStatus.INVALID_ARGUMENT,
  E2EE_GROUP_CONTROL_CONFLICT: GrpcStatus.FAILED_PRECONDITION,
});

export function grpcStatusForErrorCode(code: ErrorCode): GrpcStatus {
  return ERROR_CODE_TO_GRPC_STATUS[code];
}
