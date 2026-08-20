import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@connectrpc/connect';
import {
  type handleUnaryCall,
  loadPackageDefinition,
  Server,
  ServerCredentials,
  type ServiceClientConstructor,
  type UntypedHandleCall,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { getProtoFiles, PROTO_LOADER_OPTIONS } from '@patches/proto';
import { SystemService } from '@patches/proto/es';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createGrpcTransport } from '../src/api/transport.js';

/**
 * `PingRequest`/`PingResponse` as decoded by `@grpc/proto-loader` with
 * `PROTO_LOADER_OPTIONS` (`longs: String`, `defaults: true`) — the same shape
 * `apps/tui/src/api/client.ts` handles today. This test only reads/writes `nonce`.
 */
interface PingRequestWire {
  nonce: string;
}
interface PingResponseWire {
  nonce: string;
  serverTime: { seconds: string; nanos: number };
}

/** Builds a real `@grpc/grpc-js` server implementing `patches.v1.SystemService.Ping`
 * (and a trivial `GetServerInfo`, required because `addService` needs a handler for
 * every method the service definition declares). Returns the bound port. */
function startSystemServer(
  credentials: ServerCredentials,
): Promise<{ server: Server; port: number }> {
  const definition = loadSync([...getProtoFiles()], PROTO_LOADER_OPTIONS);
  const root = loadPackageDefinition(definition) as unknown as {
    patches: { v1: { SystemService: ServiceClientConstructor } };
  };
  const serviceDefinition = root.patches.v1.SystemService.service;

  // `GetServerInfo` takes no fields, so its wire request is the empty object type.
  type GetServerInfoRequestWire = Record<string, never>;
  interface GetServerInfoResponseWire {
    serverVersion: string;
    protocolVersion: number;
    minClientVersion: string;
    serverTime: { seconds: string; nanos: number };
    instanceName: string;
    features: string[];
  }

  const getServerInfo: handleUnaryCall<GetServerInfoRequestWire, GetServerInfoResponseWire> = (
    _call,
    callback,
  ) => {
    callback(null, {
      serverVersion: '0.0.0-test',
      protocolVersion: 1,
      minClientVersion: '0.0.0',
      serverTime: { seconds: String(Math.floor(Date.now() / 1000)), nanos: 0 },
      instanceName: 'transport-test',
      features: [],
    });
  };

  const ping: handleUnaryCall<PingRequestWire, PingResponseWire> = (call, callback) => {
    callback(null, {
      nonce: call.request.nonce,
      serverTime: { seconds: String(Math.floor(Date.now() / 1000)), nanos: 0 },
    });
  };

  const handlers: UntypedServiceImplementation = {
    getServerInfo: getServerInfo as UntypedHandleCall,
    ping: ping as UntypedHandleCall,
  };

  const server = new Server();
  server.addService(serviceDefinition, handlers);
  return new Promise((resolve, reject) => {
    server.bindAsync('localhost:0', credentials, (error, port) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ server, port });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.tryShutdown(() => resolve()));
}

describe('createGrpcTransport', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(stopServer));
  });

  it('completes SystemService.Ping over h2c (plaintext, --insecure)', async () => {
    const { server, port } = await startSystemServer(ServerCredentials.createInsecure());
    servers.push(server);

    const transport = createGrpcTransport({ target: `localhost:${port}`, insecure: true });
    const client = createClient(SystemService, transport);

    const response = await client.ping({ nonce: 'h2c-nonce' });

    expect(response.nonce).toBe('h2c-nonce');
  });

  describe('over TLS', () => {
    const certDir = mkdtempSync(join(tmpdir(), 'patches-tui-transport-test-'));
    const keyPath = join(certDir, 'key.pem');
    const certPath = join(certDir, 'cert.pem');

    // Self-signed, CN=localhost — matches the target host used below so the client's
    // default hostname verification succeeds. Generated once per test run via the
    // system `openssl` (present on the dev box and on `ubuntu-latest` CI runners);
    // there is no pure-JS cert generator among this repo's catalog deps and adding one
    // just for a test fixture would be out of scope for this slice.
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ]);

    const key = readFileSync(keyPath);
    const cert = readFileSync(certPath);

    afterAll(() => {
      rmSync(certDir, { recursive: true, force: true });
    });

    it('completes SystemService.Ping over TLS', async () => {
      const credentials = ServerCredentials.createSsl(
        null,
        [{ private_key: key, cert_chain: cert }],
        false,
      );
      const { server, port } = await startSystemServer(credentials);
      servers.push(server);

      // The transport under test takes only `{ target, insecure }` (ADR 0023) and has no
      // knob for a custom CA, so — same as `apps/server`'s own TLS integration tests need
      // no such knob against a real node's cert — trust is established the same way `curl
      // -k`/most TLS test suites do: relax Node's global cert verification for the
      // duration of this call. Node's `tls` module re-reads
      // `NODE_TLS_REJECT_UNAUTHORIZED` on every `tls.connect`, not just at process start,
      // so this only affects connections made while it is set.
      const previous = process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
      process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
      try {
        const transport = createGrpcTransport({ target: `localhost:${port}`, insecure: false });
        const client = createClient(SystemService, transport);

        const response = await client.ping({ nonce: 'tls-nonce' });

        expect(response.nonce).toBe('tls-nonce');
      } finally {
        if (previous === undefined) {
          delete process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
        } else {
          process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = previous;
        }
      }
    });
  });
});
