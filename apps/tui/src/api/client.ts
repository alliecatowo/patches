import type { CallOptions } from '@connectrpc/connect';
import { createPatchesApi, type PatchesApi as PatchesSdk } from '@patches/client';

import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { getAmbientAccessToken } from './ambient-token.js';
import { createGrpcTransport } from './transport.js';

export interface ClientOptions {
  /** `host:port` of the Patches server. */
  target: string;
  /** Skip TLS. Only sensible against a local development server. */
  insecure: boolean;
}

/**
 * The TUI's single door to the network.
 *
 * Built over `@patches/client`'s `createPatchesApi` + the Connect gRPC transport
 * (ADR 0023 slice 7, P10-013): every method below is a one-line delegation to the
 * matching generated Connect client method, wrapped by `noToken`/`optionalToken`/
 * `requiredToken` below so this class's exact public method names and arities are
 * unchanged — its ~56 importers needed no edits for the flip. Request/response
 * *types* are inferred straight from the corresponding `this.sdk.<service>.<method>`
 * reference, not repeated here, so this file stays a table of "which service, which
 * RPC, does this call need a token" instead of ~140 hand-typed signatures.
 *
 * `createPatchesApi` sets `x-request-id`/`x-patches-client`/`x-patches-client-version`
 * and a default deadline (`AuthService` 15s, everything else 10s) on every call;
 * `callOptions` below adds only the `authorization` header, since which calls need one
 * varies per call site, not per service. The SDK's own `api.session` (`SessionManager`)
 * is deliberately never touched here — the TUI keeps its own `auth/session.ts`
 * (multi-account keyring, ambient-token fallback), exactly as `apps/web/src/api/client.ts`
 * does and documents (ADR 0023).
 *
 * React components never touch this directly; they go through `hooks/`/`auth/` (spec §68).
 */
export interface PatchesApi extends ReturnType<typeof buildMethods> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- `PatchesApi`
// must stay a `class` (all three call sites do `new PatchesApi(...)`, ADR 0023 P10-013); the
// interface above merges `buildMethods`'s inferred return type onto its instances so every
// RPC's request/response types are derived once, in `buildMethods`, instead of repeated here.
export class PatchesApi {
  readonly target: string;

  constructor(options: ClientOptions) {
    this.target = options.target;
    const sdk = createPatchesApi({
      transport: createGrpcTransport(options),
      clientName: CLIENT_NAME,
      clientVersion: TUI_VERSION,
    });
    Object.assign(this, buildMethods(sdk));
  }

  /**
   * A no-op: `@connectrpc/connect-node`'s `Http2SessionManager` `unref()`s its
   * connection whenever there are no open streams (`http2-session-manager.js`), so an
   * idle Connect session never keeps the process alive the way the twenty grpc-js
   * `Client` instances this replaced did — nothing here needs explicit teardown. Kept
   * as a method so the ~15 call sites that call `api.close()` need no changes.
   */
  close(): void {
    // Intentionally empty — see doc comment above.
  }
}

type Rpc<I, O> = (request: I, options?: CallOptions) => Promise<O>;

/**
 * One line per RPC: which service, which method, whether it needs an access token.
 * `noToken`/`optionalToken`/`requiredToken`/`noRequest*` (below) each infer `I`/`O`
 * straight from the `sdk.<service>.<method>` reference passed in, so this table is the
 * single place every RPC's request/response types and auth requirement are recorded —
 * spread onto `PatchesApi` instances in the constructor above via `Object.assign`.
 */
function buildMethods(sdk: PatchesSdk) {
  return {
    // ---- SystemService ----
    getServerInfo: noRequest(sdk.system.getServerInfo, {}),
    ping: (nonce: string) => sdk.system.ping({ nonce }),

    // ---- AuthService — the bootstrap calls, none of which need an existing access token ----
    register: noToken(sdk.auth.register),
    login: noToken(sdk.auth.login),
    getAuthPolicy: noRequest(sdk.auth.getAuthPolicy, {}),
    recoveryLogin: noToken(sdk.auth.recoveryLogin),
    refreshSession: noToken(sdk.auth.refreshSession),
    logout: noToken(sdk.auth.logout),
    beginSshLogin: noToken(sdk.auth.beginSshLogin),
    completeSshLogin: noToken(sdk.auth.completeSshLogin),
    verifyEmail: noToken(sdk.auth.verifyEmail),

    // ---- AuthService — calls that require an authenticated session ----
    getCurrentSession: noRequestRequiredToken(sdk.auth.getCurrentSession, {}),
    logoutAllSessions: noRequestRequiredToken(sdk.auth.logoutAllSessions, {}),
    listCredentials: noRequestRequiredToken(sdk.auth.listCredentials, {}),
    generateRecoveryCodes: noRequestRequiredToken(sdk.auth.generateRecoveryCodes, {}),
    addCredential: requiredToken(sdk.auth.addCredential),
    beginSshEnrollment: requiredToken(sdk.auth.beginSshEnrollment),
    resendVerification: noRequestRequiredToken(sdk.auth.resendVerification, {}),
    revokeCredential: requiredToken(sdk.auth.revokeCredential),

    // ---- ActorService / FeedService — public reads, no access token required ----
    getActor: noToken(sdk.actors.getActor),
    getActorByHandle: noToken(sdk.actors.getActorByHandle),
    searchActors: noToken(sdk.actors.searchActors),
    // Resolves a remote `user@domain` handle via WebFinger — requires a session (B-028).
    resolveActor: requiredToken(sdk.actors.resolveActor),
    updateProfile: requiredToken(sdk.actors.updateProfile),
    // Anonymous-readable, but the token is forwarded whenever there is one: without it
    // every post comes back un-liked/un-bookmarked (owner report 2026-08-18, B-040).
    listActorPosts: optionalToken(sdk.feeds.listActorPosts),
    listLocalFeed: optionalToken(sdk.feeds.listLocalFeed),
    listTagFeed: optionalToken(sdk.feeds.listTagFeed),
    listCommunityFeed: optionalToken(sdk.feeds.listCommunityFeed),

    // ---- FeedService / SocialGraphService — the caller's own network, requires a session ----
    listHomeFeed: requiredToken(sdk.feeds.listHomeFeed),
    followActor: requiredToken(sdk.socialGraph.followActor),
    unfollowActor: requiredToken(sdk.socialGraph.unfollowActor),
    getRelationship: requiredToken(sdk.socialGraph.getRelationship),
    listMutualFollows: optionalToken(sdk.socialGraph.listMutualFollows),
    listFollowRequests: requiredToken(sdk.socialGraph.listFollowRequests),
    acceptFollowRequest: requiredToken(sdk.socialGraph.acceptFollowRequest),
    rejectFollowRequest: requiredToken(sdk.socialGraph.rejectFollowRequest),

    // ---- NodeService — unauthenticated node discovery (spec §174) ----
    getNodeInfo: noRequest(sdk.node.getNodeInfo, {}),
    getNodePolicy: noRequest(sdk.node.getNodePolicy, {}),

    // ---- PostService — requires an authenticated session unless noted otherwise ----
    createPost: requiredToken(sdk.posts.createPost),
    getPost: optionalToken(sdk.posts.getPost),
    searchPosts: optionalToken(sdk.posts.searchPosts),
    listReplies: optionalToken(sdk.posts.listReplies),
    deletePost: requiredToken(sdk.posts.deletePost),
    editPost: requiredToken(sdk.posts.editPost),
    listPostEdits: optionalToken(sdk.posts.listPostEdits),
    pinPost: requiredToken(sdk.posts.pinPost),
    unpinPost: requiredToken(sdk.posts.unpinPost),

    // ---- ReactionService — likes/bookmarks, all require a session (spec §53) ----
    likePost: requiredToken(sdk.reactions.likePost),
    unlikePost: requiredToken(sdk.reactions.unlikePost),
    bookmarkPost: requiredToken(sdk.reactions.bookmarkPost),
    unbookmarkPost: requiredToken(sdk.reactions.unbookmarkPost),
    listBookmarks: requiredToken(sdk.reactions.listBookmarks),
    listPostLikers: noToken(sdk.reactions.listPostLikers),
    repostPost: requiredToken(sdk.reactions.repostPost),
    unrepostPost: requiredToken(sdk.reactions.unrepostPost),

    // ---- NotificationService — requires a session; the TUI polls, no push (spec §56, §113) ----
    listNotifications: requiredToken(sdk.notifications.listNotifications),
    markNotificationsRead: requiredToken(sdk.notifications.markNotificationsRead),
    getUnreadCount: requiredToken(sdk.notifications.getUnreadCount),

    // ---- ModerationService — block/mute/report, all require a session (spec §55, §61–64) ----
    blockActor: requiredToken(sdk.moderation.blockActor),
    unblockActor: requiredToken(sdk.moderation.unblockActor),
    muteActor: requiredToken(sdk.moderation.muteActor),
    unmuteActor: requiredToken(sdk.moderation.unmuteActor),
    listBlocks: requiredToken(sdk.moderation.listBlocks),
    listMutes: requiredToken(sdk.moderation.listMutes),
    reportPost: requiredToken(sdk.moderation.reportPost),
    reportActor: requiredToken(sdk.moderation.reportActor),
    // A public, anonymized transparency record (spec §201.4) — unauthenticated.
    listModerationLog: noToken(sdk.moderation.listModerationLog),
    listMyModerationNotices: requiredToken(sdk.moderation.listMyModerationNotices),

    // ---- MediaService — direct-to-R2 upload (spec §29–32, §54), all require a session ----
    beginMediaUpload: requiredToken(sdk.media.beginMediaUpload),
    finalizeMediaUpload: requiredToken(sdk.media.finalizeMediaUpload),
    getMediaDownload: requiredToken(sdk.media.getMediaDownload),

    // ---- PageService — Patches Pages (spec §170–172), block-aware like GetPost/GetActor ----
    getPage: noToken(sdk.pages.getPage),
    updatePage: requiredToken(sdk.pages.updatePage),
    listPageRevisions: requiredToken(sdk.pages.listPageRevisions),
    listGuestbook: noToken(sdk.pages.listGuestbook),
    signGuestbook: requiredToken(sdk.pages.signGuestbook),
    removeGuestbookEntry: requiredToken(sdk.pages.removeGuestbookEntry),
    reportGuestbookEntry: requiredToken(sdk.pages.reportGuestbookEntry),

    // ---- CommunityService — public discovery; membership and moderation require a session ----
    createCommunity: requiredToken(sdk.communities.createCommunity),
    getCommunity: optionalToken(sdk.communities.getCommunity),
    listCommunities: optionalToken(sdk.communities.listCommunities),
    joinCommunity: requiredToken(sdk.communities.joinCommunity),
    leaveCommunity: requiredToken(sdk.communities.leaveCommunity),
    listCommunityMembers: requiredToken(sdk.communities.listCommunityMembers),
    updateCommunity: requiredToken(sdk.communities.updateCommunity),
    setCommunityRole: requiredToken(sdk.communities.setCommunityRole),
    removePostFromCommunity: requiredToken(sdk.communities.removePostFromCommunity),
    banFromCommunity: requiredToken(sdk.communities.banFromCommunity),
    inviteToCommunity: requiredToken(sdk.communities.inviteToCommunity),
    respondToCommunityInvite: requiredToken(sdk.communities.respondToCommunityInvite),

    // ---- DirectMessageService — all calls require a session (spec §183) ----
    listConversations: requiredToken(sdk.messages.listConversations),
    getConversation: requiredToken(sdk.messages.getConversation),
    listMessages: requiredToken(sdk.messages.listMessages),
    sendMessage: requiredToken(sdk.messages.sendMessage),
    deleteMessage: requiredToken(sdk.messages.deleteMessage),
    createConversation: requiredToken(sdk.messages.createConversation),
    leaveConversation: requiredToken(sdk.messages.leaveConversation),
    markConversationRead: requiredToken(sdk.messages.markConversationRead),
    listMessageRequests: requiredToken(sdk.messages.listMessageRequests),
    respondToMessageRequest: requiredToken(sdk.messages.respondToMessageRequest),

    // ---- TagService — public search; mute state requires a session ----
    searchTags: optionalToken(sdk.tags.searchTags),
    muteTag: requiredToken(sdk.tags.muteTag),
    unmuteTag: requiredToken(sdk.tags.unmuteTag),
    listMutedTags: requiredToken(sdk.tags.listMutedTags),

    // ---- FilterService — bring-your-own filters (spec §198), all require a session ----
    createFilter: requiredToken(sdk.filters.createFilter),
    updateFilter: requiredToken(sdk.filters.updateFilter),
    deleteFilter: requiredToken(sdk.filters.deleteFilter),
    listFilters: requiredToken(sdk.filters.listFilters),
    exportFilters: noRequestRequiredToken(sdk.filters.exportFilters, {}),
    // `apply: false` (the default) previews without writing (spec §198.5).
    importFilters: requiredToken(sdk.filters.importFilters),

    // ---- FilterListService — publishable/subscribable filter lists (spec §199) ----
    publishFilterList: requiredToken(sdk.filterLists.publishFilterList),
    updateFilterList: requiredToken(sdk.filterLists.updateFilterList),
    deleteFilterList: requiredToken(sdk.filterLists.deleteFilterList),
    getFilterList: optionalToken(sdk.filterLists.getFilterList),
    listFilterLists: optionalToken(sdk.filterLists.listFilterLists),
    listFilterListEntries: optionalToken(sdk.filterLists.listFilterListEntries),
    subscribeFilterList: requiredToken(sdk.filterLists.subscribeFilterList),
    unsubscribeFilterList: requiredToken(sdk.filterLists.unsubscribeFilterList),
    listFilterListSubscriptions: requiredToken(sdk.filterLists.listFilterListSubscriptions),
    setFilterListEntryException: requiredToken(sdk.filterLists.setFilterListEntryException),

    // ---- LabelService — subscriber-scoped annotation (spec §200) ----
    createLabeler: requiredToken(sdk.labels.createLabeler),
    getLabeler: optionalToken(sdk.labels.getLabeler),
    listLabelers: optionalToken(sdk.labels.listLabelers),
    applyLabel: requiredToken(sdk.labels.applyLabel),
    retractLabel: requiredToken(sdk.labels.retractLabel),
    subscribeLabeler: requiredToken(sdk.labels.subscribeLabeler),
    unsubscribeLabeler: requiredToken(sdk.labels.unsubscribeLabeler),
    setLabelerSubscriptionAction: requiredToken(sdk.labels.setLabelerSubscriptionAction),
    listLabelsOnSubject: optionalToken(sdk.labels.listLabelsOnSubject),

    // ---- AppealService — appeals against a node moderation notice (spec §201.3) ----
    createAppeal: requiredToken(sdk.appeals.createAppeal),
    getAppeal: requiredToken(sdk.appeals.getAppeal),
    listMyAppeals: requiredToken(sdk.appeals.listMyAppeals),

    // ---- PrivacyService — notice, discoverability, export, deletion (spec §197) ----
    acknowledgePrivacyNotice: requiredToken(sdk.privacy.acknowledgePrivacyNotice),
    getPrivacyPrefs: requiredToken(sdk.privacy.getPrivacyPrefs),
    updatePrivacyPrefs: requiredToken(sdk.privacy.updatePrivacyPrefs),
    // Enqueues a background export job — never synchronous (spec §30, ADR 0004).
    exportAccount: requiredToken(sdk.privacy.exportAccount),
    getExportStatus: requiredToken(sdk.privacy.getExportStatus),
    // Moves the account to `PENDING_DELETION` immediately, then a grace period (spec §197.4).
    requestAccountDeletion: requiredToken(sdk.privacy.requestAccountDeletion),
    cancelAccountDeletion: requiredToken(sdk.privacy.cancelAccountDeletion),
    getDeletionStatus: requiredToken(sdk.privacy.getDeletionStatus),
  };
}

/** No access token ever sent — a genuinely unauthenticated call. */
function noToken<I, O>(fn: Rpc<I, O>): (request: I) => Promise<O> {
  return (request) => fn(request);
}

/** An access token forwarded when present, never required (public/anonymous-readable). */
function optionalToken<I, O>(fn: Rpc<I, O>): (request: I, accessToken?: string) => Promise<O> {
  return (request, accessToken) => fn(request, callOptions(accessToken));
}

/** An access token the caller must supply. */
function requiredToken<I, O>(fn: Rpc<I, O>): (request: I, accessToken: string) => Promise<O> {
  return (request, accessToken) => fn(request, callOptions(accessToken));
}

/** No request fields on the wire, no access token — `request` is always `{}`. */
function noRequest<I, O>(fn: Rpc<I, O>, request: I): () => Promise<O> {
  return () => fn(request);
}

/** No request fields on the wire, but a required access token — `request` is always `{}`. */
function noRequestRequiredToken<I, O>(
  fn: Rpc<I, O>,
  request: I,
): (accessToken: string) => Promise<O> {
  return (accessToken) => fn(request, callOptions(accessToken));
}

/** Per-call auth header (spec §44): an explicit `accessToken` wins; failing that, the
 * signed-in session's ambient token (B-040) so reads written as anonymous-legal still
 * carry auth on a node with `PUBLIC_READ=false`; signed out, no header is sent at all. */
function callOptions(accessToken?: string): CallOptions {
  const token = accessToken ?? getAmbientAccessToken();
  return token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } };
}
