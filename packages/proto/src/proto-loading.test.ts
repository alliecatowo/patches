import { loadPackageDefinition, type ServiceClientConstructor } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { describe, expect, it } from 'vitest';

import {
  dateToTimestamp,
  METADATA_KEYS,
  PATCHES_PACKAGE_NAME,
  PROTO_DIR,
  PROTO_LOADER_OPTIONS,
  PROTOCOL_VERSION,
  protoFiles,
  SERVICE_NAMES,
  timestampToDate,
} from './index.js';

function loadPatchesPackage(): Record<string, unknown> {
  const definition = loadSync([...protoFiles], PROTO_LOADER_OPTIONS);
  const root = loadPackageDefinition(definition) as unknown as {
    patches: { v1: Record<string, unknown> };
  };
  return root.patches.v1;
}

describe('proto files', () => {
  it('resolves PROTO_DIR to a directory that actually contains the schemas', () => {
    expect(PROTO_DIR).toMatch(/proto$/);
    expect(protoFiles.length).toBeGreaterThan(0);
    for (const file of protoFiles) {
      expect(file.startsWith(PROTO_DIR)).toBe(true);
    }
  });

  it('loads with proto-loader and exposes the declared services', () => {
    const pkg = loadPatchesPackage();

    expect(Object.keys(pkg)).toEqual(expect.arrayContaining([SERVICE_NAMES.system, 'PageInfo']));

    const systemService = pkg[SERVICE_NAMES.system] as ServiceClientConstructor;
    expect(typeof systemService).toBe('function');
    expect(Object.keys(systemService.service).sort()).toEqual(['GetServerInfo', 'Ping']);
  });

  it('declares every RPC as unary and fully-qualified under patches.v1', () => {
    const systemService = loadPatchesPackage()[SERVICE_NAMES.system] as ServiceClientConstructor;

    for (const method of Object.values(systemService.service)) {
      expect(method.requestStream).toBe(false);
      expect(method.responseStream).toBe(false);
      expect(method.path.startsWith(`/${PATCHES_PACKAGE_NAME}.${SERVICE_NAMES.system}/`)).toBe(
        true,
      );
    }
  });

  it('pins the wire protocol version and metadata keys', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(METADATA_KEYS).toMatchObject({
      authorization: 'authorization',
      requestId: 'x-request-id',
      client: 'x-patches-client',
      clientVersion: 'x-patches-client-version',
    });
  });
});

describe('timestamp helpers', () => {
  it('round-trips a date through the proto-loader wire shape', () => {
    const date = new Date('2026-08-17T12:34:56.789Z');
    const wire = dateToTimestamp(date);

    // `seconds` must be a string: proto-loader is configured with `longs: String`.
    expect(typeof wire.seconds).toBe('string');
    expect(wire.nanos).toBe(789_000_000);
    expect(timestampToDate(wire)?.toISOString()).toBe(date.toISOString());
  });

  it('treats an absent timestamp as undefined', () => {
    // proto-loader yields `null` (not `undefined`) for unset message fields.
    expect(timestampToDate(null)).toBeUndefined();
    expect(timestampToDate(undefined)).toBeUndefined();
  });
});
