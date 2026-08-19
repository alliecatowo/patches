import { Client, credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import { fromBinary, toBinary, type DescService, type Message } from '@bufbuild/protobuf';
import {
  ConnectError,
  createContextKey,
  type Code,
  type ConnectRouter,
  type HandlerContext,
  type ServiceImpl,
} from '@connectrpc/connect';
import { ERROR_CODE_METADATA_KEY, METADATA_KEYS } from '@patches/proto';

/**
 * Request headers the Connect edge forwards to the internal gRPC call verbatim (ADR 0016
 * §7). Everything else a browser sends is dropped on the floor — most importantly
 * `x-forwarded-for`, which is never read from the incoming request; {@link PEER_IP_CONTEXT_KEY}
 * below is what actually determines the value the internal call carries.
 */
const FORWARDED_HEADERS: readonly string[] = [
  METADATA_KEYS.authorization,
  METADATA_KEYS.requestId,
  METADATA_KEYS.client,
  METADATA_KEYS.clientVersion,
  'user-agent',
  'accept-language',
];

/**
 * The Express-derived peer IP (`req.ip`, honouring `app.set('trust proxy', ...)` — see
 * `connect.middleware.ts`), threaded through `expressConnectMiddleware`'s `contextValues`
 * hook so every RPC handler below can read it without touching the raw Express request
 * itself. Always overwrites any `x-forwarded-for` metadata the internal gRPC call carries —
 * a caller-supplied header is never forwarded (ADR 0016 §7).
 */
export const PEER_IP_CONTEXT_KEY = createContextKey<string | undefined>(undefined);

/** One raw grpc-js client dialing the in-process gRPC server over loopback, insecure — this
 * never leaves localhost (see `grpc-options.ts`'s `url`, always `127.0.0.1:GRPC_PORT` or
 * `GRPC_HOST:GRPC_PORT` when not `0.0.0.0`), so plaintext credentials are safe here the same
 * way they're safe for `test-server.ts`'s in-process gRPC client. */
export function createGrpcProxyClient(url: string): Client {
  // grpc-js's `Client` base class is normally subclassed by generated code
  // (`makeGenericClientConstructor`); a bare `new Client(...)` is the documented way to get
  // an unopinionated client that only exposes the generic `makeUnaryRequest` this proxy uses
  // (docs/research/connect-es.md's `client.makeUnaryRequest` design, matching the ADR).
  return new Client(url, credentials.createInsecure());
}

function buildMetadata(context: HandlerContext): Metadata {
  const metadata = new Metadata();
  for (const key of FORWARDED_HEADERS) {
    const value = context.requestHeader.get(key);
    if (value !== null && value.length > 0) metadata.set(key, value);
  }
  const peerIp = context.values.get(PEER_IP_CONTEXT_KEY);
  if (peerIp !== undefined && peerIp.length > 0) metadata.set('x-forwarded-for', peerIp);
  return metadata;
}

/** Promisified `Client#makeUnaryRequest` with identity (de)serializers — the internal call
 * carries the exact bytes protobuf-es produced/expects, untouched (ADR 0016 §3). */
async function callUnary(
  client: Client,
  path: string,
  requestBytes: Uint8Array,
  metadata: Metadata,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    client.makeUnaryRequest<Buffer, Buffer>(
      path,
      (value) => value,
      (value) => value,
      Buffer.from(requestBytes),
      metadata,
      (error, response) => {
        if (error !== null) {
          reject(error);
          return;
        }
        if (response === undefined) {
          reject(new Error('grpc call resolved with neither error nor response'));
          return;
        }
        resolve(response);
      },
    );
  });
}

/**
 * Translates a grpc-js `ServiceError` into the equivalent `ConnectError`, carrying over the
 * exact `x-patches-error-code`/`x-request-id` trailer metadata `RpcExceptionsFilter` already
 * set — this only re-encodes the wire format, it never re-derives or duplicates the error
 * mapping itself (ADR 0016 §3).
 */
function toConnectError(error: ServiceError): ConnectError {
  const headers = new Headers();
  const errorCode = error.metadata.get(ERROR_CODE_METADATA_KEY)[0];
  const requestId = error.metadata.get(METADATA_KEYS.requestId)[0];
  if (errorCode !== undefined) headers.set(ERROR_CODE_METADATA_KEY, errorCode.toString());
  if (requestId !== undefined) headers.set(METADATA_KEYS.requestId, requestId.toString());
  // Connect's `Code` enum is numerically identical to grpc-js's `status` enum for every
  // non-zero value (docs/research/connect-es.md §7, verified against both packages' source)
  // — `error.code` reaching this branch is always a real failure, never `OK`/`0`, so this
  // cast is safe without a lookup table.
  return new ConnectError(error.details, error.code as unknown as Code, headers);
}

/**
 * Registers every RPC of `service` onto `router`, forwarding each call to `client` as opaque
 * protobuf bytes. No mapper, guard, rate limit or error mapping is duplicated here — the
 * exact same `AuthGuard`, interceptors and `RpcExceptionsFilter` the TUI's gRPC calls run
 * through also run for these, because this really does dial the same in-process gRPC server
 * (ADR 0016 §3).
 */
export function registerGrpcService(
  router: ConnectRouter,
  service: DescService,
  client: Client,
): void {
  const implementation: Record<
    string,
    (request: unknown, context: HandlerContext) => Promise<Message>
  > = {};

  for (const method of service.methods) {
    if (method.methodKind !== 'unary') {
      // Backstop for `packages/proto/src/es.test.ts`'s schema-level guard: fail loudly at
      // boot rather than silently registering a handler that can't actually work for a
      // streaming RPC (ADR 0016 §3).
      throw new Error(
        `Connect edge only supports unary RPCs; ${service.typeName}.${method.name} is ` +
          `"${method.methodKind}"`,
      );
    }

    const path = `/${service.typeName}/${method.name}`;
    implementation[method.localName] = async (request, context) => {
      const requestBytes = toBinary(method.input, request as Message);
      const metadata = buildMetadata(context);
      try {
        const responseBytes = await callUnary(client, path, requestBytes, metadata);
        return fromBinary(method.output, responseBytes);
      } catch (error) {
        throw toConnectError(error as ServiceError);
      }
    };
  }

  // The one contained cast ADR 0016 §3 calls for: `implementation` is built directly off
  // `service`'s own method descriptors immediately above, so for this specific `service`
  // value it structurally satisfies `Partial<ServiceImpl<typeof service>>` — TypeScript just
  // can't prove that across a `DescService`-typed value coming from a runtime array
  // (`PATCHES_V1_FILES`, walked by `connect.middleware.ts`), only a literal service constant.
  router.service(service, implementation as unknown as Partial<ServiceImpl<typeof service>>);
}
