import { type Server } from '@grpc/grpc-js';
import { type PackageDefinition } from '@grpc/proto-loader';
import { ReflectionService } from '@grpc/reflection';
import { type GrpcOptions, Transport } from '@nestjs/microservices';
import { getProtoFiles, GRPC_PACKAGES, PROTO_LOADER_OPTIONS } from '@patches/proto';
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
 *
 * `reflection` (B-006) attaches the standard `grpc.reflection.v1alpha.ServerReflection`
 * service the same way, gated behind `GRPC_REFLECTION` (default off — see
 * `env.schema.ts`'s doc comment for why). This is what lets `grpcurl -plaintext <host>
 * list`/`describe` work against a running server without shipping it any `.proto` files.
 */
export function createGrpcMicroservice(
  url: string,
  options: { reflection?: boolean } = {},
): GrpcMicroserviceSetup {
  const health = new HealthImplementation({ '': 'NOT_SERVING' });
  const { reflection = false } = options;

  return {
    options: {
      transport: Transport.GRPC,
      options: {
        url,
        package: [...GRPC_PACKAGES],
        protoPath: [...getProtoFiles()],
        loader: PROTO_LOADER_OPTIONS,
        onLoadPackageDefinition: (pkg: PackageDefinition, server: Server) => {
          health.addToServer(server);
          if (reflection) {
            new ReflectionService(pkg).addToServer(server);
          }
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
