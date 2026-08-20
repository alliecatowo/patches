import { useContentSize } from '../app/layout.js';
import { present } from '../api/present.js';
import { NOTIFICATION_TYPE, timestampToDate } from '@patches/proto';
import type { Actor, Notification } from '../api/wire/types.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { Loading } from '../components/Loading.js';
import { Nameplate } from '../components/Nameplate.js';
import { VirtualList } from '../components/VirtualList.js';
import { formatRelativeTime } from '../format/relative-time.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { useLinearMode } from '../hooks/useLinearMode.js';
import { useNow } from '../hooks/useNow.js';
import { theme } from '../theme/index.js';

/** How close together two same-type/same-post notifications have to land to collapse
 * into one row (design vision §5.6: "same type + same post within 10 min collapses"). */
const GROUP_WINDOW_MS = 10 * 60 * 1000;

export interface NotificationGroup {
  readonly type: Notification['type'];
  readonly postId: string;
  /** Newest-first, same order as the source list — `notifications[0]` is the row's
   * primary (the one `Enter`/`o` opens, and whose glyph/relative-time draws). */
  readonly notifications: readonly Notification[];
}

/**
 * Collapses consecutive same-type, same-post notifications no more than
 * {@link GROUP_WINDOW_MS} apart into one {@link NotificationGroup} (P12-107). Pure and
 * exported so the rule is unit-testable without rendering — the list is already
 * newest-first, so this only ever looks at the group it is currently extending.
 */
export function groupNotifications(
  notifications: readonly Notification[],
): readonly NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const notification of notifications) {
    const last = groups.at(-1);
    const lastItem = last?.notifications.at(-1);
    const lastCreatedAt = present(lastItem) ? timestampToDate(lastItem.createdAt) : undefined;
    const createdAt = timestampToDate(notification.createdAt);
    const withinWindow =
      last !== undefined &&
      last.type === notification.type &&
      last.postId === notification.postId &&
      present(lastCreatedAt) &&
      present(createdAt) &&
      Math.abs(lastCreatedAt.getTime() - createdAt.getTime()) <= GROUP_WINDOW_MS;
    if (withinWindow && last !== undefined) {
      groups[groups.length - 1] = { ...last, notifications: [...last.notifications, notification] };
    } else {
      groups.push({
        type: notification.type,
        postId: notification.postId,
        notifications: [notification],
      });
    }
  }
  return groups;
}

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
    case NOTIFICATION_TYPE.FOLLOW_REQUEST:
      return '?';
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
    case NOTIFICATION_TYPE.FOLLOW_REQUEST:
      // §197.5: accept/reject only happens on the dedicated `:followrequests`
      // screen (or the requester's own profile) — this row is a pointer, not an
      // inline actionable control.
      return 'wants to follow you — see :followrequests';
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

  // P12-107: consecutive same-type/same-post notifications collapse into one row.
  const groups = useMemo(() => groupNotifications(notifications), [notifications]);
  // The flat `notifications`-array index of the last (oldest) item each group covers —
  // `markReadThrough` below still takes a flat index (it is what `throughId` is keyed
  // to), so a group-list index only ever needs translating at the two call sites.
  const groupEndIndex = useMemo(() => {
    const ends: number[] = [];
    let flat = -1;
    for (const group of groups) {
      flat += group.notifications.length;
      ends.push(flat);
    }
    return ends;
  }, [groups]);
  const now = useNow();
  const linear = useLinearMode();

  // Mirrors `VirtualList`'s own selection/viewport so the footer and the auto-read
  // effect can read them without reaching into the list itself. Indices here are into
  // `groups`, one per rendered row — not the flat `notifications` array.
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
    const flatIndex = groupEndIndex[viewportEnd - 1];
    if (flatIndex === undefined) return;
    const timer = setTimeout(() => {
      void markReadThrough(flatIndex);
    }, AUTO_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isActive, viewportEnd, markReadThrough, groupEndIndex]);

  function openSelected(index: number, group: NotificationGroup | undefined): void {
    if (group === undefined) return;
    const flatIndex = groupEndIndex[index];
    if (flatIndex !== undefined) void markReadThrough(flatIndex);
    // The newest notification in the group is the one `Enter`/`o` opens — a grouped
    // `@erin +2 followed you` row opens @erin's profile, not the oldest follower's.
    const primary = group.notifications[0];
    if (primary === undefined) return;
    if (primary.postId !== '') onOpenPost(primary.postId);
    else if (present(primary.actor)) onOpenAuthor(primary.actor);
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
        {groups.length === 0 && loading ? (
          <Loading label="Loading" />
        ) : (
          <VirtualList<NotificationGroup>
            items={groups}
            keyOf={(group) => group.notifications[0]?.id ?? `${String(group.type)}:${group.postId}`}
            measure={() => 1}
            width={Math.max(10, columns - 2)}
            budget={visibleCount}
            isActive={isActive && !loading}
            showPosition={false}
            indexed={linear}
            empty={<Text color={theme.muted}>Nothing yet.</Text>}
            onSelectionChange={(index) => setSelectedIndex(index)}
            onViewportChange={(_start, end) => setViewportEnd(end)}
            renderItem={(group, state) => {
              const primary = group.notifications[0];
              const isRead = group.notifications.every(
                (notification) => present(notification.readAt) || readOverride.has(notification.id),
              );
              const createdAt = present(primary) ? timestampToDate(primary.createdAt) : undefined;
              const when = present(createdAt) ? formatRelativeTime(createdAt, now) : '';
              const othersCount = group.notifications.length - 1;
              return (
                <Box height={1} overflow="hidden" flexShrink={0} width={state.width}>
                  <Text color={state.selected ? theme.accent : theme.muted} bold={state.selected}>
                    {isRead ? ' ' : '•'} {typeIcon(group.type)}{' '}
                  </Text>
                  {present(primary?.actor) ? (
                    <Nameplate
                      handle={primary.actor.handle}
                      nameplate={primary.actor.nameplate ?? undefined}
                    />
                  ) : (
                    <Text color={theme.muted}>system</Text>
                  )}
                  {othersCount > 0 ? (
                    <Text color={theme.muted}> +{String(othersCount)}</Text>
                  ) : null}
                  <Text> {typeLabel(group.type)}</Text>
                  {when === '' ? null : <Text color={theme.muted}> · {when}</Text>}
                </Box>
              );
            }}
            onKey={(input, key, group, index) => {
              // `o` alongside `Enter`: a mention notification is usually something
              // you want to open, and `o` is "open" everywhere else in the app.
              if (key.return || input === 'o') {
                openSelected(index, group);
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
            {groups.length === 0
              ? ''
              : `${String(selectedIndex + 1)}/${String(groups.length)}${
                  hasMore ? ' · ↓ n / space for more' : ' · end'
                }`}
          </Text>
        )}
      </Box>
    </Box>
  );
}
