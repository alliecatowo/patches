import { describe, expect, it } from 'vitest';

import { PATCHES_V1_FILES } from './es.js';

/**
 * ADR 0016 §3: the Connect edge (`apps/server/src/transport/connect/grpc-proxy.ts`)
 * registers every service generically from these descriptors with one contained cast,
 * justified specifically because every RPC in this schema is unary — a streaming RPC would
 * need a different (non-passthrough) handler shape entirely. This test is the guard: if a
 * future `.proto` change ever introduces a streaming RPC, this fails loudly here instead of
 * the Connect edge silently registering a broken handler for it.
 */
describe('PATCHES_V1_FILES', () => {
  it('declares at least one service with at least one RPC', () => {
    const allMethods = PATCHES_V1_FILES.flatMap((file) =>
      file.services.flatMap((service) => service.methods),
    );
    expect(allMethods.length).toBeGreaterThan(0);
  });

  it('every RPC across every service is unary', () => {
    const nonUnary = PATCHES_V1_FILES.flatMap((file) =>
      file.services.flatMap((service) =>
        service.methods
          .filter((method) => method.methodKind !== 'unary')
          .map((method) => `${service.typeName}.${method.name} (${method.methodKind})`),
      ),
    );
    expect(nonUnary).toEqual([]);
  });
});
