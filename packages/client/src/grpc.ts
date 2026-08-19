/**
 * Node/TUI transport (ADR 0016 §9). Only this entry point (and its `Client`s built on
 * it) ever imports `@connectrpc/connect-node` — the root and `./connect` entry points
 * stay import-clean of grpc-js/http2 so a browser bundle never sees them.
 *
 * ```ts
 * import { createGrpcTransport } from '@patches/client/grpc';
 * import { createPatchesApi } from '@patches/client';
 *
 * const transport = createGrpcTransport({ baseUrl: 'https://patches-social.fly.dev' });
 * const api = createPatchesApi({ transport, clientName: 'tui', clientVersion: '0.1.0' });
 * ```
 */
export { createGrpcTransport, type GrpcTransportOptions } from '@connectrpc/connect-node';
export { createConnectTransport, type ConnectTransportOptions } from '@connectrpc/connect-node';
