import type { Post } from '@patches/proto/es';
import { useCallback, useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api/client.js';
import { PostRow } from '../components/PostRow.js';

type Tab = 'home' | 'local';

export interface HomeScreenProps {
  viewerActorId?: string;
  onReply: (post: Post) => void;
  onQuote: (post: Post) => void;
  onEdit: (post: Post) => void;
  /** Opens a post author's Patches Page (`PageScreen`, B-082). */
  onOpenPage: (handle: string) => void;
}

/**
 * Home (follows) + local (every public post on this node) timelines. Both strictly
 * chronological, cursor-paginated (Amendment B §194 — never offset, never re-sorted) via
 * `FeedService.ListHomeFeed`/`ListLocalFeed`.
 */
export function HomeScreen({
  viewerActorId,
  onReply,
  onQuote,
  onEdit,
  onOpenPage,
}: HomeScreenProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('home');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string, replace: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const response =
          tab === 'home'
            ? await api.feeds.listHomeFeed({ cursor: nextCursor, limit: 30 })
            : await api.feeds.listLocalFeed({ cursor: nextCursor, limit: 30 });
        setPosts((current) => (replace ? response.posts : [...current, ...response.posts]));
        setCursor(response.page?.nextCursor ?? '');
        setHasMore(response.page?.hasMore ?? false);
      } catch {
        setError("Couldn't load this timeline. Pull to refresh.");
      } finally {
        setLoading(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    setPosts([]);
    setCursor('');
    setHasMore(true);
    void load('', true);
  }, [tab, load]);

  const emptyMessage =
    tab === 'home'
      ? 'No posts yet. Follow people to fill your home timeline.'
      : 'No posts on this node yet.';

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setTab('home')} style={styles.tabButton}>
          <Text style={tab === 'home' ? styles.tabLabelActive : styles.tabLabel}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('local')} style={styles.tabButton}>
          <Text style={tab === 'local' ? styles.tabLabelActive : styles.tabLabel}>
            Everyone here
          </Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => (
          <PostRow
            post={item}
            {...(viewerActorId === undefined ? {} : { viewerActorId })}
            onReply={onReply}
            onQuote={onQuote}
            onEdit={onEdit}
            onOpenPage={onOpenPage}
          />
        )}
        onEndReached={() => {
          if (hasMore && !loading) void load(cursor, false);
        }}
        onEndReachedThreshold={0.4}
        refreshing={loading && posts.length === 0}
        onRefresh={() => void load('', true)}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{emptyMessage}</Text> : undefined}
        ListFooterComponent={
          loading && posts.length > 0 ? <ActivityIndicator style={styles.footer} /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { color: '#888' },
  tabLabelActive: { color: '#fff', fontWeight: '700' },
  error: { color: '#ff6b6b', padding: 12 },
  empty: { color: '#888', padding: 24, textAlign: 'center' },
  footer: { marginVertical: 16 },
});
