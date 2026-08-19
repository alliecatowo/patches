import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createNodeClient,
  ERROR_CODE_METADATA_KEY,
  type GetNodeInfoRequest,
  type GetNodeInfoResponse,
  type GetNodePolicyRequest,
  type GetNodePolicyResponse,
  type GetServerInfoRequest,
  type GetServerInfoResponse,
  MIN_CLIENT_VERSION,
  type NodeGrpcClient,
  type PingRequest,
  type PingResponse,
  PROTOCOL_VERSION,
  REGISTRATION_MODE,
  timestampToDate,
} from '@patches/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  callUnary,
  expectRejection,
  startTestServer,
  TEST_NODE_DOMAIN,
  type TestServer,
} from './support/test-server.js';

const CURRENT_CLIENT_VERSION = MIN_CLIENT_VERSION;

let server: TestServer;
let node: NodeGrpcClient;

beforeAll(async () => {
  server = await startTestServer();
  node = createNodeClient(server.url, grpcCredentials.createInsecure());
});

afterAll(async () => {
  node.close();
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

describe('patches.v1.NodeService/GetNodeInfo (P1-014)', () => {
  it('is callable with no authorization metadata at all (spec §163, §168)', async () => {
    const response = await callUnary<GetNodeInfoRequest, GetNodeInfoResponse>(
      node.getNodeInfo.bind(node),
      {},
    );

    expect(response.domain).toBe(TEST_NODE_DOMAIN);
    expect(response.softwareVersion).toMatch(/^\d+\.\d+\.\d+/);
    // `prepareServerEnv` defaults INVITE_ONLY=true for the test suite (support/env.ts).
    expect(response.registrationMode).toBe(REGISTRATION_MODE.INVITE_ONLY);
    expect(response.limits?.postBodyMaxChars).toBe(5000);
    expect(response.limits?.handleMaxChars).toBe(30);
    expect(response.limits?.bioMaxChars).toBe(500);
    // No `tier`/`plan`/`premium` field exists on the message at all (spec §174) — this is a
    // compile-time guarantee (the generated type has no such property), not something a
    // runtime assertion can usefully re-check.
    expect(Array.isArray(response.capabilities)).toBe(true);
  });
});

// A-052 (spec §197.1, §197.6): `prepareServerEnv` (test/support/env.ts) forces
// PRIVACY_NOTICE_SUMMARY/TERMS_URL/APPEAL_INSTRUCTIONS/OPERATOR_CONTACT to fixed test values
// for the whole integration suite (`ConfigModule.forRoot`'s validate runs once per process —
// see docs/agents/LEARNINGS.md — so this is the only reliable way to exercise them end to end).
describe('patches.v1.NodeService/GetNodePolicy (A-052)', () => {
  it('publishes the operator-configured privacy summary, terms URL, appeal instructions, and operator identity', async () => {
    const response = await callUnary<GetNodePolicyRequest, GetNodePolicyResponse>(
      node.getNodePolicy.bind(node),
      {},
    );

    expect(response.policy?.privacyNoticeSummary).toBe(
      'This node stores your posts and direct messages; DMs are readable by this node’s operators.',
    );
    expect(response.policy?.termsUrl).toBe('https://patches.test/terms');
    expect(response.policy?.appealInstructions).toBe(
      'Email appeals@patches.test with your handle and notice ID.',
    );
    expect(response.policy?.operatorIdentity).toBe(
      'Operated by the Patches test node maintainers.',
    );
  });

  it('is callable with no authorization metadata at all (spec §163, §168)', async () => {
    await expect(
      callUnary<GetNodePolicyRequest, GetNodePolicyResponse>(node.getNodePolicy.bind(node), {}),
    ).resolves.toBeDefined();
  });
});
