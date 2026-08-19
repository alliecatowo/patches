import type { RenderablePageBlock } from '@patches/domain';
import {
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  type GetActorByHandleResponse,
  type ListActorPostsResponse,
  type ListGuestbookResponse,
  type ListMutualFollowsResponse,
} from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import type { PatchesApi } from '../../api/client.js';
import { collectLinks, PageBlocksView, type PageRenderContext } from './blocks.js';

/** A minimal `PatchesApi` stand-in covering only the calls `PageBlocksView`'s async
 * blocks (`Posts`/`TopEight`/`Guestbook`) make — this is a renderer unit test, not an
 * end-to-end one (`apps/tui/test/pages.test.tsx` covers the full `App` path), so a
 * hand-built object is more direct than pulling in the whole `FakeApiHandle`. */
function fakeApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  const base: Partial<PatchesApi> = {
    listActorPosts: () =>
      Promise.resolve<ListActorPostsResponse>({
        posts: [],
        page: { nextCursor: '', hasMore: false },
      }),
    getActorByHandle: () => Promise.reject(new Error('no such actor in this test')),
    listGuestbook: () =>
      Promise.resolve<ListGuestbookResponse>({
        entries: [],
        page: { nextCursor: '', hasMore: false },
      }),
    listMutualFollows: () =>
      Promise.resolve<ListMutualFollowsResponse>({
        actors: [],
        page: { nextCursor: '', hasMore: false },
      }),
  };
  return { ...base, ...overrides } as unknown as PatchesApi;
}

function context(overrides: Partial<PageRenderContext> = {}): PageRenderContext {
  return {
    api: fakeApi(),
    handle: 'alice',
    slug: 'index',
    ownerActorId: 'actor-1',
    guestbookRefreshKey: 0,
    ...overrides,
  };
}

/**
 * Polls `lastFrame()` until `predicate` holds, instead of sleeping a fixed
 * duration — mirrors `apps/tui/test/harness.tsx`'s `waitForFrame`/`expectFrame`;
 * this file renders `PageBlocksView` directly rather than through the full `App`
 * harness, so it keeps its own copy rather than importing a `test/`-only helper.
 */
async function waitForFrame(
  lastFrame: () => string | undefined,
  predicate: (frame: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const stepMs = 10;
  const deadline = Date.now() + timeoutMs;
  let frame = lastFrame() ?? '';
  while (!predicate(frame)) {
    if (Date.now() >= deadline) {
      throw new Error(`waitForFrame: timed out after ${timeoutMs}ms. Last frame:\n${frame}`);
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    frame = lastFrame() ?? '';
  }
  return frame;
}

/** Shorthand: waits until the frame contains `text`, returns the frame. */
async function expectFrame(
  lastFrame: () => string | undefined,
  text: string,
  timeoutMs = 2000,
): Promise<string> {
  return waitForFrame(lastFrame, (frame) => frame.includes(text), timeoutMs);
}

describe('PageBlocksView (P45-004/005)', () => {
  it('renders Text, Markdown (headings/bold/italic/lists/code), and Hero', () => {
    const blocks: RenderablePageBlock[] = [
      { type: 'Text', body: 'plain text' },
      { type: 'Markdown', body: '# Heading\n**bold** *italic* `code`\n- item one\n1. item two' },
      { type: 'Hero', title: 'Welcome', subtitle: 'a subtitle' },
    ];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('plain text');
    expect(frame).toContain('Heading');
    expect(frame).toContain('bold');
    expect(frame).toContain('italic');
    expect(frame).toContain('code');
    expect(frame).toContain('item one');
    expect(frame).toContain('item two');
    expect(frame).toContain('Welcome');
    expect(frame).toContain('a subtitle');
  });

  it('renders Links and highlights the selected one', () => {
    const blocks: RenderablePageBlock[] = [
      {
        type: 'Links',
        links: [
          { label: 'First', href: 'https://one.test' },
          { label: 'Second', href: 'https://two.test' },
        ],
      },
    ];
    expect(collectLinks(blocks)).toEqual([
      { label: 'First', href: 'https://one.test' },
      { label: 'Second', href: 'https://two.test' },
    ]);
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={1} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('First');
    expect(frame).toContain('› Second');
  });

  it('renders Image/Gallery as the fallback box outside a Kitty context', () => {
    const blocks: RenderablePageBlock[] = [
      { type: 'Image', mediaId: '11111111-1111-4111-8111-111111111111', alt: 'a photo' },
      {
        type: 'Gallery',
        mediaIds: ['22222222-2222-4222-8222-222222222222'],
        caption: 'a gallery',
      },
    ];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('image ·');
    expect(frame).toContain('a gallery');
  });

  it("renders Posts by fetching the owner's recent posts", async () => {
    const api = fakeApi({
      listActorPosts: () =>
        Promise.resolve({
          posts: [
            {
              id: 'p1',
              author: { id: 'actor-1', handle: 'alice' } as never,
              body: 'a recent post',
              postType: POST_TYPE.NOTE,
              linkUrl: '',
              visibility: POST_VISIBILITY.PUBLIC,
              inReplyToId: '',
              rootPostId: 'p1',
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
            },
          ],
          page: { nextCursor: '', hasMore: false },
        }),
    });
    const blocks: RenderablePageBlock[] = [{ type: 'Posts', limit: 5 }];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context({ api })} selectedLinkIndex={undefined} />,
    );
    expect(lastFrame() ?? '').toContain('Loading posts');
    await expectFrame(lastFrame, 'a recent post');
  });

  it('resolves TopEight actors to nameplates and skips remote refs', async () => {
    const api = fakeApi({
      getActorByHandle: ({ handle }) =>
        handle === 'bob'
          ? Promise.resolve<GetActorByHandleResponse>({
              actor: {
                id: 'actor-bob',
                handle: 'bob',
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
              },
            })
          : Promise.reject(new Error('not found')),
    });
    const blocks: RenderablePageBlock[] = [
      { type: 'TopEight', actors: ['@bob', '@remote@otherserver.example'] },
    ];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context({ api })} selectedLinkIndex={undefined} />,
    );
    const frame = await expectFrame(lastFrame, '@bob');
    expect(frame).toContain('@remote@otherserver.example');
  });

  it('renders Guestbook entries and an empty state', async () => {
    const api = fakeApi({
      listGuestbook: () =>
        Promise.resolve({
          entries: [
            {
              id: 'g1',
              author: { id: 'actor-2', handle: 'carol' } as never,
              body: 'lovely page!',
              createdAt: undefined,
            },
          ],
          page: { nextCursor: '', hasMore: false },
        }),
    });
    const blocks: RenderablePageBlock[] = [{ type: 'Guestbook', limit: 20 }];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context({ api })} selectedLinkIndex={undefined} />,
    );
    await expectFrame(lastFrame, 'lovely page!');
  });

  it('renders NowPlaying, AsciiArt, Spacer, Badges as documented placeholders/content', () => {
    const blocks: RenderablePageBlock[] = [
      { type: 'NowPlaying', text: 'a great song' },
      { type: 'AsciiArt', art: '(o_o)' },
      { type: 'Spacer', size: 'lg' },
      { type: 'Badges' },
    ];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('a great song');
    expect(frame).toContain('(o_o)');
    expect(frame).toContain('[badges unavailable]');
  });

  it('renders Friends via ListMutualFollows, and an empty state (B-024)', async () => {
    const api = fakeApi({
      listMutualFollows: ({ actorId }) =>
        actorId === 'actor-1'
          ? Promise.resolve<ListMutualFollowsResponse>({
              actors: [
                {
                  id: 'actor-bob',
                  handle: 'bob',
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
                },
              ],
              page: { nextCursor: '', hasMore: false },
            })
          : Promise.reject(new Error('unexpected actorId')),
    });
    const blocks: RenderablePageBlock[] = [{ type: 'Friends', limit: 5 }];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context({ api })} selectedLinkIndex={undefined} />,
    );
    const frame = await expectFrame(lastFrame, '@bob');
    expect(frame).not.toContain('unavailable');
  });

  it('renders an empty state when there are no mutual follows', async () => {
    const blocks: RenderablePageBlock[] = [{ type: 'Friends', limit: 5 }];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    await expectFrame(lastFrame, 'No mutual follows yet.');
  });

  it('renders an unrecognized block type as a visible placeholder, never failing the page', () => {
    const blocks: RenderablePageBlock[] = [{ type: 'Unknown', originalType: 'SomeFutureBlock' }];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    expect(lastFrame() ?? '').toContain('[unsupported block: SomeFutureBlock]');
  });
});
