import {
  type ChannelCredentials,
  type ChannelOptions,
  loadPackageDefinition,
  type ServiceClientConstructor,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

import { PATCHES_PACKAGE_NAME, PROTO_LOADER_OPTIONS, SERVICE_NAMES } from './constants.js';
import type { SystemGrpcClient } from './constants.js';
import { protoFiles } from './proto-path.js';

/**
 * Service constructors for `patches.v1`, built once per process.
 *
 * Loading the schema is synchronous file I/O plus a parse, so it is memoised —
 * building a second client must not re-read the `.proto` files.
 */
let cachedServices: Record<string, ServiceClientConstructor> | undefined;

function services(): Record<string, ServiceClientConstructor> {
  if (cachedServices === undefined) {
    const definition = loadSync([...protoFiles], PROTO_LOADER_OPTIONS);
    const root = loadPackageDefinition(definition) as unknown as {
      patches: { v1: Record<string, ServiceClientConstructor> };
    };
    cachedServices = root.patches.v1;
  }
  return cachedServices;
}

/**
 * Build a `patches.v1.SystemService` client.
 *
 * Both ends of the wire load the schema through {@link PROTO_LOADER_OPTIONS}
 * here, so a client can never drift from the server's `longs`/`keepCase`
 * settings (docs/research/nestjs-grpc-protobuf.md §6).
 */
export function createSystemClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): SystemGrpcClient {
  const Service = services()[SERVICE_NAMES.system];
  if (Service === undefined) {
    throw new Error(
      `${PATCHES_PACKAGE_NAME}.${SERVICE_NAMES.system} is missing from the loaded schema`,
    );
  }
  return new Service(target, credentials, options) as unknown as SystemGrpcClient;
}
