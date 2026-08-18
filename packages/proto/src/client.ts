import {
  type ChannelCredentials,
  type ChannelOptions,
  loadPackageDefinition,
  type ServiceClientConstructor,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

import { PATCHES_PACKAGE_NAME, PROTO_LOADER_OPTIONS, SERVICE_NAMES } from './constants.js';
import type {
  ActorGrpcClient,
  AuthGrpcClient,
  FeedGrpcClient,
  MediaGrpcClient,
  ModerationGrpcClient,
  NodeGrpcClient,
  NotificationGrpcClient,
  PostGrpcClient,
  ReactionGrpcClient,
  SocialGraphGrpcClient,
  SystemGrpcClient,
} from './constants.js';
import { getProtoFiles } from './proto-path.js';

/**
 * Service constructors for `patches.v1`, built once per process.
 *
 * Loading the schema is synchronous file I/O plus a parse, so it is memoised —
 * building a second client must not re-read the `.proto` files.
 */
let cachedServices: Record<string, ServiceClientConstructor> | undefined;

function services(): Record<string, ServiceClientConstructor> {
  if (cachedServices === undefined) {
    const definition = loadSync([...getProtoFiles()], PROTO_LOADER_OPTIONS);
    const root = loadPackageDefinition(definition) as unknown as {
      patches: { v1: Record<string, ServiceClientConstructor> };
    };
    cachedServices = root.patches.v1;
  }
  return cachedServices;
}

function buildClient<T>(
  serviceName: string,
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): T {
  const Service = services()[serviceName];
  if (Service === undefined) {
    throw new Error(`${PATCHES_PACKAGE_NAME}.${serviceName} is missing from the loaded schema`);
  }
  return new Service(target, credentials, options) as unknown as T;
}

/**
 * Build a `patches.v1.SystemService` client.
 *
 * Both ends of the wire load the schema through {@link PROTO_LOADER_OPTIONS}
 * here, so a client can never drift from the server's `longs`/`keepCase`
 * settings (docs/research/nestjs-grpc-protobuf.md §6).
 */
export function createSystemClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): SystemGrpcClient {
  return buildClient<SystemGrpcClient>(SERVICE_NAMES.system, target, credentials, options);
}

/** Build a `patches.v1.AuthService` client. See {@link createSystemClient} for the pattern. */
export function createAuthClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): AuthGrpcClient {
  return buildClient<AuthGrpcClient>(SERVICE_NAMES.auth, target, credentials, options);
}

/** Build a `patches.v1.ActorService` client. See {@link createSystemClient} for the pattern. */
export function createActorClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): ActorGrpcClient {
  return buildClient<ActorGrpcClient>(SERVICE_NAMES.actor, target, credentials, options);
}

/** Build a `patches.v1.PostService` client. See {@link createSystemClient} for the pattern. */
export function createPostClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): PostGrpcClient {
  return buildClient<PostGrpcClient>(SERVICE_NAMES.post, target, credentials, options);
}

/** Build a `patches.v1.FeedService` client. See {@link createSystemClient} for the pattern. */
export function createFeedClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): FeedGrpcClient {
  return buildClient<FeedGrpcClient>(SERVICE_NAMES.feed, target, credentials, options);
}

/** Build a `patches.v1.SocialGraphService` client. See {@link createSystemClient} for the
 * pattern. */
export function createSocialGraphClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): SocialGraphGrpcClient {
  return buildClient<SocialGraphGrpcClient>(
    SERVICE_NAMES.socialGraph,
    target,
    credentials,
    options,
  );
}

/** Build a `patches.v1.NodeService` client. See {@link createSystemClient} for the pattern. */
export function createNodeClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): NodeGrpcClient {
  return buildClient<NodeGrpcClient>(SERVICE_NAMES.node, target, credentials, options);
}

/** Build a `patches.v1.ReactionService` client. See {@link createSystemClient} for the
 * pattern. */
export function createReactionClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): ReactionGrpcClient {
  return buildClient<ReactionGrpcClient>(SERVICE_NAMES.reaction, target, credentials, options);
}

/** Build a `patches.v1.NotificationService` client. See {@link createSystemClient} for the
 * pattern. */
export function createNotificationClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): NotificationGrpcClient {
  return buildClient<NotificationGrpcClient>(
    SERVICE_NAMES.notification,
    target,
    credentials,
    options,
  );
}

/** Build a `patches.v1.ModerationService` client. See {@link createSystemClient} for the
 * pattern. */
export function createModerationClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): ModerationGrpcClient {
  return buildClient<ModerationGrpcClient>(SERVICE_NAMES.moderation, target, credentials, options);
}

/** Build a `patches.v1.MediaService` client. See {@link createSystemClient} for the pattern. */
export function createMediaClient(
  target: string,
  credentials: ChannelCredentials,
  options?: ChannelOptions,
): MediaGrpcClient {
  return buildClient<MediaGrpcClient>(SERVICE_NAMES.media, target, credentials, options);
}
