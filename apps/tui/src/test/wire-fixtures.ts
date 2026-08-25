/**
 * Shared wire message fixtures (ADR 0023 slice 6b).
 *
 * The single place `apps/tui/src` test files build proto message fixtures. Every
 * consumer calls a `makeX(overrides)` builder from here instead of hand-writing the
 * message's full field list, so the slice 7 flip to `@patches/proto/es` only ever
 * touches this module (plus `wire/types.ts`/`wire/enums.ts`/`wire/time.ts`) instead of
 * every test file that happens to need an `Actor` or a `Post`.
 *
 * Each builder takes a `Partial<T>` of overrides and fills in the rest with a
 * reasonable default, mirroring the `function post(overrides = {}) { return { ...,
 * ...overrides } }` pattern already used ad hoc across ~30 test files before this
 * slice. Nested message fields default to another `makeX()` call so overriding a
 * top-level field never requires re-specifying an unrelated nested one.
 *
 * Unset message-typed fields default to `undefined`, matching every existing fixture
 * in the test suite - not the `null` the wire's proto-loader (`defaults: true`) actually
 * decodes an unset field to at runtime. That is deliberate: these are hand-built test
 * inputs to render/business logic, not decoded wire responses, and changing the
 * convention here would edit what dozens of already-passing assertions receive.
 *
 * Every builder sets `$typeName` (ADR 0023 slice 7, P10-013) - a decoded protobuf-es
 * message requires it on itself and on every nested message field, unlike the
 * ts-proto shape this module targeted before the flip.
 */

import {
  APPEAL_STATUS,
  COMMUNITY_INVITE_STATUS,
  COMMUNITY_ROLE,
  CONVERSATION_KIND,
  CONVERSATION_SECURITY_MODE,
  FILTER_ACTION,
  FILTER_TERM_KIND,
  FILTERED_BY_PROVENANCE,
  FOLLOW_STATE,
  LABEL_ACTION,
  MODERATION_ACTION_TYPE,
  MODERATION_LOG_SUBJECT_KIND,
  MODERATION_REASON_CATEGORY,
  NOTIFICATION_TYPE,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  CREDENTIAL_TYPE,
  REGISTRATION_MODE,
} from '../api/wire/enums.js';
import type {
  Actor,
  ActorCounts,
  Appeal,
  Community,
  CommunityInvite,
  CommunityMember,
  Conversation,
  ConversationMember,
  Filter,
  FilterList,
  FilterListSubscription,
  FilteredByHint,
  FollowRequest,
  Label,
  Labeler,
  LabelVocabularyEntry,
  MediaAttachment,
  ModerationLogEntry,
  ModerationNotice,
  Nameplate,
  NodeLimits,
  Notification,
  PageInfo,
  Post,
  PostCounts,
  PostEdit,
  PostViewerState,
  PrivacyPrefs,
  Relationship,
  Session,
  Tag,
  BeginSshEnrollmentResponse,
  BeginSshLoginResponse,
  CompleteSshLoginResponse,
  AddCredentialResponse,
  Credential,
  GetNodeInfoResponse,
  UpdatePageResponse,
  GetAppealResponse,
  ListCommunitiesResponse,
  ListCommunityMembersResponse,
} from '../api/wire/types.js';

export function makeActor(overrides: Partial<Actor> = {}): Actor {
  return {
    $typeName: 'patches.v1.Actor',
    id: 'actor-1',
    handle: 'alice',
    displayName: '',
    bio: '',
    locationText: '',
    websiteUrl: '',
    avatar: undefined,
    isLocal: true,
    joinedAt: undefined,
    counts: undefined,
    nameplate: undefined,
    flair: undefined,
    pinnedPostIds: [],
    ...overrides,
  };
}

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
    $typeName: 'patches.v1.Post',
    id: 'post-1',
    author: makeActor(),
    body: 'hello world',
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: 'post-1',
    media: [],
    createdAt: undefined,
    editedAt: undefined,
    deleted: false,
    counts: undefined,
    viewerState: undefined,
    contentWarning: '',
    quotedPost: undefined,
    community: undefined,
    quotePolicy: QUOTE_POLICY.UNSPECIFIED,
    repostedBy: [],
    repostedByTotal: 0,
    filteredBy: undefined,
    labels: [],
    ...overrides,
  };
}

export function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    $typeName: 'patches.v1.Relationship',
    state: FOLLOW_STATE.NONE,
    followedBy: false,
    blocking: false,
    muting: false,
    requested: false,
    requestedBy: false,
    ...overrides,
  };
}

export function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    $typeName: 'patches.v1.Community',
    id: 'community-1',
    name: 'terminal',
    displayName: 'Terminal people',
    description: '',
    rules: '',
    createdBy: undefined,
    isPublic: true,
    createdAt: undefined,
    updatedAt: undefined,
    counts: undefined,
    viewerRole: COMMUNITY_ROLE.UNSPECIFIED,
    ...overrides,
  };
}

export function makeFilter(overrides: Partial<Filter> = {}): Filter {
  return {
    $typeName: 'patches.v1.Filter',
    id: 'filter-1',
    name: 'Spoilers',
    terms: [
      {
        $typeName: 'patches.v1.FilterTerm',
        id: 't1',
        kind: FILTER_TERM_KIND.WORD,
        value: 'spoiler',
      },
    ],
    scopes: [],
    action: FILTER_ACTION.COLLAPSE,
    expiresAt: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    ...overrides,
  };
}

export function makeFilterList(overrides: Partial<FilterList> = {}): FilterList {
  return {
    $typeName: 'patches.v1.FilterList',
    id: 'list-1',
    ownerActor: makeActor({ id: 'a1', handle: 'alice' }),
    ownerCommunity: undefined,
    name: 'curated',
    displayName: 'Curated blocklist',
    description: '',
    createdAt: undefined,
    updatedAt: undefined,
    ...overrides,
  };
}

export function makeFilterListSubscription(
  overrides: Partial<FilterListSubscription> = {},
): FilterListSubscription {
  return {
    $typeName: 'patches.v1.FilterListSubscription',
    filterList: makeFilterList(),
    action: FILTER_ACTION.COLLAPSE,
    scopes: [],
    createdAt: undefined,
    ...overrides,
  };
}

export function makeLabeler(overrides: Partial<Labeler> = {}): Labeler {
  return {
    $typeName: 'patches.v1.Labeler',
    id: 'labeler-1',
    actor: makeActor({ id: 'a1', handle: 'modbot' }),
    community: undefined,
    isNodeLabeler: false,
    vocabulary: [
      {
        $typeName: 'patches.v1.LabelVocabularyEntry',
        value: 'spam',
        description: '',
        defaultAction: LABEL_ACTION.WARN,
        mandatory: false,
      },
    ],
    createdAt: undefined,
    ...overrides,
  };
}

export function makeModerationLogEntry(
  overrides: Partial<ModerationLogEntry> = {},
): ModerationLogEntry {
  return {
    $typeName: 'patches.v1.ModerationLogEntry',
    id: 'log-1',
    action: MODERATION_ACTION_TYPE.DOMAIN_BLOCK,
    subjectKind: MODERATION_LOG_SUBJECT_KIND.DOMAIN,
    subjectDomain: 'spam.example',
    reasonCategory: MODERATION_REASON_CATEGORY.SPAM,
    appealed: false,
    createdAt: undefined,
    ...overrides,
  };
}

export function makeModerationNotice(overrides: Partial<ModerationNotice> = {}): ModerationNotice {
  return {
    $typeName: 'patches.v1.ModerationNotice',
    id: 'notice-1',
    action: MODERATION_ACTION_TYPE.WARN,
    postId: '',
    reasonCategory: MODERATION_REASON_CATEGORY.SPAM,
    explanation: 'Repeated posting of the same link.',
    createdAt: undefined,
    appealDeadline: undefined,
    appealed: false,
    ...overrides,
  };
}

export function makeAppeal(overrides: Partial<Appeal> = {}): Appeal {
  return {
    $typeName: 'patches.v1.Appeal',
    id: 'appeal-1',
    moderationNoticeId: 'notice-1',
    statement: 'I was not warned first.',
    status: APPEAL_STATUS.OPEN,
    createdAt: undefined,
    resolvedAt: undefined,
    resolutionReason: '',
    ...overrides,
  };
}

export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    $typeName: 'patches.v1.Notification',
    id: 'notif-1',
    type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
    actor: makeActor({ id: 'id-carol', handle: 'carol' }),
    postId: '',
    createdAt: undefined,
    readAt: undefined,
    conversationId: '',
    communityId: '',
    ...overrides,
  };
}

export function makeMediaAttachment(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    $typeName: 'patches.v1.MediaAttachment',
    mediaId: 'media-1',
    altText: '',
    width: 10,
    height: 10,
    mimeType: 'image/png',
    position: 0,
    ...overrides,
  };
}

export function makeFollowRequest(overrides: Partial<FollowRequest> = {}): FollowRequest {
  return {
    $typeName: 'patches.v1.FollowRequest',
    actor: makeActor({ id: 'id-bob', handle: 'bob' }),
    createdAt: undefined,
    ...overrides,
  };
}

export function makeNameplate(overrides: Partial<Nameplate> = {}): Nameplate {
  return {
    $typeName: 'patches.v1.Nameplate',
    nameColor: '',
    glyph: '',
    badges: [],
    avatarFrame: '',
    statusLine: '',
    profileBorder: '',
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    $typeName: 'patches.v1.Session',
    actor: makeActor({ id: 'user-1' }),
    accessToken: 'access-1',
    accessExpiresAt: undefined,
    refreshToken: 'refresh-1',
    refreshExpiresAt: undefined,
    emailVerified: false,
    node: 'patches.example:443',
    ...overrides,
  };
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    $typeName: 'patches.v1.Tag',
    id: 'tag-1',
    name: 'patches',
    displayName: 'patches',
    createdAt: undefined,
    ...overrides,
  };
}

/** B-095 retired `LEGACY_SERVER_VISIBLE` (ADR 0030): every conversation any client can
 * still reach is `E2EE_V1`, so that is the only default these fixtures need. */
export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  const createdBy = overrides.createdBy ?? makeActor();
  return {
    $typeName: 'patches.v1.Conversation',
    id: 'conversation-1',
    kind: CONVERSATION_KIND.DIRECT,
    securityMode: CONVERSATION_SECURITY_MODE.E2EE_V1,
    createdBy,
    members: [
      {
        $typeName: 'patches.v1.ConversationMember',
        actor: createdBy,
        joinedAt: undefined,
        leftAt: undefined,
        lastReadMessageId: '',
        muted: false,
      },
    ],
    createdAt: undefined,
    lastMessageAt: undefined,
    unreadCount: 0,
    ...overrides,
  };
}

export function makeFilteredByHint(overrides: Partial<FilteredByHint> = {}): FilteredByHint {
  return {
    $typeName: 'patches.v1.FilteredByHint',
    provenance: FILTERED_BY_PROVENANCE.FILTER,
    name: 'Spoilers',
    listOwner: undefined,
    action: FILTER_ACTION.COLLAPSE,
    ...overrides,
  };
}

export function makePrivacyPrefs(overrides: Partial<PrivacyPrefs> = {}): PrivacyPrefs {
  return {
    $typeName: 'patches.v1.PrivacyPrefs',
    discoverable: true,
    indexable: true,
    showInLocalFeed: true,
    locked: false,
    privacyNoticeVersion: 0,
    privacyNoticeAcknowledgedAt: undefined,
    ...overrides,
  };
}

export function makePageInfo(overrides: Partial<PageInfo> = {}): PageInfo {
  return {
    $typeName: 'patches.v1.PageInfo',
    nextCursor: '',
    hasMore: false,
    ...overrides,
  };
}

export function makePostCounts(overrides: Partial<PostCounts> = {}): PostCounts {
  return {
    $typeName: 'patches.v1.PostCounts',
    replies: 0,
    likes: 0,
    reposts: 0,
    quotes: 0,
    ...overrides,
  };
}

export function makePostViewerState(overrides: Partial<PostViewerState> = {}): PostViewerState {
  return {
    $typeName: 'patches.v1.PostViewerState',
    liked: false,
    bookmarked: false,
    reposted: false,
    ...overrides,
  };
}

export function makeActorCounts(overrides: Partial<ActorCounts> = {}): ActorCounts {
  return {
    $typeName: 'patches.v1.ActorCounts',
    followers: 0,
    following: 0,
    posts: 0,
    ...overrides,
  };
}

export function makeLabel(overrides: Partial<Label> = {}): Label {
  return {
    $typeName: 'patches.v1.Label',
    id: 'label-1',
    labelerId: 'labeler-1',
    subjectActorId: '',
    subjectPostId: '',
    value: 'spam',
    createdAt: undefined,
    expiresAt: undefined,
    retractedAt: undefined,
    ...overrides,
  };
}

export function makeLabelVocabularyEntry(
  overrides: Partial<LabelVocabularyEntry> = {},
): LabelVocabularyEntry {
  return {
    $typeName: 'patches.v1.LabelVocabularyEntry',
    value: 'spam',
    description: '',
    defaultAction: LABEL_ACTION.WARN,
    mandatory: false,
    ...overrides,
  };
}

export function makeConversationMember(
  overrides: Partial<ConversationMember> = {},
): ConversationMember {
  return {
    $typeName: 'patches.v1.ConversationMember',
    actor: makeActor(),
    joinedAt: undefined,
    leftAt: undefined,
    lastReadMessageId: '',
    muted: false,
    ...overrides,
  };
}

export function makeCommunityMember(overrides: Partial<CommunityMember> = {}): CommunityMember {
  return {
    $typeName: 'patches.v1.CommunityMember',
    actor: makeActor(),
    role: COMMUNITY_ROLE.MEMBER,
    joinedAt: undefined,
    ...overrides,
  };
}

export function makeCommunityInvite(overrides: Partial<CommunityInvite> = {}): CommunityInvite {
  return {
    $typeName: 'patches.v1.CommunityInvite',
    id: 'invite-1',
    communityId: 'community-1',
    inviter: makeActor({ id: 'a1', handle: 'alice' }),
    invitee: makeActor({ id: 'a2', handle: 'bob' }),
    status: COMMUNITY_INVITE_STATUS.PENDING,
    createdAt: undefined,
    ...overrides,
  };
}

export function makeNodeLimits(overrides: Partial<NodeLimits> = {}): NodeLimits {
  return {
    $typeName: 'patches.v1.NodeLimits',
    postBodyMaxChars: 500,
    bioMaxChars: 500,
    displayNameMaxChars: 80,
    handleMaxChars: 30,
    locationTextMaxChars: 100,
    websiteUrlMaxChars: 2048,
    altTextMaxChars: 1000,
    searchQueryMaxChars: 100,
    maxFiltersPerActor: 50,
    maxFilterTermsPerFilter: 20,
    maxFilterListsPublishedPerActor: 10,
    maxFilterListEntries: 500,
    maxFilterListSubscriptions: 50,
    maxFilterListExceptionsPerList: 100,
    maxLabelerSubscriptionsPerActor: 20,
    maxLabelVocabularyEntries: 50,
    maxAppealStatementChars: 2000,
    accountExportMaxReadyArchives: 1,
    ...overrides,
  };
}

export function makePostEdit(overrides: Partial<PostEdit> = {}): PostEdit {
  return {
    $typeName: 'patches.v1.PostEdit',
    id: 'edit-1',
    postId: 'post-1',
    previousBody: '',
    previousContentWarning: '',
    previousMedia: [],
    editedByActorId: 'actor-1',
    createdAt: undefined,
    ...overrides,
  };
}

export function makeBeginSshLoginResponse(
  overrides: Partial<BeginSshLoginResponse> = {},
): BeginSshLoginResponse {
  return {
    $typeName: 'patches.v1.BeginSshLoginResponse',
    challengeId: 'challenge-1',
    nonce: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
}

export function makeBeginSshEnrollmentResponse(
  overrides: Partial<BeginSshEnrollmentResponse> = {},
): BeginSshEnrollmentResponse {
  return {
    $typeName: 'patches.v1.BeginSshEnrollmentResponse',
    challengeId: 'challenge-1',
    nonce: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
}

export function makeGetAppealResponse(
  overrides: Partial<GetAppealResponse> = {},
): GetAppealResponse {
  return { $typeName: 'patches.v1.GetAppealResponse', ...overrides };
}

export function makeListCommunitiesResponse(
  overrides: Partial<ListCommunitiesResponse> = {},
): ListCommunitiesResponse {
  return { $typeName: 'patches.v1.ListCommunitiesResponse', communities: [], ...overrides };
}

export function makeListCommunityMembersResponse(
  overrides: Partial<ListCommunityMembersResponse> = {},
): ListCommunityMembersResponse {
  return { $typeName: 'patches.v1.ListCommunityMembersResponse', members: [], ...overrides };
}

export function makeCompleteSshLoginResponse(
  overrides: Partial<CompleteSshLoginResponse> = {},
): CompleteSshLoginResponse {
  return { $typeName: 'patches.v1.CompleteSshLoginResponse', ...overrides };
}

export function makeGetNodeInfoResponse(
  overrides: Partial<GetNodeInfoResponse> = {},
): GetNodeInfoResponse {
  return {
    $typeName: 'patches.v1.GetNodeInfoResponse',
    domain: 'patches.example',
    softwareVersion: '0.0.0',
    registrationMode: REGISTRATION_MODE.UNSPECIFIED,
    capabilities: [],
    publicRead: true,
    ...overrides,
  };
}

export function makeUpdatePageResponse(
  overrides: Partial<UpdatePageResponse> = {},
): UpdatePageResponse {
  return {
    $typeName: 'patches.v1.UpdatePageResponse',
    document: new Uint8Array(),
    revisionId: 'rev-1',
    ...overrides,
  };
}

export function makeCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    $typeName: 'patches.v1.Credential',
    id: 'cred-1',
    type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
    label: 'laptop',
    identifier: 'SHA256:fingerprint',
    ...overrides,
  };
}

export function makeAddCredentialResponse(
  overrides: Partial<AddCredentialResponse> = {},
): AddCredentialResponse {
  return { $typeName: 'patches.v1.AddCredentialResponse', ...overrides };
}
