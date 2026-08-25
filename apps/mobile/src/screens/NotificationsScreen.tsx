import { NotificationType, type Notification } from '@patches/proto/es';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '../api/client.js';
import { formatRelativeTime } from '../lib/format.js';

function describe(notification: Notification): string {
  const handle = notification.actor?.handle ?? 'someone';
  switch (notification.type) {
    case NotificationType.FOLLOW:
      return `@${handle} followed you`;
    case NotificationType.FOLLOW_REQUEST:
      return `@${handle} requested to follow you`;
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
    case NotificationType.SECURITY:
      return 'A recovery code was used to sign in to your account';
    default:
      return 'New notification';
  }
}

/** Chronological, never engagement-ranked (Amendment B §194). Pending follow requests
 * (locked accounts, spec §197.5) are a separate `SocialGraphService` surface — out of
 * scope for this slice, unlike `apps/web`'s `NotificationsRoute` which also inlines them. */
export function NotificationsScreen(): JSX.Element {
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor: string, replace: boolean): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.notifications.listNotifications({ cursor: nextCursor, limit: 30 });
      setItems((current) =>
        replace ? response.notifications : [...current, ...response.notifications],
      );
      setCursor(response.page?.nextCursor ?? '');
      setHasMore(response.page?.hasMore ?? false);
    } catch {
      setError("Couldn't load notifications. Pull to refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('', true);
  }, [load]);

  const markAllRead = async (): Promise<void> => {
    try {
      await api.notifications.markNotificationsRead({ markAll: true, throughId: '' });
      void load('', true);
    } catch {
      // Best-effort — the list still reflects server state next time it loads.
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={() => void markAllRead()}>
          <Text style={styles.markRead}>Mark all read</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(notification) => notification.id}
        renderItem={({ item }) => (
          <View style={[styles.row, item.readAt ? null : styles.unread]}>
            <Text style={styles.rowText}>{describe(item)}</Text>
            <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
        )}
        onEndReached={() => {
          if (hasMore && !loading) void load(cursor, false);
        }}
        onEndReachedThreshold={0.4}
        refreshing={loading && items.length === 0}
        onRefresh={() => void load('', true)}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No notifications yet.</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  markRead: { color: '#7c9cff' },
  error: { color: '#ff6b6b', padding: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  unread: { backgroundColor: '#15151a' },
  rowText: { color: '#e5e5e5', flexShrink: 1, marginRight: 8 },
  time: { color: '#666' },
  empty: { color: '#888', padding: 24, textAlign: 'center' },
});
