import { useContentSize } from '../app/layout.js';
import { present } from '../api/present.js';
import { NOTIFICATION_TYPE, timestampToDate, type Actor, type Notification } from '@patches/proto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { Loading } from '../components/Loading.js';
import { Nameplate } from '../components/Nameplate.js';
import { VirtualList } from '../components/VirtualList.js';
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
  /** Fires whenever notifications are marked read — by `m`, by opening one, or by
   * simply having them on screen long enough — so `App` can drop the status bar's
   * unread badge without waiting for its next poll (owner feedback 2026-08-18:
   * "notifications aren't being read as I read them"). */
  onReadStateChanged?: (() => void) | undefined;
}

/** How long a notification has to sit on screen before it counts as read. Long
 * enough that scrolling straight past a screenful doesn't silently clear it. */
const AUTO_READ_DELAY_MS = 800;

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
  onReadStateChanged,
}: NotificationsScreenProps): ReactElement {
  const { rows, columns } = useContentSize();
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

  // Mirrors `VirtualList`'s own selection/viewport so the footer and the auto-read
  // effect can read them without reaching into the list itself.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewportEnd, setViewportEnd] = useState(0);
  // Highest index already marked read this session, so scrolling back up doesn't
  // re-issue the same `MarkNotificationsRead` over and over.
  const markedThrough = useRef(-1);
  // Ids marked read this session by `m` — `ListNotifications` isn't refetched just to
  // reflect that locally (spec: manual refresh is fine, no push infra in v0).
  const [readOverride, setReadOverride] = useState<ReadonlySet<string>>(new Set());
  const [markStatus, setMarkStatus] = useState<'idle' | 'marking'>('idle');

  async function markAllRead(): Promise<void> {
    if (markStatus === 'marking') return;
    setMarkStatus('marking');
    try {
      const accessToken = await ensureAccessToken();
      await api.markNotificationsRead({ throughId: '', markAll: true }, accessToken);
      setReadOverride(new Set(notifications.map((notification) => notification.id)));
      markedThrough.current = notifications.length - 1;
      onReadStateChanged?.();
    } finally {
      setMarkStatus('idle');
    }
  }

  /** Marks everything down to `index` read (the list is newest-first, so `through_id`
   * covers exactly the ones already scrolled past). */
  const markReadThrough = useCallback(
    async (index: number): Promise<void> => {
      if (index <= markedThrough.current) return;
      const target = notifications[index];
      if (target === undefined) return;
      markedThrough.current = index;
      const covered = notifications.slice(0, index + 1);
      if (covered.every((notification) => present(notification.readAt))) return;
      try {
        const accessToken = await ensureAccessToken();
        await api.markNotificationsRead({ throughId: target.id, markAll: false }, accessToken);
        setReadOverride((current) => {
          const next = new Set(current);
          for (const notification of covered) next.add(notification.id);
          return next;
        });
        onReadStateChanged?.();
      } catch {
        // Marking read is best-effort: it is not worth an error banner over, and the
        // next poll of `GetUnreadCount` will simply show the badge again.
        markedThrough.current = index - 1;
      }
    },
    [api, ensureAccessToken, notifications, onReadStateChanged],
  );

  const visibleCount = Math.max(3, rows - 6);

  // Anything on screen for `AUTO_READ_DELAY_MS` counts as read. Debounced via the
  // effect's own cleanup, so a fast scroll through five screenfuls only marks the
  // one you stop on. `viewportEnd` comes straight from `VirtualList`'s own render —
  // it is the one component that actually knows which rows are on screen.
  useEffect(() => {
    if (!isActive || viewportEnd === 0) return;
    const timer = setTimeout(() => {
      void markReadThrough(viewportEnd - 1);
    }, AUTO_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isActive, viewportEnd, markReadThrough]);

  function openSelected(index: number, notification: Notification | undefined): void {
    if (notification === undefined) return;
    void markReadThrough(index);
    if (notification.postId !== '') onOpenPost(notification.postId);
    else if (present(notification.actor)) onOpenAuthor(notification.actor);
  }

  // Movement (`j`/`k`/`Ctrl+D`/`Ctrl+U`/`Home`/`End`) belongs to `VirtualList`; this
  // is only the screen's own verbs, gated the same way the old hand-rolled window was
  // — inert while the first page is still loading.
  useInput(
    (input) => {
      if (input === 'm') {
        void markAllRead();
        return;
      }
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
      }
    },
    { isActive: isActive && !loading },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Notifications</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1} flexDirection="column">
        {notifications.length === 0 && loading ? (
          <Loading label="Loading" />
        ) : (
          <VirtualList<Notification>
            items={notifications}
            keyOf={(notification) => notification.id}
            measure={() => 1}
            width={Math.max(10, columns - 2)}
            budget={visibleCount}
            isActive={isActive && !loading}
            showPosition={false}
            empty={<Text color={theme.muted}>Nothing yet.</Text>}
            onSelectionChange={(index) => setSelectedIndex(index)}
            onViewportChange={(_start, end) => setViewportEnd(end)}
            renderItem={(notification, state) => {
              const isRead = present(notification.readAt) || readOverride.has(notification.id);
              const createdAt = timestampToDate(notification.createdAt);
              const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
              return (
                <Box height={1} overflow="hidden" flexShrink={0} width={state.width}>
                  <Text color={state.selected ? theme.accent : theme.muted} bold={state.selected}>
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
            }}
            onKey={(input, key, notification, index) => {
              // `o` alongside `Enter`: a mention notification is usually something
              // you want to open, and `o` is "open" everywhere else in the app.
              if (key.return || input === 'o') {
                openSelected(index, notification);
                return true;
              }
              return false;
            }}
          />
        )}
      </Box>
      <Box marginTop={1}>
        {loading || loadingMore ? (
          <Loading label="Loading" />
        ) : (
          <Text color={theme.muted}>
            {notifications.length === 0
              ? ''
              : `${String(selectedIndex + 1)}/${String(notifications.length)}${
                  hasMore ? ' · ↓ n / space for more' : ' · end'
                }`}
          </Text>
        )}
      </Box>
    </Box>
  );
}
