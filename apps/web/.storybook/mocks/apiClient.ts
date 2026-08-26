import type { PatchesApi } from '@patches/client';
import type {
  GetMediaDownloadResponse,
  GetNodeInfoResponse,
  ListPostEditsResponse,
  Post,
  UpdatePageResponse,
} from '@patches/proto/es';

import { localFeedFixture, photoDataUri } from '../fixtures.js';

/**
 * The Storybook stand-in for `src/api/client.ts`, swapped in by the alias in
 * `.storybook/vite.config.ts`. Stories must never hit the network (spec discipline and
 * docs/research/storybook-web.md §6): every RPC a storied component can fire resolves
 * here with deterministic data, and any RPC that is *not* mocked fails loudly instead of
 * silently falling through to a real request.
 */

// --- Story-switchable scenario state -------------------------------------------------

let nodeIsPublic = true;
let localFeed: Post[] = localFeedFixture();

/** HomeRoute stories flip the node's read policy per story. */
export function setStoryNodeInfo(publicRead: boolean): void {
  nodeIsPublic = publicRead;
}

/** Route stories replace the local-feed contents per story. */
export function setStoryLocalFeed(posts: Post[]): void {
  localFeed = posts;
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

const concreteServices: Record<string, MockService> = {
  node: {
    getNodeInfo: (): Promise<GetNodeInfoResponse> =>
      Promise.resolve({ publicRead: nodeIsPublic } as unknown as GetNodeInfoResponse),
  },
  feeds: {
    listLocalFeed: (): Promise<MockPostPage> =>
      Promise.resolve({ posts: localFeed, page: emptyLastPage }),
    listHomeFeed: (): Promise<MockPostPage> =>
      Promise.resolve({ posts: localFeed, page: emptyLastPage }),
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
  moderation: {
    reportPost: (): Promise<Record<string, never>> => Promise.resolve({}),
  },
  pages: {
    updatePage: (): Promise<UpdatePageResponse> =>
      Promise.resolve({ currentRevisionId: 'rev-storybook' } as unknown as UpdatePageResponse),
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
