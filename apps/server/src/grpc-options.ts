import { type Server } from '@grpc/grpc-js';
import { type GrpcOptions, Transport } from '@nestjs/microservices';
import { GRPC_PACKAGES, PROTO_LOADER_OPTIONS, protoFiles } from '@patches/proto';
import { HealthImplementation, type ServingStatus } from 'grpc-health-check';

/** Handle for flipping the standard `grpc.health.v1.Health` status (spec §89). */
export interface HealthControl {
  setStatus(status: ServingStatus): void;
}

export interface GrpcMicroserviceSetup {
  options: GrpcOptions;
  health: HealthControl;
}

/**
 * gRPC transport options shared by `main.ts` and the integration tests.
 *
 * `loader` comes from `@patches/proto` so the server and every client parse the
 * schema with identical options — a `longs`/`keepCase` mismatch silently changes
 * the JS types on one side only (docs/research/nestjs-grpc-protobuf.md §6).
 *
 * Health checking uses the standard `grpc.health.v1` service rather than a
 * Patches-specific RPC, so Fly.io and grpc-health-probe work out of the box.
 * Nest has no abstraction for it: it is attached to the raw `grpc.Server` through
 * `onLoadPackageDefinition`.
 */
export function createGrpcMicroservice(url: string): GrpcMicroserviceSetup {
  const health = new HealthImplementation({ '': 'NOT_SERVING' });

  return {
    options: {
      transport: Transport.GRPC,
      options: {
        url,
        package: [...GRPC_PACKAGES],
        protoPath: [...protoFiles],
        loader: PROTO_LOADER_OPTIONS,
        onLoadPackageDefinition: (_pkg: unknown, server: Server) => {
          health.addToServer(server);
        },
      },
    },
    health: {
      setStatus: (status) => {
        // '' is the conventional "overall server" key in grpc.health.v1.
        health.setStatus('', status);
      },
    },
  };
}
