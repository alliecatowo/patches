import { create } from '@bufbuild/protobuf';
import { ListPostEditsResponseSchema } from '@patches/proto/es';
import { fromDate } from '../api/wire/time.js';
import type { ListPostEditsResponse } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { PostHistoryScreen } from './PostHistoryScreen.js';
import { makePageInfo, makePostEdit } from '../test/wire-fixtures.js';

function response(): ListPostEditsResponse {
  return create(ListPostEditsResponseSchema, {
    edits: [
      makePostEdit({
        previousBody: 'the previous words',
        previousContentWarning: 'spoiler',
        createdAt: fromDate(new Date()),
      }),
    ],
    page: makePageInfo(),
  });
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
