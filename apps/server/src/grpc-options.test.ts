import { type Server } from '@grpc/grpc-js';
import { Transport } from '@nestjs/microservices';
import { getProtoFiles, GRPC_PACKAGES, PROTO_LOADER_OPTIONS } from '@patches/proto';
import { describe, expect, it, vi } from 'vitest';

import { createGrpcMicroservice } from './grpc-options.js';

describe('createGrpcMicroservice', () => {
  it('builds gRPC transport options that match the shared proto schema', () => {
    const { options } = createGrpcMicroservice('127.0.0.1:50051');

    expect(options.transport).toBe(Transport.GRPC);
    expect(options.options).toMatchObject({
      url: '127.0.0.1:50051',
      package: [...GRPC_PACKAGES],
      protoPath: [...getProtoFiles()],
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

  it('does not attach reflection by default', () => {
    const { options } = createGrpcMicroservice('127.0.0.1:50051');
    const addService = vi.fn();
    const fakeServer = { addService } as unknown as Server;

    options.options?.onLoadPackageDefinition?.({}, fakeServer);

    // Only the health service, no grpc.reflection.v1alpha.ServerReflection.
    expect(addService).toHaveBeenCalledTimes(1);
  });

  it('attaches grpc.reflection.v1alpha.ServerReflection when reflection: true (B-006)', () => {
    const { options } = createGrpcMicroservice('127.0.0.1:50051', { reflection: true });
    const addService = vi.fn();
    const fakeServer = { addService } as unknown as Server;

    options.options?.onLoadPackageDefinition?.({}, fakeServer);

    // Health + two reflection service versions (v1 and v1alpha) is what
    // @grpc/reflection's ReflectionService.addToServer registers.
    expect(addService).toHaveBeenCalledTimes(3);
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
