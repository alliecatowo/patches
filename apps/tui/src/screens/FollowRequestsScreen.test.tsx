import type { Actor, FollowRequest } from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { FollowRequestsScreen } from './FollowRequestsScreen.js';

function actor(handle: string): Actor {
  return { id: `id-${handle}`, handle } as Actor;
}

function request(handle: string): FollowRequest {
  return { actor: actor(handle), createdAt: undefined };
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listFollowRequests: vi.fn().mockResolvedValue({ requests: [request('bob')], page: undefined }),
    acceptFollowRequest: vi.fn().mockResolvedValue({}),
    rejectFollowRequest: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('FollowRequestsScreen', () => {
  it('lists pending follow requests', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <FollowRequestsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('bob'));
  });

  it('accepts the selected request', async () => {
    const acceptFollowRequest = vi.fn().mockResolvedValue({});
    const api = buildApi({ acceptFollowRequest });
    const { lastFrame, stdin } = render(
      <FollowRequestsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('bob'));
    stdin.write('A');
    await vi.waitFor(() =>
      expect(acceptFollowRequest).toHaveBeenCalledWith({ actorId: 'id-bob' }, 'token'),
    );
  });

  it('declines the selected request', async () => {
    const rejectFollowRequest = vi.fn().mockResolvedValue({});
    const api = buildApi({ rejectFollowRequest });
    const { lastFrame, stdin } = render(
      <FollowRequestsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('bob'));
    stdin.write('D');
    await vi.waitFor(() =>
      expect(rejectFollowRequest).toHaveBeenCalledWith({ actorId: 'id-bob' }, 'token'),
    );
  });
});
