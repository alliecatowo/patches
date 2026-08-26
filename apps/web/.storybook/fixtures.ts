import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { Actor, Nameplate, Post } from '@patches/proto/es';

/**
 * Deterministic story fixtures for apps/web, shaped after the mocks the route tests use
 * (`HomeRoute.test.tsx`, `PostCard.test.tsx`, `EditWallDialog.test.tsx`). Timestamps are
 * fixed dates, never `now`, so relative-time rendering is stable in stories and smoke
 * tests. Stories must never hit the network — see `.storybook/mocks/apiClient.ts`.
 */

export function makeActor(overrides: Partial<Actor> = {}): Actor {
  const base: Actor = {
    $typeName: 'patches.v1.Actor',
    id: 'actor-1',
    handle: 'allie',
    displayName: 'Allie',
    homeServer: '',
    pinnedPostIds: [],
  } as unknown as Actor;
  return { ...base, ...overrides };
}

export const singleColorNameplate: Nameplate = {
  $typeName: 'patches.v1.Nameplate',
  nameColor: '#FF69B4',
  glyph: '',
  badges: [],
  avatarFrame: '',
  statusLine: '',
  profileBorder: '',
} as unknown as Nameplate;

export const gradientNameplate: Nameplate = {
  ...singleColorNameplate,
  nameColor: '#6b46c1,#2b6cb0',
  glyph: '✿',
};

export function makePost(overrides: Partial<Post> = {}): Post {
  const base: Post = {
    $typeName: 'patches.v1.Post',
    id: 'post-1',
    body: 'A plain fixture post rendered from the Storybook fixture builder.',
    author: makeActor(),
    createdAt: timestampFromDate(new Date('2026-08-26T12:00:00Z')),
    media: [],
    repostedBy: [],
    repostedByTotal: 0,
    tags: [],
    mentions: [],
    labels: [],
    deleted: false,
    contentWarning: '',
  } as unknown as Post;
  return { ...base, ...overrides };
}

/** A small, varied local feed for the route-level stories (two authors, markup, a CW). */
export function localFeedFixture(): Post[] {
  return [
    makePost({
      id: 'feed-1',
      body: 'Shipping the **Storybook** skeleton today — #patches now has a component workbench.',
      createdAt: timestampFromDate(new Date('2026-08-26T11:30:00Z')),
    }),
    makePost({
      id: 'feed-2',
      author: makeActor({
        id: 'actor-2',
        handle: 'nomad',
        displayName: 'Nomad',
        homeServer: 'other.example',
        nameplate: gradientNameplate,
      }),
      body: 'chronological or nothing \nhey @allie see https://example.com/x for details',
      createdAt: timestampFromDate(new Date('2026-08-26T09:00:00Z')),
    }),
    makePost({
      id: 'feed-3',
      body: 'The body stays hidden behind the content warning until expanded.',
      contentWarning: 'spoiler: phase 3 plans',
      createdAt: timestampFromDate(new Date('2026-08-25T18:00:00Z')),
    }),
  ];
}

/** One media attachment, resolved by the mock's `getMediaDownload` (deterministic tile
 * unless the story registers a concrete image via `registerStorybookMedia`). */
export function makeMedia(mediaId: string, altText: string): Post['media'] {
  return [
    { $typeName: 'patches.v1.MediaAttachment', mediaId, altText },
  ] as unknown as Post['media'];
}

/**
 * Inline SVG data-URI "photos" — the only image source stories may use. Network-adjacent
 * placeholder services (picsum & co.) would make stories non-hermetic.
 */
export function photoDataUri(label: string, background: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" fill="#ffffff" font-family="monospace" font-size="40" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
