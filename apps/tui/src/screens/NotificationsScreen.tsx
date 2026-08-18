import { present } from '../api/present.js';
import { NOTIFICATION_TYPE, timestampToDate, type Actor, type Notification } from '@patches/proto';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { Nameplate } from '../components/Nameplate.js';
import { formatRelativeTime } from '../format/relative-time.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface NotificationsScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g n`). */
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** `Enter` on a LIKE/REPLY/MENTION notification — opens the related post's thread. */
  onOpenPost: (postId: string) => void;
  /** `Enter` on a FOLLOW notification — opens the triggering actor's profile. */
  onOpenAuthor: (actor: Actor) => void;
  /** Fires after `m` successfully marks everything read — lets `App` refresh the
   * status bar's unread badge without waiting for its next poll/screen change. */
  onMarkedAllRead?: (() => void) | undefined;
}

function typeIcon(type: Notification['type']): string {
  switch (type) {
    case NOTIFICATION_TYPE.FOLLOW:
      return '+';
    case NOTIFICATION_TYPE.LIKE:
      return '♥';
    case NOTIFICATION_TYPE.REPLY:
      return '↳';
    case NOTIFICATION_TYPE.MENTION:
      return '@';
    case NOTIFICATION_TYPE.MODERATION:
      return '!';
    default:
      return '·';
  }
}

function typeLabel(type: Notification['type']): string {
  switch (type) {
    case NOTIFICATION_TYPE.FOLLOW:
      return 'followed you';
    case NOTIFICATION_TYPE.LIKE:
      return 'liked your post';
    case NOTIFICATION_TYPE.REPLY:
      return 'replied to your post';
    case NOTIFICATION_TYPE.MENTION:
      return 'mentioned you';
    case NOTIFICATION_TYPE.MODERATION:
      return 'moderation notice';
    default:
      return 'notification';
  }
}

/**
 * `g n` — the caller's notifications (spec §56, §113): FOLLOW/LIKE/REPLY/MENTION/
 * MODERATION, keyset-paginated, `Enter` opens the related post/profile, `m` marks
 * every currently-loaded notification read. No push infrastructure in v0 — the TUI
 * polls (`useUnreadCount`) and refreshes this list manually.
 */
export function NotificationsScreen({
  api,
  isActive,
  ensureAccessToken,
  onOpenPost,
  onOpenAuthor,
  onMarkedAllRead,
}: NotificationsScreenProps): ReactElement {
  const fetchPage = useCallback(
    (cursor: string): Promise<Page<Notification>> =>
      ensureAccessToken()
        .then((accessToken) => api.listNotifications({ cursor, limit: 20 }, accessToken))
        .then((response) => ({ items: response.notifications, page: response.page })),
    [api, ensureAccessToken],
  );
  const {
    items: notifications,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePaginatedList<Notification>(api.target, fetchPage);

  const [selected, setSelected] = useState(0);
  // Ids marked read this session by `m` — `ListNotifications` isn't refetched just to
  // reflect that locally (spec: manual refresh is fine, no push infra in v0).
  const [readOverride, setReadOverride] = useState<ReadonlySet<string>>(new Set());
  const [markStatus, setMarkStatus] = useState<'idle' | 'marking'>('idle');

  const maxIndex = Math.max(notifications.length - 1, 0);
  const effectiveSelected = Math.min(selected, maxIndex);

  async function markAllRead(): Promise<void> {
    if (markStatus === 'marking') return;
    setMarkStatus('marking');
    try {
      const accessToken = await ensureAccessToken();
      await api.markNotificationsRead({ throughId: '', markAll: true }, accessToken);
      setReadOverride(new Set(notifications.map((notification) => notification.id)));
      onMarkedAllRead?.();
    } finally {
      setMarkStatus('idle');
    }
  }

  useInput(
    (input, key) => {
      if (input === 'm') {
        void markAllRead();
        return;
      }
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
        return;
      }
      if (notifications.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(effectiveSelected + 1, maxIndex));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(effectiveSelected - 1, 0));
        return;
      }
      if (key.return) {
        const notification = notifications[effectiveSelected];
        if (notification === undefined) return;
        if (notification.postId !== '') onOpenPost(notification.postId);
        else if (present(notification.actor)) onOpenAuthor(notification.actor);
      }
    },
    { isActive: isActive && !loading },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Notifications</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1} flexDirection="column">
        {notifications.length === 0 ? (
          <Text color={theme.muted}>{loading ? 'Loading…' : 'Nothing yet.'}</Text>
        ) : (
          notifications.map((notification, index) => {
            const isRead = present(notification.readAt) || readOverride.has(notification.id);
            const createdAt = timestampToDate(notification.createdAt);
            const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
            return (
              <Box key={notification.id}>
                <Text
                  color={isActive && index === effectiveSelected ? theme.accent : theme.muted}
                  bold={isActive && index === effectiveSelected}
                >
                  {isRead ? ' ' : '•'} {typeIcon(notification.type)}{' '}
                </Text>
                {present(notification.actor) ? (
                  <Nameplate
                    handle={notification.actor.handle}
                    nameplate={notification.actor.nameplate ?? undefined}
                  />
                ) : (
                  <Text color={theme.muted}>system</Text>
                )}
                <Text> {typeLabel(notification.type)}</Text>
                {when === '' ? null : <Text color={theme.muted}> · {when}</Text>}
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {loading || loadingMore
            ? 'Loading…'
            : hasMore
              ? 'n / space for more'
              : notifications.length === 0
                ? ''
                : '— end —'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>Enter open · m mark all read</Text>
      </Box>
    </Box>
  );
}
