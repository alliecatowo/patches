/**
 * Web/RN transport (ADR 0016 §9, §2). Only this entry point (and its `Client`s built on
 * it) ever imports `@connectrpc/connect-web` — it uses `fetch` directly and has no
 * dependency on Node's `http`/`http2` modules, so it's safe in a browser bundle and on
 * React Native (whose `fetch` is unary-only, ADR 0016 §2 — this package exposes no
 * streaming RPC either way, so that limitation never surfaces here).
 *
 * ```ts
 * import { createConnectTransport } from '@patches/client/connect';
 * import { createPatchesApi } from '@patches/client';
 *
 * const transport = createConnectTransport({ baseUrl: 'https://patches-social.fly.dev:8443' });
 * const api = createPatchesApi({ transport, clientName: 'web', clientVersion: '0.1.0' });
 * ```
 */
export { createConnectTransport, type ConnectTransportOptions } from '@connectrpc/connect-web';
