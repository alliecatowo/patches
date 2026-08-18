import { loadPackageDefinition, type ServiceClientConstructor } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { describe, expect, it } from 'vitest';

import {
  dateToTimestamp,
  getProtoDir,
  getProtoFiles,
  METADATA_KEYS,
  PATCHES_PACKAGE_NAME,
  PROTO_LOADER_OPTIONS,
  PROTOCOL_VERSION,
  SERVICE_NAMES,
  timestampToDate,
} from './index.js';

function loadPatchesPackage(): Record<string, unknown> {
  const definition = loadSync([...getProtoFiles()], PROTO_LOADER_OPTIONS);
  const root = loadPackageDefinition(definition) as unknown as {
    patches: { v1: Record<string, unknown> };
  };
  return root.patches.v1;
}

function serviceMethodNames(pkg: Record<string, unknown>, serviceName: string): string[] {
  const service = pkg[serviceName] as ServiceClientConstructor;
  expect(typeof service).toBe('function');
  return Object.keys(service.service).sort();
}

describe('proto files', () => {
  it('resolves the proto directory lazily (A-010) and lists every schema file', () => {
    expect(getProtoDir()).toMatch(/proto$/);
    const files = getProtoFiles();
    expect(files.length).toBe(13);
    for (const file of files) {
      expect(file.startsWith(getProtoDir())).toBe(true);
    }
  });

  it('loads with proto-loader and exposes every declared service', () => {
    const pkg = loadPatchesPackage();

    expect(Object.keys(pkg)).toEqual(
      expect.arrayContaining([
        SERVICE_NAMES.system,
        SERVICE_NAMES.auth,
        SERVICE_NAMES.actor,
        SERVICE_NAMES.post,
        SERVICE_NAMES.feed,
        SERVICE_NAMES.socialGraph,
        SERVICE_NAMES.node,
        'PageInfo',
      ]),
    );
  });

  it('declares the full AuthService RPC surface, including the credential/SSH/GitHub RPCs', () => {
    const methods = serviceMethodNames(loadPatchesPackage(), SERVICE_NAMES.auth);
    expect(methods).toEqual(
      [
        'AddCredential',
        'BeginGitHubLogin',
        'BeginSshEnrollment',
        'BeginSshLogin',
        'CompleteSshLogin',
        'GetCurrentSession',
        'ListCredentials',
        'Login',
        'Logout',
        'LogoutAllSessions',
        'PollGitHubLogin',
        'RefreshSession',
        'Register',
        'RequestPasswordReset',
        'ResendVerification',
        'ResetPassword',
        'RevokeCredential',
        'VerifyEmail',
      ].sort(),
    );
  });

  it('declares the full ActorService/PostService/FeedService RPC surfaces', () => {
    const pkg = loadPatchesPackage();
    expect(serviceMethodNames(pkg, SERVICE_NAMES.actor)).toEqual(
      [
        'GetActor',
        'GetActorByHandle',
        'ListFollowers',
        'ListFollowing',
        'SearchActors',
        'UpdateProfile',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.post)).toEqual(
      ['CreatePost', 'DeletePost', 'GetPost', 'ListReplies'].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.feed)).toEqual(
      ['ListActorPosts', 'ListHomeFeed', 'ListLocalFeed'].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.socialGraph)).toEqual(
      ['FollowActor', 'GetRelationship', 'UnfollowActor'].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.node)).toEqual(['GetNodeInfo']);
  });

  it('declares every RPC as unary and fully-qualified under patches.v1', () => {
    const pkg = loadPatchesPackage();
    for (const serviceName of Object.values(SERVICE_NAMES)) {
      const service = pkg[serviceName] as ServiceClientConstructor;
      for (const method of Object.values(service.service)) {
        expect(method.requestStream).toBe(false);
        expect(method.responseStream).toBe(false);
        expect(method.path.startsWith(`/${PATCHES_PACKAGE_NAME}.${serviceName}/`)).toBe(true);
      }
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
