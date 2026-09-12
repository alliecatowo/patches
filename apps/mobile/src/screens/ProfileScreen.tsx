import type { Actor, Post } from '@patches/proto/es';
import { useCallback, useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api/client.js';
import { PostRow } from '../components/PostRow.js';
import { normalizeHandle } from '../pages/document.js';
import { safePageHref } from '../pages/href.js';

export interface ProfileScreenProps {
  handle: string;
  viewerActorId?: string;
  onBack: () => void;
  /** Opens a user's Patches Page (`PageScreen`, B-082). */
  onOpenPage: (handle: string) => void;
  onReply?: (post: Post) => void;
  onQuote?: (post: Post) => void;
  onEdit?: (post: Post) => void;
}

export function ProfileScreen({
  handle,
  viewerActorId,
  onBack,
  onOpenPage,
  onReply,
  onQuote,
  onEdit,
}: ProfileScreenProps): JSX.Element {
  const normalizedHandle = normalizeHandle(handle);
  const [actorState, setActorState] = useState<
    { status: 'loading' } | { status: 'ready'; actor: Actor } | { status: 'error' }
  >({ status: 'loading' });

  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Fetch actor details
  useEffect(() => {
    let cancelled = false;
    setActorState({ status: 'loading' });
    api.actors
      .getActorByHandle({ handle: normalizedHandle })
      .then((response) => {
        if (!cancelled) {
          if (response.actor) {
            setActorState({ status: 'ready', actor: response.actor });
          } else {
            setActorState({ status: 'error' });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setActorState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedHandle]);

  // Fetch actor's posts timeline
  const loadPosts = useCallback(
    async (targetActorId: string, nextCursor: string, replace: boolean): Promise<void> => {
      setPostsLoading(true);
      setPostsError(null);
      try {
        const response = await api.feeds.listActorPosts({
          actorId: targetActorId,
          cursor: nextCursor,
          limit: 30,
        });
        setPosts((current) => (replace ? response.posts : [...current, ...response.posts]));
        setCursor(response.page?.nextCursor ?? '');
        setHasMore(response.page?.hasMore ?? false);
      } catch {
        setPostsError("Couldn't load posts.");
      } finally {
        setPostsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (actorState.status === 'ready') {
      setPosts([]);
      setCursor('');
      setHasMore(true);
      void loadPosts(actorState.actor.id, '', true);
    }
  }, [actorState, loadPosts]);

  const websiteHref =
    actorState.status === 'ready' && actorState.actor.website
      ? safePageHref(actorState.actor.website)
      : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.topNav}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          @{normalizedHandle}
        </Text>
      </View>

      {actorState.status === 'loading' ? (
        <ActivityIndicator style={styles.centerSpinner} />
      ) : actorState.status === 'error' ? (
        <View style={styles.paddingContainer}>
          <Text style={styles.errorText}>Couldn&apos;t load profile for @{normalizedHandle}.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.displayName}>
                {actorState.actor.displayName || actorState.actor.handle}
              </Text>
              <Text style={styles.handle}>@{actorState.actor.handle}</Text>

              {actorState.actor.bio !== '' ? (
                <Text style={styles.bio}>{actorState.actor.bio}</Text>
              ) : null}

              <View style={styles.metaRow}>
                {actorState.actor.location !== '' ? (
                  <Text style={styles.metaText}>📍 {actorState.actor.location}</Text>
                ) : null}
                {websiteHref !== null ? (
                  <TouchableOpacity onPress={() => void Linking.openURL(websiteHref)}>
                    <Text style={styles.websiteLink}>🔗 {actorState.actor.website}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.pageButton}
                onPress={() => onOpenPage(actorState.actor.handle)}
              >
                <Text style={styles.pageButtonText}>View Patches Page →</Text>
              </TouchableOpacity>
            </View>
          }
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
            if (actorState.status === 'ready' && hasMore && !postsLoading) {
              void loadPosts(actorState.actor.id, cursor, false);
            }
          }}
          onEndReachedThreshold={0.4}
          refreshing={postsLoading && posts.length === 0}
          onRefresh={() => {
            if (actorState.status === 'ready') void loadPosts(actorState.actor.id, '', true);
          }}
          ListEmptyComponent={
            !postsLoading ? (
              <Text style={styles.empty}>
                {postsError ? postsError : 'No posts from this user yet.'}
              </Text>
            ) : undefined
          }
          ListFooterComponent={
            postsLoading && posts.length > 0 ? (
              <ActivityIndicator style={styles.footerSpinner} />
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  backButton: { color: '#7c9cff', fontWeight: '600' },
  navTitle: { color: '#fff', fontWeight: '700', flexShrink: 1 },
  centerSpinner: { marginTop: 32 },
  paddingContainer: { padding: 24 },
  errorText: { color: '#ff6b6b', textAlign: 'center' },
  header: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  displayName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  handle: { color: '#888', fontSize: 14, marginTop: 2 },
  bio: { color: '#e5e5e5', fontSize: 15, lineHeight: 20, marginTop: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaText: { color: '#888', fontSize: 13 },
  websiteLink: { color: '#7c9cff', fontSize: 13 },
  pageButton: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3a3c',
  },
  pageButtonText: { color: '#7c9cff', fontWeight: '600', fontSize: 14 },
  empty: { color: '#888', padding: 24, textAlign: 'center' },
  footerSpinner: { marginVertical: 16 },
});
