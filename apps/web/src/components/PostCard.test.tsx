import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { Post } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PostCard } from './PostCard.js';

function renderPostCard(post: Post, focused = false): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<PostCard post={post} focused={focused} />} />
          <Route path="/p/:id" element={<div>Thread Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('PostCard', () => {
  const mockPost: Post = {
    $typeName: 'patches.v1.Post',
    id: 'post-123',
    body: 'Hello world from test',
    author: {
      $typeName: 'patches.v1.Actor',
      id: 'actor-allie',
      handle: 'allie',
      displayName: 'Allie',
      pinnedPostIds: [],
    },
    createdAt: timestampFromDate(new Date()),
    media: [],
    repostedBy: [],
    repostedByTotal: 0,
    tags: [],
    mentions: [],
    labels: [],
    deleted: false,
    contentWarning: '',
  } as unknown as Post;

  it('renders post body and author', () => {
    renderPostCard(mockPost);
    expect(screen.getByText('Hello world from test')).toBeInTheDocument();
    expect(screen.getByText('Allie')).toBeInTheDocument();
  });

  it('navigates to thread when card is clicked', () => {
    renderPostCard(mockPost);
    const card = screen.getByRole('article', { name: /Post by @allie/ });
    fireEvent.click(card);
    expect(screen.getByText('Thread Page')).toBeInTheDocument();
  });

  it('applies the author nameplate colour and glyph to the display name (B-129)', () => {
    const nameplated = {
      ...mockPost,
      author: {
        ...mockPost.author,
        nameplate: {
          $typeName: 'patches.v1.Nameplate',
          nameColor: '#FF69B4',
          glyph: '✿',
          badges: [],
          avatarFrame: '',
          statusLine: '',
          profileBorder: '',
        },
      },
    } as unknown as Post;
    renderPostCard(nameplated);

    // The display name's colour lives on the CosmeticText span wrapping it inside the
    // profile link, and the glyph rides along (aria-hidden — decorative).
    const displayName = screen.getByText('Allie');
    expect(displayName.closest('a')).not.toBeNull();
    expect(displayName).toHaveStyle({ color: '#FF69B4' });
    // Twice: once beside the display name, once on the @handle Nameplate.
    expect(screen.getAllByText('✿')).toHaveLength(2);
  });

  it('leaves the display name untouched when the author has no nameplate', () => {
    renderPostCard(mockPost);
    const displayName = screen.getByText('Allie');
    expect(displayName.closest('a')).not.toBeNull();
    // No inline colour — the plain stylesheet value applies.
    expect(displayName).not.toHaveStyle({ color: '#FF69B4' });
  });
});
