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
    expect(files.length).toBe(22);
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
        SERVICE_NAMES.community,
        SERVICE_NAMES.directMessage,
        SERVICE_NAMES.tag,
        SERVICE_NAMES.filter,
        SERVICE_NAMES.filterList,
        SERVICE_NAMES.label,
        SERVICE_NAMES.appeal,
        SERVICE_NAMES.privacy,
        SERVICE_NAMES.e2ee,
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
        'GenerateRecoveryCodes',
        'GetAuthPolicy',
        'GetCurrentSession',
        'ListCredentials',
        'Login',
        'Logout',
        'LogoutAllSessions',
        'PollGitHubLogin',
        'RecoveryLogin',
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
        'ResolveActor',
        'SearchActors',
        'UpdateProfile',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.post)).toEqual(
      [
        'CreatePost',
        'DeletePost',
        'EditPost',
        'GetPost',
        'ListPostEdits',
        'ListReplies',
        'PinPost',
        'SearchPosts',
        'UnpinPost',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.feed)).toEqual(
      [
        'ListActorPosts',
        'ListCommunityFeed',
        'ListHomeFeed',
        'ListLocalFeed',
        'ListTagFeed',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.socialGraph)).toEqual(
      [
        'AcceptFollowRequest',
        'FollowActor',
        'GetRelationship',
        'ListFollowRequests',
        'ListMutualFollows',
        'RejectFollowRequest',
        'UnfollowActor',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.node)).toEqual(
      ['GetNodeInfo', 'GetNodePolicy'].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.community)).toEqual(
      [
        'BanFromCommunity',
        'CreateCommunity',
        'GetCommunity',
        'InviteToCommunity',
        'JoinCommunity',
        'LeaveCommunity',
        'ListCommunities',
        'ListCommunityMembers',
        'RemovePostFromCommunity',
        'RespondToCommunityInvite',
        'SetCommunityRole',
        'UpdateCommunity',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.directMessage)).toEqual(
      [
        'CreateConversation',
        'DeleteMessage',
        'GetConversation',
        'LeaveConversation',
        'ListConversations',
        'ListMessageRequests',
        'ListMessages',
        'MarkConversationRead',
        'RespondToMessageRequest',
        'SendMessage',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.tag)).toEqual(
      ['ListMutedTags', 'MuteTag', 'SearchTags', 'UnmuteTag'].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.filter)).toEqual(
      [
        'CreateFilter',
        'UpdateFilter',
        'DeleteFilter',
        'ListFilters',
        'ExportFilters',
        'ImportFilters',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.filterList)).toEqual(
      [
        'PublishFilterList',
        'UpdateFilterList',
        'DeleteFilterList',
        'GetFilterList',
        'ListFilterLists',
        'ListFilterListEntries',
        'SubscribeFilterList',
        'UnsubscribeFilterList',
        'ListFilterListSubscriptions',
        'SetFilterListEntryException',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.label)).toEqual(
      [
        'CreateLabeler',
        'GetLabeler',
        'ListLabelers',
        'ApplyLabel',
        'RetractLabel',
        'SubscribeLabeler',
        'UnsubscribeLabeler',
        'SetLabelerSubscriptionAction',
        'ListLabelsOnSubject',
      ].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.appeal)).toEqual(
      ['CreateAppeal', 'GetAppeal', 'ListMyAppeals'].sort(),
    );
    expect(serviceMethodNames(pkg, SERVICE_NAMES.privacy)).toEqual(
      [
        'AcknowledgePrivacyNotice',
        'GetPrivacyPrefs',
        'UpdatePrivacyPrefs',
        'ExportAccount',
        'GetExportStatus',
        'RequestAccountDeletion',
        'CancelAccountDeletion',
        'GetDeletionStatus',
      ].sort(),
    );
    // `E2eeService` is schema-only (ADR 0020, P13-001): no controller implements it, so this
    // list is the contract a future implementation has to satisfy, not a claim that it exists.
    expect(serviceMethodNames(pkg, SERVICE_NAMES.e2ee)).toEqual(
      [
        'AcknowledgeEnvelopes',
        'AttachReportEvidence',
        'ClaimPrekeyBundles',
        'CreateE2eeConversation',
        'EnrollDevice',
        'GetDeviceRoster',
        'GetE2eeCapability',
        'GetE2eeConversationState',
        'GetIdentityRoot',
        'GetPrekeyInventory',
        'ListDeviceRosters',
        'ListMailboxEnvelopes',
        'PublishDeviceRoster',
        'PublishIdentityRoot',
        'RevokeDevice',
        'SendEnvelopes',
        'UploadPrekeys',
      ].sort(),
    );
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
