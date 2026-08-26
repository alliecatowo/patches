import type { Actor, Notification } from '../api/wire/types.js';
import { NOTIFICATION_TYPE } from '../api/wire/enums.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { groupNotifications, NotificationsScreen } from './NotificationsScreen.js';
import { makeActor, makeNotification } from '../test/wire-fixtures.js';

function actor(handle: string): Actor {
  return makeActor({ id: `id-${handle}`, handle });
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return makeNotification({ actor: actor('carol'), ...overrides });
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

describe('NotificationsScreen MESSAGE rows (B-098, §187/§194)', () => {
  const messageNotification = (
    conversationId: string,
    createdAt?: { seconds: bigint; nanos: number },
  ): Notification =>
    notification({
      type: NOTIFICATION_TYPE.MESSAGE,
      conversationId,
      postId: '',
      actor: actor('dana'),
      ...(createdAt === undefined ? {} : { createdAt }),
    });

  it('renders sender handle + "sent you a message" and no body preview', async () => {
    const api = buildApi({
      listNotifications: vi.fn().mockResolvedValue({
        notifications: [messageNotification('conv-1')],
        page: { hasMore: false, cursor: '' },
      }),
    });
    const { lastFrame } = render(
      <NotificationsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onOpenPost={() => undefined}
        onOpenConversation={() => undefined}
        onOpenAuthor={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('dana'));
    expect(lastFrame()).toContain('sent you a message');
    // §194: nothing beyond handle + fixed verb + time is ever on screen — there is no
    // body field to leak, and the row must not invent one (no preview placeholder).
    expect(lastFrame()).not.toContain('preview');
  });

  it('Enter opens the conversation thread through onOpenConversation', async () => {
    const onOpenConversation = vi.fn();
    const api = buildApi({
      listNotifications: vi.fn().mockResolvedValue({
        notifications: [messageNotification('conv-7')],
        page: { hasMore: false, cursor: '' },
      }),
    });
    const { lastFrame, stdin } = render(
      <NotificationsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onOpenPost={() => undefined}
        onOpenConversation={onOpenConversation}
        onOpenAuthor={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('dana'));
    stdin.write('\r');
    await vi.waitFor(() => expect(onOpenConversation).toHaveBeenCalledWith('conv-7'));
  });

  it('without an onOpenConversation wiring, Enter falls back to the sender profile', async () => {
    const onOpenAuthor = vi.fn();
    const api = buildApi({
      listNotifications: vi.fn().mockResolvedValue({
        notifications: [messageNotification('conv-7')],
        page: { hasMore: false, cursor: '' },
      }),
    });
    const { lastFrame, stdin } = render(
      <NotificationsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onOpenPost={() => undefined}
        onOpenAuthor={onOpenAuthor}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('dana'));
    stdin.write('\r');
    await vi.waitFor(() => expect(onOpenAuthor).toHaveBeenCalledWith(actor('dana')));
  });

  it('MESSAGE rows from different conversations never collapse into one group', () => {
    const first = messageNotification('conv-1');
    const second = messageNotification('conv-2');
    const groups = groupNotifications([first, second]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.conversationId).toBe('conv-1');
    expect(groups[1]?.conversationId).toBe('conv-2');
  });

  it('repeat MESSAGE rows for the same conversation collapse into one group', () => {
    // Grouping requires both rows' createdAt inside GROUP_WINDOW_MS (10 min).
    const now = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanos: 0 };
    const first = messageNotification('conv-1', now);
    const second = messageNotification('conv-1', now);
    const groups = groupNotifications([first, second]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.notifications).toHaveLength(2);
  });
});
