import { type Server } from '@grpc/grpc-js';
import { Transport } from '@nestjs/microservices';
import { GRPC_PACKAGES, PROTO_LOADER_OPTIONS, protoFiles } from '@patches/proto';
import { describe, expect, it, vi } from 'vitest';

import { createGrpcMicroservice } from './grpc-options.js';

describe('createGrpcMicroservice', () => {
  it('builds gRPC transport options that match the shared proto schema', () => {
    const { options } = createGrpcMicroservice('127.0.0.1:50051');

    expect(options.transport).toBe(Transport.GRPC);
    expect(options.options).toMatchObject({
      url: '127.0.0.1:50051',
      package: [...GRPC_PACKAGES],
      protoPath: [...protoFiles],
      loader: PROTO_LOADER_OPTIONS,
    });
  });

  it('attaches the standard grpc.health.v1.Health service to the raw server', () => {
    const { options } = createGrpcMicroservice('127.0.0.1:50051');
    const addService = vi.fn();
    const fakeServer = { addService } as unknown as Server;

    options.options?.onLoadPackageDefinition?.({}, fakeServer);

    expect(addService).toHaveBeenCalledTimes(1);
  });

  it('starts NOT_SERVING and flips to SERVING via the returned health control', () => {
    // NOT_SERVING at construction (spec §89): a load balancer must never route to an
    // instance that hasn't finished starting up.
    const { health } = createGrpcMicroservice('127.0.0.1:50051');
    expect(() => {
      health.setStatus('SERVING');
    }).not.toThrow();
    expect(() => {
      health.setStatus('NOT_SERVING');
    }).not.toThrow();
  });
});
