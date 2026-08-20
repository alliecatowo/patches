import { createGrpcTransport as createNodeGrpcTransport } from '@patches/client/grpc';
import type { Transport } from '@connectrpc/connect';

/**
 * The TUI's existing node-selection options (`patches --target <host:port>`,
 * `--insecure`) — unchanged by ADR 0023. `apps/tui/src/api/client.ts`'s
 * `PatchesApiOptions` carries the same two fields today, built from `@grpc/grpc-js`
 * channel credentials; this is the protobuf-es/Connect replacement for that mapping.
 */
export interface GrpcTransportOptions {
  /** `host:port` of the node to connect to. */
  readonly target: string;
  /** Skip TLS and speak plaintext HTTP/2 (h2c) — same meaning as today's `--insecure`. */
  readonly insecure: boolean;
}

/**
 * Builds the Connect gRPC transport (ADR 0023 slice 1, P10-007) from the TUI's existing
 * `{ target, insecure }` options: `insecure` selects `http://<target>` (h2c — plaintext
 * HTTP/2, no TLS handshake); otherwise `https://<target>` (TLS). Both paths are exercised
 * against a real `@grpc/grpc-js` server in `transport.test.ts`, because
 * `docs/research/connect-es.md` documents `createConnectTransport` but not this grpc
 * transport — there was no doc claim to cite instead of testing.
 *
 * Delegates to `@patches/client/grpc`'s `createGrpcTransport` (itself a re-export of
 * `@connectrpc/connect-node`'s), so the TUI and `@patches/client`'s other consumers share
 * one transport implementation and one set of defaults (deadlines, headers — see
 * `@patches/client`'s `createPatchesApi`, wired up in a later slice).
 */
export function createGrpcTransport(options: GrpcTransportOptions): Transport {
  const scheme = options.insecure ? 'http' : 'https';
  return createNodeGrpcTransport({ baseUrl: `${scheme}://${options.target}` });
}
