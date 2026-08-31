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

  it('declares the full AuthService RPC surface, including the credential/SSH/GitHub/OIDC/passkey RPCs', () => {
    const methods = serviceMethodNames(loadPatchesPackage(), SERVICE_NAMES.auth);
    expect(methods).toEqual(
      [
        'AddCredential',
        'ApproveDeviceLink',
        'BeginDeviceLink',
        'BeginGitHubLogin',
        'BeginOidcLogin',
        'BeginPasskeyLogin',
        'BeginPasskeyRegistration',
        'BeginSshEnrollment',
        'BeginSshLogin',
        'ChangePassword',
        'CompletePasskeyLogin',
        'CompletePasskeyRegistration',
        'CompleteSshLogin',
        'GenerateRecoveryCodes',
        'GetAuthPolicy',
        'GetCurrentSession',
        'ListCredentials',
        'Login',
        'Logout',
        'LogoutAllSessions',
        'PollDeviceLink',
        'PollGitHubLogin',
        'PollOidcLogin',
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
      ['GetConversation', 'LeaveConversation', 'ListConversations', 'MarkConversationRead'].sort(),
    );
    // `ModerationService` after ADR 0030 §B-095: `ReportMessage` (snapshot-backed evidence for
    // a server-visible DM) is gone from the wire — `ReportE2eeMessage` plus reporter-disclosed
    // evidence is the whole DM moderation story.
    expect(serviceMethodNames(pkg, SERVICE_NAMES.moderation)).toEqual(
      [
        'BlockActor',
        'ListBlocks',
        'ListModerationLog',
        'ListMutes',
        'ListMyModerationNotices',
        'MuteActor',
        'ReportActor',
        'ReportE2eeMessage',
        'ReportPost',
        'UnblockActor',
        'UnmuteActor',
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
    // `E2eeService`'s full surface (ADR 0020, P13-001 onward): this list is the wire
    // contract every node implementation has to satisfy.
    expect(serviceMethodNames(pkg, SERVICE_NAMES.e2ee)).toEqual(
      [
        'AcknowledgeEnvelopes',
        'AddE2eeMember',
        'AttachReportEvidence',
        'BeginDeviceLink',
        'CancelDeviceLink',
        'ClaimPrekeyBundles',
        'CreateE2eeConversation',
        'EnrollDevice',
        'GetDeviceRoster',
        'GetE2eeCapability',
        'GetE2eeConversationState',
        'GetIdentityRoot',
        'GetPrekeyInventory',
        'ListDeviceRosters',
        'ListE2eeGroupControlEvents',
        'ListMailboxEnvelopes',
        'ListPendingDeviceLinks',
        'PublishDeviceRoster',
        'PublishIdentityRoot',
        'RemoveE2eeMember',
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

  it('reserves the retired legacy conversation security mode (ADR 0030 §B-095, spec §153)', () => {
    const pkg = loadPatchesPackage();
    // proto-loader exposes top-level enums as their raw EnumDescriptorProto reflection
    // object (`{ format, type, fileDescriptorProtos }`); the name→number mapping lives in
    // `type.value` (`[{ name, number }, …]`). Assert against THAT, not the descriptor.
    const descriptor = pkg.ConversationSecurityMode as {
      type: { value: { name: string; number: number }[] };
    };
    const values = Object.fromEntries(descriptor.type.value.map((v) => [v.name, v.number]));
    expect(values).toMatchObject({
      CONVERSATION_SECURITY_MODE_UNSPECIFIED: 0,
      CONVERSATION_SECURITY_MODE_E2EE_V1: 2,
    });
    expect(values.CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE).toBeUndefined();
    // Number 1 stays reserved on the wire: neither name→number nor the reverse mapping may
    // resolve it, and no future value may quietly claim it.
    expect(Object.values(descriptor.type.value).map((v) => v.number)).not.toContain(1);
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
