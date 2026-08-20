/**
 * `@patches/client` — the transport-agnostic SDK shared by every Patches client
 * (ADR 0016 §9). This entry point is safe to import from a browser bundle: it pulls in
 * `@connectrpc/connect` and `@patches/proto/es` only, never `@grpc/grpc-js` or
 * `@nestjs/microservices`. Build a `Transport` with `@patches/client/connect` (web/RN)
 * or `@patches/client/grpc` (Node/TUI) and pass it to `createPatchesApi`.
 */
export { createPatchesApi, type CreatePatchesApiOptions, type PatchesApi } from './api.js';
export {
  SessionManager,
  InMemoryCredentialStore,
  type CredentialStore,
  type SessionManagerOptions,
  type StoredSession,
} from './session.js';
export {
  describeError,
  isPrivacyAckRequired,
  isSignInRequired,
  type DescribedError,
  type DescribeErrorCopyOverrides,
  type DescribeErrorOptions,
} from './errors.js';
export {
  paginate,
  type CursorPage,
  type CursorPageResponse,
  type PaginateOptions,
} from './pagination.js';
