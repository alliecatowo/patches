import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  DeviceLinkStatus,
  FollowState,
  GitHubLoginStatus,
  OidcLoginStatus,
  type Actor,
  type Conversation,
  type GuestbookEntry,
  type GetMediaDownloadResponse,
  type GetNodeInfoResponse,
  type ListPostEditsResponse,
  type Post,
  type UpdatePageResponse,
} from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';

import {
  conversationListFixture,
  deviceLinkFixture,
  friendActor,
  guestbookEntriesFixture,
  localFeedFixture,
  makeRelationship,
  pageDocumentFixture,
  photoDataUri,
  remoteActor,
  threadFixture,
  viewerActor,
} from '../fixtures.js';

/**
 * The Storybook stand-in for `src/api/client.ts`, swapped in by the alias in
 * `.storybook/vite.config.ts`. Stories must never hit the network (spec discipline and
 * docs/research/storybook-web.md §6): every RPC a storied component can fire resolves
 * here with deterministic data, and any RPC that is *not* mocked fails loudly instead of
 * silently falling through to a real request.
 *
 * Scenario state: stories set it through the `setStory*` setters inside a `scenario()`
 * decorator (`.storybook/decorators.tsx`), which resets everything to these defaults
 * before each story so state can never leak across stories.
 */

// --- Story-switchable scenario state -------------------------------------------------

let nodeIsPublic = true;
let localFeed: Post[] = localFeedFixture();
let postsById = new Map<string, Post>();
let replies: Post[] = [];
let actorByHandle = new Map<string, Actor>();
let actorById = new Map<string, Actor>();
let actorPosts: Post[] = [];
let followers: Actor[] = [];
let following: Actor[] = [];
let mutualFollows: Actor[] = [];
let relationships = new Map<string, FollowState>();
let conversations: Conversation[] = [];
let guestbookEntries: GuestbookEntry[] = [];
let pageDocument: Uint8Array = pageDocumentFixture();
let pageActiveSlug = 'home';
let pageOwnerActorId = 'actor-1';
let privacyNoticeVersion = 1;
let acknowledgedNoticeVersion = 1;
let githubStatus: GitHubLoginStatus = GitHubLoginStatus.PENDING;
let deviceStatus: DeviceLinkStatus = DeviceLinkStatus.PENDING;
let oidcStatus: OidcLoginStatus = OidcLoginStatus.PENDING;
let authPollIntervalSeconds = 5;

function seedDefaults(): void {
  const thread = threadFixture();
  postsById = new Map([
    ...localFeedFixture().map((post) => [post.id, post] as const),
    [thread.root.id, thread.root] as const,
  ]);
  replies = thread.replies;
  actorByHandle = new Map([
    ['allie', { ...localFeedFixture()[0]!.author! }],
    ['fixture-friend', friendActor],
    ['fixture-pal', { ...friendActor, id: 'actor-pal', handle: 'fixture-pal' }],
    ['fixture-remote', { ...remoteActor, handle: 'fixture-remote' }],
  ]);
  actorById = new Map([['actor-1', actorByHandle.get('allie')!]]);
  actorPosts = localFeedFixture();
  followers = [friendActor, remoteActor];
  following = [friendActor];
  mutualFollows = [friendActor];
  relationships = new Map();
  conversations = conversationListFixture();
  guestbookEntries = guestbookEntriesFixture();
  pageDocument = pageDocumentFixture();
  pageActiveSlug = 'home';
  pageOwnerActorId = 'actor-1';
  privacyNoticeVersion = 1;
  acknowledgedNoticeVersion = 1;
  githubStatus = GitHubLoginStatus.PENDING;
  deviceStatus = DeviceLinkStatus.PENDING;
  oidcStatus = OidcLoginStatus.PENDING;
  authPollIntervalSeconds = 5;
}

seedDefaults();

/**
 * Resets all scenario state to the deterministic defaults (media registrations survive —
 * they are static per story file). `scenario()` in `.storybook/decorators.tsx` calls this
 * before every story so one story's mutations can never bleed into the next.
 */
export function resetStorybookScenario(): void {
  nodeIsPublic = true;
  localFeed = localFeedFixture();
  seedDefaults();
}

/** HomeRoute stories flip the node's read policy per story. */
export function setStoryNodeInfo(publicRead: boolean): void {
  nodeIsPublic = publicRead;
}

/** Route stories replace the local-feed contents per story. */
export function setStoryLocalFeed(posts: Post[]): void {
  localFeed = posts;
}

/** Register concrete `Post`s addressable by id (`getPost`, quotes, replies-to, edit). */
export function setStoryPosts(posts: Post[]): void {
  postsById = new Map([...postsById, ...posts.map((post) => [post.id, post] as const)]);
}

/** ThreadRoute stories set the reply list (chronological, most recent last). */
export function setStoryReplies(posts: Post[]): void {
  replies = posts;
}

/** ProfileRoute / PinnedPosts stories pin the actor others resolve by handle/id. */
export function setStoryActor(actor: Actor): void {
  actorByHandle.set(actor.handle, actor);
  actorById.set(actor.id, actor);
}

/** ProfileRoute stories replace the actor's own posts tab. */
export function setStoryActorPosts(posts: Post[]): void {
  actorPosts = posts;
}

/** Follower/following tabs. */
export function setStoryFollowLists(followerList: Actor[], followingList: Actor[]): void {
  followers = followerList;
  following = followingList;
}

/** Friends (mutual-follows) page block. */
export function setStoryMutualFollows(actors: Actor[]): void {
  mutualFollows = actors;
}

/** FollowButton / ModerationActions relationship scenarios; the mock keeps follow /
 * unfollow stateful so a play function can flip the label by really clicking. */
export function setStoryRelationship(actorId: string, state: FollowState): void {
  relationships.set(actorId, state);
}

/** MessagesRoute list scenarios (metadata only — never message bodies, spec §183.1). */
export function setStoryConversations(list: Conversation[]): void {
  conversations = list;
}

/** Guestbook block scenarios. */
export function setStoryGuestbook(entries: GuestbookEntry[]): void {
  guestbookEntries = entries;
}

/** PageRoute / profile wall scenarios: the raw document bytes + resolved slug/owner. */
export function setStoryPageDocument(document: Uint8Array, activeSlug = 'home'): void {
  pageDocument = document;
  pageActiveSlug = activeSlug;
}

/** PrivacyNoticeBanner scenarios: node's current version vs this actor's acknowledged one. */
export function setStoryPrivacyVersions(current: number, acknowledged: number): void {
  privacyNoticeVersion = current;
  acknowledgedNoticeVersion = acknowledged;
}

/** Terminal states for the device-flow login buttons (default: forever PENDING). */
export function setStoryAuthStatuses(options: {
  github?: GitHubLoginStatus;
  device?: DeviceLinkStatus;
  oidc?: OidcLoginStatus;
}): void {
  githubStatus = options.github ?? githubStatus;
  deviceStatus = options.device ?? deviceStatus;
  oidcStatus = options.oidc ?? oidcStatus;
}

/**
 * Shrinks the device-flow poll interval (seconds, fractional allowed) so terminal-state
 * stories can assert the retry copy without waiting a real GitHub-style 5s tick.
 */
export function setStoryAuthPollInterval(seconds: number): void {
  authPollIntervalSeconds = seconds;
}

// --- Media ---------------------------------------------------------------------------

const mediaUrls = new Map<string, string>();

/** Registers a concrete image for a `mediaId`; unmapped ids get a deterministic tile. */
export function registerStorybookMedia(mediaId: string, url: string): void {
  mediaUrls.set(mediaId, url);
}

// --- The mock client -----------------------------------------------------------------

interface MockPostPage {
  posts: Post[];
  page: { hasMore: boolean; nextCursor: string };
}

const emptyLastPage: MockPostPage['page'] = { hasMore: false, nextCursor: '' };

function notFound(what: string): never {
  throw new Error(`Storybook mock API: ${what} not found in this story's scenario. Register it via the setStory* helpers in apps/web/.storybook/mocks/apiClient.ts.`);
}

function unimplemented(service: string, method: string): never {
  throw new Error(
    `Storybook mock API: ${service}.${method} is not mocked. Add it to apps/web/.storybook/mocks/apiClient.ts — stories must never reach the network.`,
  );
}

type MockService = Record<string, (...args: never[]) => unknown>;

/** Catch-all so a newly storied component's un-mocked RPC fails visibly, not silently. */
function stubService(name: string): MockService {
  const empty: MockService = {};
  return new Proxy(empty, {
    get: (
      _target: MockService,
      prop: string | symbol,
    ): ((...args: never[]) => unknown) | undefined =>
      typeof prop === 'string' ? () => unimplemented(name, prop) : undefined,
  });
}

function relationshipFor(actorId: string): { relationship: ReturnType<typeof makeRelationship> } {
  return { relationship: makeRelationship(relationships.get(actorId) ?? FollowState.NONE) };
}

const concreteServices: Record<string, MockService> = {
  node: {
    getNodeInfo: (): Promise<GetNodeInfoResponse> =>
      Promise.resolve({
        publicRead: nodeIsPublic,
        socialCapabilities: { maxPostChars: 500 },
      } as unknown as GetNodeInfoResponse),
    getNodePolicy: (): Promise<Record<string, unknown>> =>
      Promise.resolve({ policy: { privacyNoticeVersion } }),
  },
  privacy: {
    getPrivacyPrefs: (): Promise<Record<string, unknown>> =>
      Promise.resolve({ prefs: { privacyNoticeVersion: acknowledgedNoticeVersion } }),
  },
  feeds: {
    listLocalFeed: (): Promise<MockPostPage> =>
      Promise.resolve({ posts: localFeed, page: emptyLastPage }),
    listHomeFeed: (): Promise<MockPostPage> =>
      Promise.resolve({ posts: localFeed, page: emptyLastPage }),
    listActorPosts: (): Promise<MockPostPage> =>
      Promise.resolve({ posts: actorPosts, page: emptyLastPage }),
  },
  media: {
    getMediaDownload: ({ mediaId }: { mediaId: string }): Promise<GetMediaDownloadResponse> =>
      Promise.resolve({
        downloadUrl: mediaUrls.get(mediaId) ?? photoDataUri(mediaId, '#6b46c1'),
      } as unknown as GetMediaDownloadResponse),
  },
  // Reaction RPCs: PostCard keeps its optimistic update when the response carries no
  // viewerState/counts, so stories resolve with both unset.
  reactions: {
    likePost: (): Promise<Record<string, never>> => Promise.resolve({}),
    unlikePost: (): Promise<Record<string, never>> => Promise.resolve({}),
    repostPost: (): Promise<Record<string, never>> => Promise.resolve({}),
    unrepostPost: (): Promise<Record<string, never>> => Promise.resolve({}),
    bookmarkPost: (): Promise<Record<string, never>> => Promise.resolve({}),
    unbookmarkPost: (): Promise<Record<string, never>> => Promise.resolve({}),
  },
  posts: {
    getPost: ({ id }: { id: string }): Promise<{ post: Post }> => {
      const post = postsById.get(id);
      return post === undefined
        ? Promise.reject(notFound(`post ${id}`))
        : Promise.resolve({ post });
    },
    listReplies: (): Promise<MockPostPage> =>
      Promise.resolve({ posts: replies, page: emptyLastPage }),
    createPost: ({ body }: { body: string }): Promise<{ post: Post }> =>
      Promise.resolve({
        post: {
          ...threadFixture().root,
          id: 'post-created-fixture',
          body,
          createdAt: timestampFromDate(new Date('2026-08-26T12:00:00Z')),
        },
      }),
    editPost: ({ id }: { id: string }): Promise<{ post: Post }> => {
      const post = postsById.get(id) ?? threadFixture().root;
      return Promise.resolve({ post: { ...post, id } });
    },
    pinPost: (): Promise<Record<string, never>> => Promise.resolve({}),
    unpinPost: (): Promise<Record<string, never>> => Promise.resolve({}),
    deletePost: (): Promise<Record<string, never>> => Promise.resolve({}),
    listPostEdits: (): Promise<ListPostEditsResponse> =>
      Promise.resolve({
        edits: [
          {
            id: 'edit-1',
            previousBody: 'The body before the one edit this post ever had.',
            createdAt: { seconds: 1_756_000_000n, nanos: 0 },
          },
        ],
      } as unknown as ListPostEditsResponse),
  },
  actors: {
    getActor: ({ id }: { id: string }): Promise<{ actor: Actor }> => {
      const actor = actorById.get(id);
      return actor === undefined
        ? Promise.reject(notFound(`actor ${id}`))
        : Promise.resolve({ actor });
    },
    getActorByHandle: ({ handle }: { handle: string }): Promise<{ actor: Actor }> => {
      const actor = actorByHandle.get(handle);
      return actor === undefined
        ? Promise.reject(notFound(`actor @${handle}`))
        : Promise.resolve({ actor });
    },
    listFollowers: (): Promise<{ actors: Actor[] }> => Promise.resolve({ actors: followers }),
    listFollowing: (): Promise<{ actors: Actor[] }> => Promise.resolve({ actors: following }),
  },
  socialGraph: {
    getRelationship: ({ actorId }: { actorId: string }) => relationshipFor(actorId),
    followActor: ({ actorId }: { actorId: string }) => {
      relationships.set(actorId, FollowState.FOLLOWING);
      return relationshipFor(actorId);
    },
    unfollowActor: ({ actorId }: { actorId: string }) => {
      relationships.delete(actorId);
      return relationshipFor(actorId);
    },
    listMutualFollows: (): Promise<{ actors: Actor[] }> =>
      Promise.resolve({ actors: mutualFollows }),
  },
  moderation: {
    reportPost: (): Promise<Record<string, never>> => Promise.resolve({}),
    blockActor: (): Promise<Record<string, never>> => Promise.resolve({}),
    unblockActor: (): Promise<Record<string, never>> => Promise.resolve({}),
    muteActor: (): Promise<Record<string, never>> => Promise.resolve({}),
    unmuteActor: (): Promise<Record<string, never>> => Promise.resolve({}),
  },
  auth: {
    beginGitHubLogin: (): Promise<Record<string, unknown>> =>
      Promise.resolve({ ...deviceLinkFixture, interval: authPollIntervalSeconds }),
    pollGitHubLogin: (): Promise<Record<string, unknown>> =>
      Promise.resolve({ status: githubStatus }),
    beginDeviceLink: (): Promise<Record<string, unknown>> => {
      const { verificationUri: _omit, ...rest } = deviceLinkFixture;
      return Promise.resolve({ ...rest, interval: authPollIntervalSeconds });
    },
    pollDeviceLink: (): Promise<Record<string, unknown>> => Promise.resolve({ status: deviceStatus }),
    beginOidcLogin: (): Promise<Record<string, unknown>> =>
      Promise.resolve({ ...deviceLinkFixture, interval: authPollIntervalSeconds }),
    pollOidcLogin: (): Promise<Record<string, unknown>> => Promise.resolve({ status: oidcStatus }),
  },
  messages: {
    listConversations: (): Promise<{ conversations: Conversation[] }> =>
      Promise.resolve({ conversations }),
    getConversation: ({ id }: { id: string }): Promise<{ conversation: Conversation }> => {
      const conversation = conversations.find((c) => c.id === id);
      return conversation === undefined
        ? Promise.reject(notFound(`conversation ${id}`))
        : Promise.resolve({ conversation });
    },
  },
  pages: {
    getPage: (): Promise<Record<string, unknown>> =>
      Promise.resolve({
        document: pageDocument,
        activeSlug: pageActiveSlug,
        ownerActorId: pageOwnerActorId,
      }),
    updatePage: (): Promise<UpdatePageResponse> =>
      Promise.resolve({ currentRevisionId: 'rev-storybook' } as unknown as UpdatePageResponse),
    listGuestbook: (): Promise<{ entries: GuestbookEntry[] }> =>
      Promise.resolve({ entries: guestbookEntries }),
    signGuestbook: (): Promise<Record<string, never>> => Promise.resolve({}),
    removeGuestbookEntry: (): Promise<Record<string, never>> => Promise.resolve({}),
    reportGuestbookEntry: (): Promise<Record<string, never>> => Promise.resolve({}),
  },
};

/** The mocked `api` every storied component receives via the `../api/client.js` alias.
 * Unknown services resolve to the loud `stubService` failure above. */
const proxiedApi = new Proxy(concreteServices, {
  get: (target: Record<string, MockService>, prop: string | symbol): unknown =>
    typeof prop === 'string' && !(prop in target) ? stubService(prop) : target[prop as string],
}) as unknown as PatchesApi;

export const mockedApi: PatchesApi = proxiedApi;

// Same export surface as `src/api/client.ts`, so any import shape keeps working.

export const api = mockedApi;

export function establishSession(): Promise<void> {
  return Promise.resolve();
}

export function signOut(): Promise<void> {
  return Promise.resolve();
}

export const sessionManager = {
  subscribe: (): (() => void) => () => undefined,
  getSnapshot: (): { expiresAt: number | undefined } => ({ expiresAt: undefined }),
};

// Re-exported so stories never construct viewer fixtures by hand.
export { viewerActor };
