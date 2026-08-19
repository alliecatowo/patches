import { NotificationType, type Notification } from '@patches/proto/es';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  if (notification.type === NotificationType.MODERATION) return '/appeals';
  if (notification.postId !== '') return `/p/${notification.postId}`;
  if (notification.conversationId !== '') return `/messages/${notification.conversationId}`;
  if (notification.communityId !== '') return `/c/${notification.communityId}`;
  if (notification.actor) return `/@${notification.actor.handle}`;
  return '/notifications';
}

/** `/notifications` — chronological, never engagement-ranked (Amendment B §194). Also
 * surfaces pending follow requests (spec §197.5, locked accounts) inline, since they
 * need action rather than just reading. */
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

  const followRequestsQuery = useQuery({
    queryKey: ['follow-requests'],
    queryFn: () => api.socialGraph.listFollowRequests({ cursor: '', limit: 50 }),
  });
  const invalidateFollowRequests = (): void =>
    void queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
  const acceptRequest = useMutation({
    mutationFn: (actorId: string) => api.socialGraph.acceptFollowRequest({ actorId }),
    onSuccess: invalidateFollowRequests,
    onError,
  });
  const rejectRequest = useMutation({
    mutationFn: (actorId: string) => api.socialGraph.rejectFollowRequest({ actorId }),
    onSuccess: invalidateFollowRequests,
    onError,
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
      {followRequestsQuery.data && followRequestsQuery.data.requests.length > 0 ? (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '0.95rem' }}>Follow requests</h2>
          {followRequestsQuery.data.requests.map((request) => (
            <div
              key={request.actor?.id}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}
            >
              <Link to={`/@${request.actor?.handle ?? ''}`}>@{request.actor?.handle}</Link>
              <button
                type="button"
                onClick={() => request.actor && acceptRequest.mutate(request.actor.id)}
                disabled={acceptRequest.isPending}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => request.actor && rejectRequest.mutate(request.actor.id)}
                disabled={rejectRequest.isPending}
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
