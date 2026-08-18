import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  ERROR_CODE_METADATA_KEY,
  type GetServerInfoRequest,
  type GetServerInfoResponse,
  MIN_CLIENT_VERSION,
  type PingRequest,
  type PingResponse,
  PROTOCOL_VERSION,
  timestampToDate,
} from '@patches/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { callUnary, expectRejection, startTestServer, type TestServer } from './support/test-server.js';

const CURRENT_CLIENT_VERSION = MIN_CLIENT_VERSION;

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

describe('patches.v1.SystemService/GetServerInfo', () => {
  it('answers a real grpc-js client over the wire', async () => {
    const response = await callUnary<GetServerInfoRequest, GetServerInfoResponse>(
      server.client.getServerInfo.bind(server.client),
      {},
      { clientVersion: CURRENT_CLIENT_VERSION },
    );

    expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(response.minClientVersion).toBe(MIN_CLIENT_VERSION);
    expect(response.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(response.instanceName).toBe('patches-dev');
    expect(response.features).toContain('system.ping');
  });

  it('sends a Timestamp that proto-loader hands back as {seconds, nanos}', async () => {
    const response = await callUnary<GetServerInfoRequest, GetServerInfoResponse>(
      server.client.getServerInfo.bind(server.client),
      {},
      { clientVersion: CURRENT_CLIENT_VERSION },
    );

    // Guards the codegen decision in buf.gen.yaml: proto-loader never produces a
    // JS Date, so `useDate=true` would have generated a type that lies.
    expect(typeof response.serverTime?.seconds).toBe('string');
    const serverTime = timestampToDate(response.serverTime);
    expect(serverTime).toBeInstanceOf(Date);
    expect(Math.abs((serverTime?.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
  });

  it('serves callers that send no client version at all', async () => {
    const response = await callUnary<GetServerInfoRequest, GetServerInfoResponse>(
      server.client.getServerInfo.bind(server.client),
      {},
    );
    expect(response.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('client version gate (spec §83)', () => {
  it('rejects an impossibly old client with FAILED_PRECONDITION', async () => {
    const error = await expectRejection<GetServerInfoRequest, GetServerInfoResponse>(
      server.client.getServerInfo.bind(server.client),
      {},
      { clientVersion: '0.0.1' },
    );

    expect(error.code).toBe(GrpcStatus.FAILED_PRECONDITION);
    expect(error.details).toContain('too old');
    expect(error.details).toContain(MIN_CLIENT_VERSION);
    expect(error.details).not.toContain('    at '); // no stack trace, ever
  });

  it('reports the application error code in response metadata', async () => {
    const error = await expectRejection<GetServerInfoRequest, GetServerInfoResponse>(
      server.client.getServerInfo.bind(server.client),
      {},
      { clientVersion: '0.0.1' },
    );

    expect(error.metadata.get(ERROR_CODE_METADATA_KEY)[0]).toBe('CLIENT_VERSION_UNSUPPORTED');
    expect(error.metadata.get('x-request-id')[0]).toBe('test-request-id');
  });

  it('rejects a client version it cannot parse', async () => {
    const error = await expectRejection<GetServerInfoRequest, GetServerInfoResponse>(
      server.client.getServerInfo.bind(server.client),
      {},
      { clientVersion: 'banana' },
    );
    expect(error.code).toBe(GrpcStatus.FAILED_PRECONDITION);
  });
});

describe('patches.v1.SystemService/Ping', () => {
  it('echoes the nonce back', async () => {
    const response = await callUnary<PingRequest, PingResponse>(
      server.client.ping.bind(server.client),
      { nonce: 'hello-patches' },
      { clientVersion: CURRENT_CLIENT_VERSION },
    );

    expect(response.nonce).toBe('hello-patches');
    expect(timestampToDate(response.serverTime)).toBeInstanceOf(Date);
  });

  it('maps a validation failure to INVALID_ARGUMENT', async () => {
    const error = await expectRejection<PingRequest, PingResponse>(
      server.client.ping.bind(server.client),
      { nonce: 'x'.repeat(65) },
      { clientVersion: CURRENT_CLIENT_VERSION },
    );

    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(error.metadata.get(ERROR_CODE_METADATA_KEY)[0]).toBe('VALIDATION_ERROR');
  });
});
