import { dateToTimestamp } from '@patches/proto';
import type { ListPostEditsResponse } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { PostHistoryScreen } from './PostHistoryScreen.js';

function response(): ListPostEditsResponse {
  return {
    edits: [
      {
        id: 'edit-1',
        postId: 'post-1',
        previousBody: 'the previous words',
        previousContentWarning: 'spoiler',
        previousMedia: [],
        editedByActorId: 'actor-1',
        createdAt: dateToTimestamp(new Date()),
      },
    ],
    page: { nextCursor: '', hasMore: false },
  };
}

describe('PostHistoryScreen', () => {
  it('shows immutable prior body and warning content', async () => {
    const listPostEdits = vi.fn().mockResolvedValue(response());
    const api = { target: 'patches.test:50051', listPostEdits } as unknown as PatchesApi;
    const { lastFrame } = render(<PostHistoryScreen api={api} postId="post-1" isActive />);

    await vi.waitFor(() => expect(lastFrame()).toContain('the previous words'));
    expect(lastFrame()).toContain('CW: spoiler');
    expect(listPostEdits).toHaveBeenCalledWith(
      { postId: 'post-1', cursor: '', limit: 20 },
      undefined,
    );
  });
});
