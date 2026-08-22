import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { createContextValues } from '@connectrpc/connect';
import { expressConnectMiddleware } from '@connectrpc/connect-express';
import { PATCHES_V1_FILES } from '@patches/proto/es';
import type { Express } from 'express';

import { connectCorsMiddleware } from './cors.js';
import { createGrpcProxyClient, PEER_IP_CONTEXT_KEY, registerGrpcService } from './grpc-proxy.js';

export interface ConnectEdgeOptions {
  /** Loopback address of the in-process gRPC server this proxies to, e.g.
   * `127.0.0.1:50051` (ADR 0016 §3) — never a public address. */
  grpcUrl: string;
  /** ADR 0016 §6 CORS allow-list. Empty means same-origin only. */
  webOrigins: readonly string[];
  /** S-001: forwarded to {@link createGrpcProxyClient} — see its doc comment. */
  grpcMaxMessageBytes?: number;
}

export interface ConnectEdge {
  /** Closes the internal loopback gRPC client this edge dialed — call during shutdown
   * alongside the rest of `main.ts`'s drain sequence. */
  close(): void;
}

/**
 * Applies the operator's proxy-header policy without ever enabling Express's unbounded
 * `trust proxy = true` mode. A hop count of one trusts only the address appended by the
 * single edge immediately in front of this process (Fly Proxy in production). If a caller
 * supplies `X-Forwarded-For: spoofed, actual`, Express therefore selects `actual`, not the
 * attacker-controlled left-most value. Direct/local nodes keep forwarded headers disabled.
 */
export function configureProxyTrust(app: NestExpressApplication, trustProxyHeaders: boolean): void {
  app.set('trust proxy', trustProxyHeaders ? 1 : false);
}

/**
 * Mounts the Connect edge (ADR 0016) onto an already-created hybrid Nest app's Express
 * instance: CORS scoped to `/patches.v1.*`, then a generic handler that proxies every unary
 * RPC in the schema to the in-process gRPC server as opaque protobuf bytes. Callers
 * (`main.ts`, `test/support/test-server.ts`) mount this *after* `app.set('trust proxy', ...)`
 * so `req.ip` (read via {@link PEER_IP_CONTEXT_KEY}) already reflects `TRUST_PROXY_HEADERS`.
 */
export function mountConnectEdge(app: INestApplication, options: ConnectEdgeOptions): ConnectEdge {
  const client = createGrpcProxyClient(options.grpcUrl, options.grpcMaxMessageBytes);
  const expressApp = app.getHttpAdapter().getInstance() as Express;

  expressApp.use(connectCorsMiddleware(options.webOrigins));
  expressApp.use(
    expressConnectMiddleware({
      routes: (router) => {
        for (const file of PATCHES_V1_FILES) {
          for (const service of file.services) {
            registerGrpcService(router, service, client);
          }
        }
      },
      contextValues: (req) => createContextValues().set(PEER_IP_CONTEXT_KEY, req.ip),
    }),
  );

  return {
    close: () => {
      client.close();
    },
  };
}
