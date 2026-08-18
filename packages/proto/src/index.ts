/**
 * `@patches/proto` — the client/server contract.
 *
 * This entry point is **runtime-free apart from path resolution**: the
 * generated protobuf types are re-exported with `export type *`, so importing
 * it never pulls `@nestjs/microservices` (or Nest's whole DI runtime) into the
 * ESM TUI. Code that needs the generated Nest decorators — i.e. only
 * `apps/server` — imports them from `@patches/proto/nest`.
 */
import type { Options as ProtoLoaderOptions } from '@grpc/proto-loader';

import { PROTO_DIR } from './proto-path.js';

export { PROTO_DIR, protoFile, protoFiles } from './proto-path.js';

// Explicit type re-exports rather than `export type *`: the generated modules
// each declare `protobufPackage`/`PATCHES_V1_PACKAGE_NAME`, and star-exporting
// several of them would make those names ambiguous.
export type { Timestamp } from './generated/google/protobuf/timestamp.js';
export type { PageInfo } from './generated/patches/v1/common.js';
export type {
  GetServerInfoRequest,
  GetServerInfoResponse,
  PingRequest,
  PingResponse,
  SystemServiceClient,
  SystemServiceController,
} from './generated/patches/v1/system.js';

/**
 * Wire protocol version spoken by this schema (spec §83).
 *
 * Bumped only when the *meaning* of an existing protobuf field changes in a way
 * `buf breaking` cannot detect. Adding fields/messages/RPCs does not bump it.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Oldest client build the server will serve. Clients that report an older
 * version are rejected with `FAILED_PRECONDITION` and an actionable message.
 */
export const MIN_CLIENT_VERSION = '0.1.0';

/** Protobuf package namespace. Matches the `package` in every `.proto`. */
export const PATCHES_PACKAGE_NAME = 'patches.v1';

/** Protobuf packages the gRPC server must load. */
export const GRPC_PACKAGES: readonly string[] = Object.freeze([PATCHES_PACKAGE_NAME]);

/** Service names, as they appear in the `.proto` (used by `@GrpcMethod`). */
export const SERVICE_NAMES = Object.freeze({
  system: 'SystemService',
} as const);

/** gRPC metadata keys used across every call (spec §44). */
export const METADATA_KEYS = Object.freeze({
  /** `Bearer <access-token>`. Never logged. */
  authorization: 'authorization',
  /** Correlation ID propagated into server logs. */
  requestId: 'x-request-id',
  /** Client type, e.g. `tui`. */
  client: 'x-patches-client',
  /** Client build version, semver. */
  clientVersion: 'x-patches-client-version',
} as const);

/** Default call deadlines in milliseconds (spec §44). Every call must have one. */
export const DEADLINES_MS = Object.freeze({
  unary: 10_000,
  uploadInit: 10_000,
  auth: 15_000,
} as const);

/**
 * proto-loader options. **Both ends must use these exact values**: server and
 * client parse the `.proto` independently at runtime, so a mismatch in
 * `longs`/`enums`/`keepCase` silently changes the JS types on one side only
 * (see docs/research/nestjs-grpc-protobuf.md §6).
 *
 * `longs: String` is what makes the generated `Timestamp.seconds` type
 * (`forceLong=string`) accurate.
 */
export const PROTO_LOADER_OPTIONS: ProtoLoaderOptions = Object.freeze({
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
});

/** The `{seconds, nanos}` shape proto-loader produces for a `google.protobuf.Timestamp`. */
interface WireTimestamp {
  seconds: string;
  nanos: number;
}

/** Convert a JS `Date` into the wire shape proto-loader expects. */
export function dateToTimestamp(date: Date): WireTimestamp {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}

/**
 * Convert a wire timestamp back into a `Date`.
 *
 * Returns `undefined` for an absent field — proto-loader yields `null` (not
 * `undefined`) for unset message fields when `defaults: true`, so both are
 * handled.
 */
export function timestampToDate(
  timestamp: { seconds: string | number; nanos: number } | null | undefined,
): Date | undefined {
  if (timestamp === null || timestamp === undefined) return undefined;
  const seconds = typeof timestamp.seconds === 'string' ? Number(timestamp.seconds) : timestamp.seconds;
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000));
}
