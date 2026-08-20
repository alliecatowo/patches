import { NOTIFICATION_TYPE } from '@patches/proto';
import type { Actor, Notification } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { NotificationsScreen } from './NotificationsScreen.js';

function actor(handle: string): Actor {
  return { id: `id-${handle}`, handle } as Actor;
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
    actor: actor('carol'),
    postId: '',
    createdAt: undefined,
    readAt: undefined,
    ...overrides,
  } as unknown as Notification;
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listNotifications: vi.fn().mockResolvedValue({
      notifications: [notification()],
      page: { hasMore: false, cursor: '' },
    }),
    markNotificationsRead: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('NotificationsScreen FOLLOW_REQUEST rows (§197.5)', () => {
  it('renders a follow-request notification with a hint to :followrequests', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <NotificationsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onOpenPost={() => undefined}
        onOpenAuthor={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('carol'));
    expect(lastFrame()).toContain('wants to follow you');
    expect(lastFrame()).toContain(':followrequests');
  });

  it('opens the requester profile on Enter, same as a FOLLOW notification', async () => {
    const onOpenAuthor = vi.fn();
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <NotificationsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onOpenPost={() => undefined}
        onOpenAuthor={onOpenAuthor}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('carol'));
    stdin.write('\r');
    await vi.waitFor(() => expect(onOpenAuthor).toHaveBeenCalledWith(actor('carol')));
  });
});
