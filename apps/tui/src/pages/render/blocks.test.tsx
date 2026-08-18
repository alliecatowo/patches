import type { RenderablePageBlock } from '@patches/domain';
import {
  POST_TYPE,
  POST_VISIBILITY,
  type GetActorByHandleResponse,
  type ListActorPostsResponse,
  type ListGuestbookResponse,
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

async function flush(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
    await flush();
    expect(lastFrame() ?? '').toContain('a recent post');
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
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@bob');
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
    await flush();
    expect(lastFrame() ?? '').toContain('lovely page!');
  });

  it('renders NowPlaying, AsciiArt, Spacer, Badges, Friends as documented placeholders/content', () => {
    const blocks: RenderablePageBlock[] = [
      { type: 'NowPlaying', text: 'a great song' },
      { type: 'AsciiArt', art: '(o_o)' },
      { type: 'Spacer', size: 'lg' },
      { type: 'Badges' },
      { type: 'Friends', limit: 5 },
    ];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('a great song');
    expect(frame).toContain('(o_o)');
    expect(frame).toContain('[badges unavailable]');
    expect(frame).toContain('[friends list unavailable]');
  });

  it('renders an unrecognized block type as a visible placeholder, never failing the page', () => {
    const blocks: RenderablePageBlock[] = [{ type: 'Unknown', originalType: 'SomeFutureBlock' }];
    const { lastFrame } = render(
      <PageBlocksView blocks={blocks} context={context()} selectedLinkIndex={undefined} />,
    );
    expect(lastFrame() ?? '').toContain('[unsupported block: SomeFutureBlock]');
  });
});
