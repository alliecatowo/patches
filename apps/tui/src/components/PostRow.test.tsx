import {
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
