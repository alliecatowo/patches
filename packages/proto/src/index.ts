/**
 * `@patches/proto` — the client/server contract.
 *
 * The generated protobuf **types** are re-exported here with `export type`, so
 * importing this entry point never pulls `@nestjs/microservices` (or Nest's DI
 * runtime) into the ESM Ink TUI. Code that needs the generated Nest decorators —
 * i.e. only `apps/server` — imports them from `@patches/proto/nest`.
 */

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

export { createSystemClient } from './client.js';
export {
  DEADLINES_MS,
  ERROR_CODE_METADATA_KEY,
  GRPC_PACKAGES,
  METADATA_KEYS,
  MIN_CLIENT_VERSION,
  PATCHES_PACKAGE_NAME,
  PROTO_LOADER_OPTIONS,
  PROTOCOL_VERSION,
  SERVICE_NAMES,
} from './constants.js';
export type { GrpcUnaryCall, SystemGrpcClient } from './constants.js';
export { PROTO_DIR, protoFile, protoFiles } from './proto-path.js';
export { dateToTimestamp, timestampToDate } from './timestamps.js';
