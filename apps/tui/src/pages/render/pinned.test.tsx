import type { GetActorResponse } from '../../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import type { PatchesApi } from '../../api/client.js';
import { PinnedPostsSection } from './pinned.js';
import { makeActor, makePost } from '../../test/wire-fixtures.js';

/** Mirrors `blocks.test.tsx`'s `fakeApi` — a hand-built `PatchesApi` stand-in, not the
 * full `FakeApiHandle` (which has no pinned-posts writer yet — `fake-api.ts` is
 * outside this task's owned files). */
function fakeApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return { ...overrides } as unknown as PatchesApi;
}

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

describe('PinnedPostsSection (P12-109)', () => {
  it('renders nothing when the owner has no pinned posts', async () => {
    const api = fakeApi({
      getActor: () => Promise.resolve<GetActorResponse>({ actor: makeActor() }),
    });
    const { lastFrame } = render(<PinnedPostsSection api={api} ownerActorId="actor-1" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(lastFrame() ?? '').toBe('');
  });

  it('fetches and renders each pinned post, in pinned order', async () => {
    const api = fakeApi({
      getActor: () =>
        Promise.resolve<GetActorResponse>({
          actor: makeActor({ pinnedPostIds: ['p1', 'p2'] }),
        }),
      getPost: ({ id }) =>
        Promise.resolve({
          post: makePost({
            id,
            body: id === 'p1' ? 'first pinned post' : 'second pinned post',
            rootPostId: id,
          }),
        }),
    });
    const { lastFrame } = render(<PinnedPostsSection api={api} ownerActorId="actor-1" />);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('second pinned post'));
    expect(frame).toContain('pinned');
    expect(frame).toContain('first pinned post');
    expect(frame.indexOf('first pinned post')).toBeLessThan(frame.indexOf('second pinned post'));
  });

  it('drops a pin that no longer resolves instead of showing an error', async () => {
    const api = fakeApi({
      getActor: () =>
        Promise.resolve<GetActorResponse>({ actor: makeActor({ pinnedPostIds: ['removed'] }) }),
      getPost: () => Promise.reject(new Error('NOT_FOUND')),
    });
    const { lastFrame } = render(<PinnedPostsSection api={api} ownerActorId="actor-1" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(lastFrame() ?? '').toBe('');
  });
});
