import { dateToTimestamp, POST_TYPE, POST_VISIBILITY, type Post } from '@patches/proto';
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
