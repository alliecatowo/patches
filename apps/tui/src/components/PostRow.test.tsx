import {
  COMMUNITY_ROLE,
  dateToTimestamp,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  type Post,
} from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { PostRow } from './PostRow.js';

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    author: {
      id: 'actor-1',
      handle: 'alice',
      displayName: '',
      bio: '',
      locationText: '',
      websiteUrl: '',
      avatar: undefined,
      isLocal: true,
      joinedAt: dateToTimestamp(new Date('2026-01-01T00:00:00.000Z')),
      counts: undefined,
      nameplate: undefined,
      flair: undefined,
      pinnedPostIds: [],
    },
    body: 'hello world',
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: 'post-1',
    media: [],
    createdAt: dateToTimestamp(new Date()),
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

describe('PostRow content warnings (P3-003)', () => {
  it('renders the body directly when there is no content warning', () => {
    const { lastFrame } = render(<PostRow post={post()} />);
    expect(lastFrame()).toContain('hello world');
  });

  it('hides the body behind the warning by default', () => {
    const { lastFrame } = render(<PostRow post={post({ contentWarning: 'spoilers' })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('spoilers');
    expect(frame).toContain('press v to reveal');
    expect(frame).not.toContain('hello world');
  });

  it('shows both the warning and the body once revealed', () => {
    const { lastFrame } = render(<PostRow post={post({ contentWarning: 'spoilers' })} revealed />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('spoilers');
    expect(frame).toContain('hello world');
    expect(frame).not.toContain('press v to reveal');
  });

  it('sanitizes control characters out of the rendered body', () => {
    const { lastFrame } = render(<PostRow post={post({ body: 'hi\x1b[2Jthere' })} />);
    expect(lastFrame()).toContain('hi[2Jthere');
  });
});

describe('PostRow media attachments (P5-003/B-004)', () => {
  it('renders nothing extra for a post with no media', () => {
    const { lastFrame } = render(<PostRow post={post()} />);
    expect(lastFrame()).not.toContain('image ·');
  });

  it('renders the spec §75 fallback box outside a Kitty terminal/renderer context', () => {
    const withMedia = post({
      media: [
        {
          mediaId: 'media-1',
          altText: '',
          width: 800,
          height: 600,
          mimeType: 'image/jpeg',
          position: 0,
        },
      ],
    });
    const { lastFrame } = render(<PostRow post={withMedia} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('image · 800×600 · jpeg');
    expect(frame).toContain('press o to open externally');
  });

  it('does not render attachments behind an un-revealed content warning', () => {
    const withMedia = post({
      contentWarning: 'spoilers',
      media: [
        {
          mediaId: 'media-1',
          altText: '',
          width: 10,
          height: 10,
          mimeType: 'image/png',
          position: 0,
        },
      ],
    });
    const { lastFrame } = render(<PostRow post={withMedia} />);
    expect(lastFrame() ?? '').not.toContain('image ·');
  });
});

describe('PostRow social-depth presentation (P11-009/P12-104)', () => {
  it('shows collapsed repost attribution and the viewer repost state', () => {
    const reposter = post().author;
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: reposter === undefined ? [] : [reposter],
          repostedByTotal: 3,
          counts: { likes: 1, replies: 2, reposts: 3, quotes: 4 },
          viewerState: { liked: false, bookmarked: false, reposted: true },
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↻ @alice +2 reposted');
    expect(frame).toContain('↻ 3');
    expect(frame).toContain('❝ 4');
    expect(frame).toContain('reposted');
  });

  it('renders a quote as one bounded preview and never recursively nests it', () => {
    const nested = post({ id: 'nested', body: 'must not render recursively' });
    const quoted = post({ id: 'quoted', body: 'quoted body', quotedPost: nested });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: quoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @alice');
    expect(frame).toContain('quoted body');
    expect(frame).not.toContain('must not render recursively');
  });

  it('marks edits and community attribution without changing the body', () => {
    const { lastFrame } = render(
      <PostRow
        post={post({
          editedAt: dateToTimestamp(new Date()),
          community: {
            id: 'community-1',
            name: 'computers',
            displayName: 'Computers',
            description: '',
            rules: '',
            createdBy: undefined,
            isPublic: true,
            createdAt: undefined,
            updatedAt: undefined,
            counts: undefined,
            viewerRole: COMMUNITY_ROLE.UNSPECIFIED,
          },
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('c/computers');
    expect(frame).toContain('edited');
    expect(frame).toContain('hello world');
  });
});

describe('PostRow bounded body preview (P12-017)', () => {
  it('folds a long post into eight measured rows and expands on demand', () => {
    const long = Array.from({ length: 20 }, (_, index) => `line ${String(index)}`).join('\n');
    const folded = render(<PostRow post={post({ body: long })} width={40} />);
    expect(folded.lastFrame()).toContain('press v to expand');
    expect(folded.lastFrame()).not.toContain('line 19');
    folded.unmount();

    const expanded = render(<PostRow post={post({ body: long })} width={40} expanded />);
    expect(expanded.lastFrame()).toContain('line 19');
    expect(expanded.lastFrame()).not.toContain('press v to expand');
  });
});
