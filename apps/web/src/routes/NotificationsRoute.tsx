import { NotificationType, type Notification } from '@patches/proto/es';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './NotificationsRoute.module.css';

function describe(notification: Notification): string {
  const handle = notification.actor?.handle ?? 'someone';
  switch (notification.type) {
    case NotificationType.FOLLOW:
      return `@${handle} followed you`;
    case NotificationType.LIKE:
      return `@${handle} liked your post`;
    case NotificationType.REPLY:
      return `@${handle} replied to your post`;
    case NotificationType.MENTION:
      return `@${handle} mentioned you`;
    case NotificationType.REPOST:
      return `@${handle} reposted your post`;
    case NotificationType.QUOTE:
      return `@${handle} quoted your post`;
    case NotificationType.MESSAGE:
      return `@${handle} sent you a message`;
    case NotificationType.COMMUNITY_INVITE:
      return `@${handle} invited you to a community`;
    case NotificationType.MODERATION:
      return 'A moderator took action on your account';
    default:
      return 'New notification';
  }
}

function targetPath(notification: Notification): string {
  if (notification.postId !== '') return `/p/${notification.postId}`;
  if (notification.conversationId !== '') return `/messages/${notification.conversationId}`;
  if (notification.communityId !== '') return `/c/${notification.communityId}`;
  if (notification.actor) return `/@${notification.actor.handle}`;
  return '/notifications';
}

/** `/notifications` — chronological, never engagement-ranked (Amendment B §194). */
export function NotificationsRoute(): JSX.Element {
  const onError = useErrorToast();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) =>
      api.notifications.listNotifications({ cursor: pageParam, limit: 30 }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => (lastPage.page?.hasMore ? lastPage.page.nextCursor : undefined),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markNotificationsRead({ markAll: true, throughId: '' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
    onError,
  });

  const notifications = query.data?.pages.flatMap((p) => p.notifications) ?? [];

  return (
    <div>
      <div className={styles['header']}>
        <h1>Notifications</h1>
        <button type="button" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
          Mark all read
        </button>
      </div>
      {query.isPending ? <p style={{ padding: '1rem' }}>Loading…</p> : null}
      {notifications.length === 0 && !query.isPending ? (
        <p style={{ padding: '1rem', color: 'var(--fg-muted)' }}>No notifications yet.</p>
      ) : null}
      {notifications.map((notification) => (
        <Link
          key={notification.id}
          to={targetPath(notification)}
          className={`${styles['row']} ${!notification.readAt ? styles['unread'] : ''}`}
        >
          <span>{describe(notification)}</span>
          <span className={styles['time']}>{formatRelativeTime(notification.createdAt)}</span>
        </Link>
      ))}
      {query.hasNextPage ? (
        <button
          type="button"
          className={styles['loadMore']}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
