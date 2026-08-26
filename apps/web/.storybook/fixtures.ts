import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  ConversationSecurityMode,
  FollowState,
  type Actor,
  type Conversation,
  type GuestbookEntry,
  type Nameplate,
  type Post,
  type Relationship,
} from '@patches/proto/es';

/**
 * Deterministic story fixtures for apps/web, shaped after the mocks the route tests use
 * (`HomeRoute.test.tsx`, `PostCard.test.tsx`, `EditWallDialog.test.tsx`). Timestamps are
 * fixed dates, never `now`, so relative-time rendering is stable in stories and smoke
 * tests. Stories must never hit the network — see `.storybook/mocks/apiClient.ts`.
 *
 * Every handle, post id, and body here is obviously synthetic (`fixture-*`, lorem-ish
 * shapes with realistic structure). No real actors, no tokens — and by rule (spec §183.1,
 * Amendment B) DM fixtures carry **conversation metadata only, never message bodies**:
 * the conversation list rows render handles/timestamps, and thread stories show only the
 * server-visible disclosure copy.
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

/** The signed-in viewer session stories use (`asViewer` decorator). Synthetic persona. */
export const viewerActor: Actor = makeActor({
  id: 'actor-viewer',
  handle: 'viewer',
  displayName: 'Fixture Viewer',
});

/** A second local actor for follows/DM lists — never the viewer. */
export const friendActor: Actor = makeActor({
  id: 'actor-friend',
  handle: 'fixture-friend',
  displayName: 'Fixture Friend',
  bio: 'a synthetic account that exists only inside Storybook fixtures',
});

export const remoteActor: Actor = makeActor({
  id: 'actor-remote',
  handle: 'nomad',
  displayName: 'Nomad',
  homeServer: 'other.example',
});

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
  return [{ $typeName: 'patches.v1.MediaAttachment', mediaId, altText }] as unknown as Post['media'];
}

/**
 * Inline SVG data-URI "photos" — the only image source stories may use. Network-adjacent
 * placeholder services (picsum & co.) would make stories non-hermetic.
 */
export function photoDataUri(label: string, background: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" fill="#ffffff" font-family="monospace" font-size="40" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// --- Relationships (FollowButton / ModerationActions) --------------------------------

export function makeRelationship(state: FollowState): Relationship {
  return { $typeName: 'patches.v1.Relationship', state } as unknown as Relationship;
}

// --- DM conversations: metadata only, never bodies (spec §183.1) ----------------------

export function makeConversation(
  overrides: Partial<Conversation> & { id: string; otherHandle: string },
): Conversation {
  const { otherHandle, ...rest } = overrides;
  const base: Conversation = {
    $typeName: 'patches.v1.Conversation',
    id: overrides.id,
    securityMode: ConversationSecurityMode.E2EE_V1,
    unreadCount: 0,
    members: [
      { $typeName: 'patches.v1.ConversationMember', actor: viewerActor } as Conversation['members'][number],
      {
        $typeName: 'patches.v1.ConversationMember',
        actor: makeActor({ id: `actor-${otherHandle}`, handle: otherHandle }),
      } as Conversation['members'][number],
    ],
    lastMessageAt: timestampFromDate(new Date('2026-08-26T10:00:00Z')),
  } as unknown as Conversation;
  return { ...base, ...rest };
}

/**
 * The conversation-list fixture: three synthetic rows with varied unread counts and
 * timestamps. Handles/name only — a conversation row has no body text, and none is
 * invented here (v0 DMs are server-visible; the route renders the §183.1 disclosure
 * itself, which the stories show verbatim).
 */
export function conversationListFixture(): Conversation[] {
  return [
    makeConversation({ id: 'conv-1', otherHandle: 'fixture-friend', unreadCount: 2 }),
    makeConversation({
      id: 'conv-2',
      otherHandle: 'fixture-pal',
      unreadCount: 0,
      lastMessageAt: timestampFromDate(new Date('2026-08-24T08:30:00Z')),
    }),
    makeConversation({
      id: 'conv-3',
      otherHandle: 'fixture-remote',
      unreadCount: 0,
      members: [
        { $typeName: 'patches.v1.ConversationMember', actor: viewerActor } as Conversation['members'][number],
        {
          $typeName: 'patches.v1.ConversationMember',
          actor: makeActor({
            id: 'actor-fixture-remote',
            handle: 'fixture-remote',
            homeServer: 'other.example',
          }),
        } as Conversation['members'][number],
      ],
      lastMessageAt: timestampFromDate(new Date('2026-08-20T16:00:00Z')),
    }),
  ];
}

// --- Guestbook (public page content — bodies are fine, they are not DMs) --------------

export function guestbookEntriesFixture(): GuestbookEntry[] {
  const entry = (id: string, author: Actor, body: string, when: string): GuestbookEntry =>
    ({
      $typeName: 'patches.v1.GuestbookEntry',
      id,
      author,
      body,
      createdAt: timestampFromDate(new Date(when)),
    }) as unknown as GuestbookEntry;
  return [
    entry('gb-1', friendActor, 'first synthetic guestbook entry — great page!', '2026-08-25T09:00:00Z'),
    entry(
      'gb-2',
      remoteActor,
      'signing from a fixture on another node. chronological or nothing.',
      '2026-08-24T14:00:00Z',
    ),
    entry(
      'gb-3',
      makeActor({ id: 'actor-gb3', handle: 'fixture-guest', displayName: 'Fixture Guest' }),
      'third entry, older than the rest.',
      '2026-08-20T18:30:00Z',
    ),
  ];
}

// --- Thread (root + replies) -----------------------------------------------------------

/** A focused thread: one root post with markup plus two chronological replies. */
export function threadFixture(): { root: Post; replies: Post[] } {
  const root = makePost({
    id: 'thread-root',
    body: 'The focused root post of a **thread fixture** — replies land below, chronological, one indent level.',
    createdAt: timestampFromDate(new Date('2026-08-26T12:00:00Z')),
  });
  const replies = [
    makePost({
      id: 'reply-1',
      author: friendActor,
      body: 'first reply fixture — @viewer this thread renders under the root.',
      createdAt: timestampFromDate(new Date('2026-08-26T12:05:00Z')),
    }),
    makePost({
      id: 'reply-2',
      author: makeActor({ id: 'actor-3', handle: 'fixture-wren', displayName: 'Fixture Wren' }),
      body: 'second reply, slightly later. #fixture',
      createdAt: timestampFromDate(new Date('2026-08-26T12:40:00Z')),
    }),
  ];
  return { root, replies };
}

// --- Page documents (spec §170–172) -----------------------------------------------------

/** Encodes a page document as the raw UTF-8 JSON bytes `GetPageResponse.document` carries. */
export function pageDocumentBytes(document: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document));
}

/** The default wall/page document for profile-wall and PageRoute stories. */
export function pageDocumentFixture(): Uint8Array {
  return pageDocumentBytes({
    version: 1,
    theme: { accent: '#6b46c1', background: '', border: 'solid' },
    pages: [
      {
        slug: 'home',
        title: 'Home',
        blocks: [
          { type: 'Hero', title: 'fixture page', subtitle: 'chronological or nothing' },
          { type: 'Text', body: 'A synthetic page rendered from the Storybook fixture builder.' },
          {
            type: 'AsciiArt',
            art: '  ___  \n |___| \n |___| ',
          },
          {
            type: 'Links',
            links: [
              { label: 'fixture link', href: 'https://example.com/fixture' },
              { label: 'rejected link', href: 'javascript:alert(1)' },
            ],
          },
        ],
      },
      {
        slug: 'about',
        title: 'About',
        blocks: [{ type: 'Text', body: 'Second sub-page fixture.' }],
      },
    ],
  });
}

// --- Auth device flows -------------------------------------------------------------------

/** Deterministic device-link shape shared by the GitHub / OIDC / terminal-link buttons. */
export const deviceLinkFixture = {
  deviceCode: 'fixture-device-code',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  interval: 5,
};
