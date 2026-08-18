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
  'ACTOR_NOT_FOUND',
  'HANDLE_TAKEN',
  'ACTOR_BLOCKED',
  'POST_NOT_FOUND',
  'POST_FORBIDDEN',
  'POST_TOO_LONG',
  'MEDIA_TOO_LARGE',
  'MEDIA_UNSUPPORTED_TYPE',
  'MEDIA_NOT_READY',
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
  ACTOR_NOT_FOUND: GrpcStatus.NOT_FOUND,
  HANDLE_TAKEN: GrpcStatus.ALREADY_EXISTS,
  ACTOR_BLOCKED: GrpcStatus.PERMISSION_DENIED,
  POST_NOT_FOUND: GrpcStatus.NOT_FOUND,
  POST_FORBIDDEN: GrpcStatus.PERMISSION_DENIED,
  POST_TOO_LONG: GrpcStatus.INVALID_ARGUMENT,
  MEDIA_TOO_LARGE: GrpcStatus.INVALID_ARGUMENT,
  MEDIA_UNSUPPORTED_TYPE: GrpcStatus.INVALID_ARGUMENT,
  MEDIA_NOT_READY: GrpcStatus.FAILED_PRECONDITION,
  RATE_LIMITED: GrpcStatus.RESOURCE_EXHAUSTED,
  VALIDATION_ERROR: GrpcStatus.INVALID_ARGUMENT,
  INTERNAL_ERROR: GrpcStatus.INTERNAL,
  CLIENT_VERSION_UNSUPPORTED: GrpcStatus.FAILED_PRECONDITION,
  NOT_IMPLEMENTED: GrpcStatus.UNIMPLEMENTED,
});

export function grpcStatusForErrorCode(code: ErrorCode): GrpcStatus {
  return ERROR_CODE_TO_GRPC_STATUS[code];
}
